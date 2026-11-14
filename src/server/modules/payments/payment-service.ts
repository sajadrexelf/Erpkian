import type { CurrencyCode } from '../../../shared/contracts';
import { allocatePaymentFifo, convertToIrr, validateSayadId } from '../../../shared/decimal-math';
import { jalaliToIso, validateJalaliDate } from '../../../shared/jalali';
import type { ErpkianDb } from '../../db/schema';
import {
  ErpkianAppError,
  newId,
  recordAuditLog,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';

export interface CreatePaymentInput {
  contactId: string;
  direction?: 'RECEIPT_IN' | 'PAYMENT_OUT';
  method: 'CASH' | 'POS' | 'TRANSFER' | 'CHEQUE';
  sourceCurrencyCode: CurrencyCode;
  exchangeRateToBase?: number | null;
  amountSource: number;
  trackingCode?: string;
  paymentJalali: string;
  allocationMode: 'FIFO_AUTO' | 'EXPLICIT' | 'NONE';
  explicitAllocations?: Array<{ invoiceId: string; allocatedAmountIrr: number }>;
  cheque?: {
    sayadId: string;
    dueJalali: string;
  };
}

function getInvoiceOpenBalanceIrr(db: ErpkianDb, organizationId: string, invoiceId: string): number {
  const row = db
    .prepare(
      `SELECT i.net_total_irr,
              COALESCE((
                SELECT SUM(pa.allocated_amount_irr)
                FROM payment_allocations pa
                JOIN payments p ON p.id = pa.payment_id
                LEFT JOIN checks ch ON ch.payment_id = p.id
                WHERE pa.organization_id = i.organization_id
                  AND pa.invoice_id = i.id
                  AND pa.status = 'ACTIVE'
                  AND p.lifecycle_status = 'Posted'
                  AND (p.method <> 'CHEQUE' OR ch.current_status = 'CLEARED')
              ), 0) as cleared_paid
       FROM invoices i
       WHERE i.organization_id = ? AND i.id = ? AND i.lifecycle_status = 'Posted'`
    )
    .get(organizationId, invoiceId) as { net_total_irr: number; cleared_paid: number } | undefined;

  if (!row) return 0;
  return Math.max(0, row.net_total_irr - row.cleared_paid);
}

export function listPaymentsAndChecks(db: ErpkianDb, ctx: TenantMembershipContext) {
  const payments = db
    .prepare(
      `SELECT p.*, c.canonical_name as contact_name,
              ch.id as check_id, ch.sayad_id, ch.due_jalali as check_due_jalali, ch.current_status as check_status,
              COALESCE((SELECT SUM(pa.allocated_amount_irr) FROM payment_allocations pa WHERE pa.payment_id = p.id AND pa.status = 'ACTIVE'), 0) as allocated_total_irr
       FROM payments p
       JOIN contacts c ON c.id = p.contact_id
       LEFT JOIN checks ch ON ch.payment_id = p.id
       WHERE p.organization_id = ?
       ORDER BY p.payment_date_iso DESC, p.created_at DESC`
    )
    .all(ctx.organizationId) as Array<Record<string, unknown>>;

  const enrichedPayments = payments.map((p) => {
    const allocations = db
      .prepare(
        `SELECT pa.*, i.invoice_number
         FROM payment_allocations pa
         JOIN invoices i ON i.id = pa.invoice_id
         WHERE pa.organization_id = ? AND pa.payment_id = ?`
      )
      .all(ctx.organizationId, String(p.id));
    return { ...p, allocations };
  });

  const checks = db
    .prepare(
      `SELECT ch.*, c.canonical_name as contact_name
       FROM checks ch
       JOIN contacts c ON c.id = ch.contact_id
       WHERE ch.organization_id = ?
       ORDER BY ch.due_date_iso ASC`
    )
    .all(ctx.organizationId);

  return { payments: enrichedPayments, checks };
}

export function createPaymentWithAllocation(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  input: CreatePaymentInput,
  idempotencyKey?: string
) {
  requirePermission(db, ctx, 'payment:post');

  const contact = db
    .prepare(`SELECT id, canonical_name FROM contacts WHERE organization_id = ? AND id = ? AND status = 'ACTIVE'`)
    .get(ctx.organizationId, input.contactId) as { id: string; canonical_name: string } | undefined;
  if (!contact) {
    throw new ErpkianAppError(404, 'CONTACT_NOT_FOUND', 'طرف‌حساب یافت نشد.');
  }

  const dateChk = validateJalaliDate(input.paymentJalali);
  if (!dateChk.valid || !dateChk.parsed) {
    throw new ErpkianAppError(400, dateChk.errorCode ?? 'INVALID_JALALI_DATE', dateChk.messageFa ?? 'تاریخ پرداخت نامعتبر است.');
  }
  const payIso = jalaliToIso(dateChk.parsed.formatted);

  const fp = db
    .prepare('SELECT id, name_fa, status FROM fiscal_periods WHERE organization_id = ? AND start_date_iso <= ? AND end_date_iso >= ? LIMIT 1')
    .get(ctx.organizationId, payIso, payIso) as { id: string; name_fa: string; status: string } | undefined;
  if (fp && fp.status !== 'OPEN') {
    throw new ErpkianAppError(409, 'FISCAL_PERIOD_LOCKED', `ثبت دریافت/پرداخت در دوره مالی قفل‌شده «${fp.name_fa}» مجاز نیست.`);
  }

  const conv = convertToIrr({
    amount: input.amountSource,
    sourceCurrencyCode: input.sourceCurrencyCode,
    explicitRateToBase: input.exchangeRateToBase,
  });
  if (!conv.ok) {
    throw new ErpkianAppError(400, conv.code, conv.messageFa);
  }
  if (conv.amountIrr <= 0) {
    throw new ErpkianAppError(400, 'PAYMENT_AMOUNT_MUST_BE_POSITIVE', 'مبلغ پرداخت باید بزرگتر از صفر باشد.');
  }

  let checkDueIso = '';
  let checkDueJalali = '';
  let cleanSayad = '';
  if (input.method === 'CHEQUE') {
    requirePermission(db, ctx, 'check:manage');
    if (!input.cheque?.sayadId || !validateSayadId(input.cheque.sayadId)) {
      throw new ErpkianAppError(400, 'INVALID_SAYAD_ID', 'شناسه صیادی چک باید دقیقاً ۱۶ رقم باشد.');
    }
    cleanSayad = input.cheque.sayadId.trim();
    const chkDate = validateJalaliDate(input.cheque.dueJalali);
    if (!chkDate.valid || !chkDate.parsed) {
      throw new ErpkianAppError(400, 'INVALID_CHECK_DUE_DATE', chkDate.messageFa ?? 'تاریخ سررسید چک نامعتبر است.');
    }
    checkDueJalali = chkDate.parsed.formatted;
    checkDueIso = jalaliToIso(checkDueJalali);
  }

  const paymentId = newId('pay');
  const now = new Date().toISOString();
  const branchRow = db
    .prepare('SELECT id FROM branches WHERE organization_id = ? ORDER BY id ASC LIMIT 1')
    .get(ctx.organizationId) as { id: string } | undefined;

  let plannedAllocations: Array<{ invoiceId: string; allocatedAmountIrr: number; method: 'EXPLICIT' | 'FIFO_AUTO' }> = [];
  let unallocatedCreditIrr = conv.amountIrr;

  if (input.allocationMode === 'EXPLICIT') {
    const items = input.explicitAllocations ?? [];
    const sum = items.reduce((s, a) => s + a.allocatedAmountIrr, 0);
    if (sum > conv.amountIrr) {
      throw new ErpkianAppError(
        400,
        'ALLOCATION_EXCEEDS_PAYMENT',
        `مجموع مبلغ تخصیص (${sum.toLocaleString('fa-IR')}) از مبلغ دریافتی (${conv.amountIrr.toLocaleString('fa-IR')}) بیشتر است.`
      );
    }
    for (const item of items) {
      if (item.allocatedAmountIrr <= 0) {
        throw new ErpkianAppError(400, 'INVALID_ALLOCATION_AMOUNT', 'مبلغ تخصیص باید بزرگتر از صفر باشد.');
      }
      const openBal = getInvoiceOpenBalanceIrr(db, ctx.organizationId, item.invoiceId);
      if (openBal <= 0) {
        throw new ErpkianAppError(409, 'INVOICE_NOT_OPEN_FOR_ALLOCATION', 'فاکتور انتخاب‌شده قطعی نیست یا مانده باز ندارد.');
      }
      if (item.allocatedAmountIrr > openBal) {
        throw new ErpkianAppError(
          409,
          'ALLOCATION_EXCEEDS_INVOICE_OPEN_BALANCE',
          `مبلغ تخصیص (${item.allocatedAmountIrr.toLocaleString('fa-IR')}) از مانده باز فاکتور (${openBal.toLocaleString('fa-IR')}) بیشتر است.`
        );
      }
      plannedAllocations.push({ invoiceId: item.invoiceId, allocatedAmountIrr: item.allocatedAmountIrr, method: 'EXPLICIT' });
    }
    unallocatedCreditIrr = conv.amountIrr - sum;
  } else if (input.allocationMode === 'FIFO_AUTO') {
    const openInvs = db
      .prepare(
        `SELECT id, issue_date_iso
         FROM invoices
         WHERE organization_id = ? AND contact_id = ? AND lifecycle_status = 'Posted' AND invoice_direction = 'SALE'
         ORDER BY issue_date_iso ASC, created_at ASC`
      )
      .all(ctx.organizationId, input.contactId) as Array<{ id: string }>;

    const openList = openInvs
      .map((i) => ({ invoiceId: i.id, openBalanceIrr: getInvoiceOpenBalanceIrr(db, ctx.organizationId, i.id) }))
      .filter((i) => i.openBalanceIrr > 0);

    const fifo = allocatePaymentFifo(conv.amountIrr, openList);
    plannedAllocations = fifo.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      allocatedAmountIrr: a.allocatedAmountIrr,
      method: 'FIFO_AUTO',
    }));
    unallocatedCreditIrr = fifo.unallocatedCreditIrr;
  }

  let checkId: string | null = null;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO payments
       (id, organization_id, branch_id, fiscal_period_id, direction, contact_id, method, source_currency_code, exchange_rate_to_base,
        amount_irr, tracking_code, payment_date_iso, payment_jalali, lifecycle_status, idempotency_key, created_by_membership_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?)`
    ).run(
      paymentId,
      ctx.organizationId,
      ctx.branchScopeId ?? branchRow?.id ?? 'br-aria-hq',
      fp?.id ?? null,
      input.direction ?? 'RECEIPT_IN',
      input.contactId,
      input.method,
      input.sourceCurrencyCode,
      conv.rateApplied,
      conv.amountIrr,
      input.trackingCode ?? (cleanSayad ? `SAYAD-${cleanSayad.slice(-6)}` : null),
      payIso,
      dateChk.parsed!.formatted,
      idempotencyKey ?? null,
      ctx.membershipId,
      now
    );

    if (input.method === 'CHEQUE') {
      checkId = newId('chk');
      db.prepare(
        `INSERT INTO checks (id, organization_id, payment_id, contact_id, check_direction, sayad_id, amount_irr, due_date_iso, due_jalali, current_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_HAND', ?)`
      ).run(
        checkId,
        ctx.organizationId,
        paymentId,
        input.contactId,
        (input.direction ?? 'RECEIPT_IN') === 'RECEIPT_IN' ? 'RECEIVABLE' : 'PAYABLE',
        cleanSayad,
        conv.amountIrr,
        checkDueIso,
        checkDueJalali,
        now
      );

      db.prepare(
        `INSERT INTO check_status_history (id, organization_id, check_id, from_status, to_status, note_fa, actor_membership_id, occurred_at)
         VALUES (?, ?, ?, NULL, 'IN_HAND', 'ثبت اولیه چک صیادی در صندوق', ?, ?)`
      ).run(newId('chkh'), ctx.organizationId, checkId, ctx.membershipId, now);
    }

    const insAlloc = db.prepare(
      `INSERT INTO payment_allocations (id, organization_id, payment_id, invoice_id, allocated_amount_irr, allocation_method, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`
    );
    for (const alloc of plannedAllocations) {
      insAlloc.run(newId('alloc'), ctx.organizationId, paymentId, alloc.invoiceId, alloc.allocatedAmountIrr, alloc.method, now);
    }

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'PAYMENT',
      entityId: paymentId,
      action: input.method === 'CHEQUE' ? 'FIN_AR_PAY_002_CHEQUE_RECORDED' : 'FIN_AR_PAY_002_POSTED',
      actorMembershipId: ctx.membershipId,
      afterState: {
        amount_irr: conv.amountIrr,
        method: input.method,
        allocations: plannedAllocations,
        unallocated_credit_irr: unallocatedCreditIrr,
        check_id: checkId,
      },
    });
  })();

  return {
    payment_id: paymentId,
    amount_irr: conv.amountIrr,
    method: input.method,
    check_id: checkId,
    check_status: input.method === 'CHEQUE' ? 'IN_HAND' : null,
    allocations: plannedAllocations,
    unallocated_credit_irr: unallocatedCreditIrr,
  };
}

const VALID_CHECK_TRANSITIONS: Record<string, string[]> = {
  IN_HAND: ['DEPOSITED', 'ENDORSED', 'CANCELLED'],
  DEPOSITED: ['CLEARED', 'BOUNCED'],
  ENDORSED: ['CLEARED', 'BOUNCED'],
  BOUNCED: ['DEPOSITED', 'CANCELLED'],
  CLEARED: [],
  CANCELLED: [],
};

export function transitionCheckStatus(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  checkId: string,
  toStatus: 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'CANCELLED',
  noteFa?: string
) {
  requirePermission(db, ctx, 'check:manage');

  const chk = db
    .prepare('SELECT * FROM checks WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, checkId) as
    | { id: string; current_status: string; payment_id: string; amount_irr: number; sayad_id: string }
    | undefined;
  if (!chk) {
    throw new ErpkianAppError(404, 'CHECK_NOT_FOUND', 'چک صیادی یافت نشد.');
  }

  const allowed = VALID_CHECK_TRANSITIONS[chk.current_status] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new ErpkianAppError(
      409,
      'INVALID_CHECK_STATE_TRANSITION',
      `تغییر وضعیت چک از ${chk.current_status} به ${toStatus} مجاز نیست.`
    );
  }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE checks SET current_status = ? WHERE id = ? AND organization_id = ?')
      .run(toStatus, checkId, ctx.organizationId);

    db.prepare(
      `INSERT INTO check_status_history (id, organization_id, check_id, from_status, to_status, note_fa, actor_membership_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newId('chkh'), ctx.organizationId, checkId, chk.current_status, toStatus, noteFa ?? null, ctx.membershipId, now);

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'CHECK',
      entityId: checkId,
      action: `TRS_CHK_001_${toStatus}`,
      actorMembershipId: ctx.membershipId,
      beforeState: { current_status: chk.current_status },
      afterState: { current_status: toStatus, sayad_id: chk.sayad_id, note_fa: noteFa ?? null },
    });
  })();

  return { check_id: checkId, from_status: chk.current_status, to_status: toStatus };
}
