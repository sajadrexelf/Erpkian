import type { CurrencyCode, InvoiceDirection } from '../../../shared/contracts';
import { calculateInvoiceDeterministic, type InvoiceLineInput } from '../../../shared/decimal-math';
import { jalaliToIso, validateJalaliDate } from '../../../shared/jalali';
import type { ErpkianDb } from '../../db/schema';
import {
  ErpkianAppError,
  newId,
  recordAuditLog,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';

export interface CreateInvoiceInput {
  invoiceDirection: InvoiceDirection;
  invoiceNumber: string;
  contactId: string;
  primaryDocumentId?: string | null;
  branchId?: string | null;
  issueJalali: string;
  dueJalali: string;
  sourceCurrencyCode: CurrencyCode;
  exchangeRateToBase?: number | null;
  invoiceDiscountSource?: number;
  invoiceDiscountTaxMode?: 'PRE_TAX_PRORATA' | 'POST_TAX_DISCOUNT';
  lines: InvoiceLineInput[];
}

function getOrgDefaultBranchId(db: ErpkianDb, organizationId: string): string {
  const row = db
    .prepare('SELECT id FROM branches WHERE organization_id = ? ORDER BY id ASC LIMIT 1')
    .get(organizationId) as { id: string } | undefined;
  return row?.id ?? 'br-aria-hq';
}

export function listInvoices(db: ErpkianDb, ctx: TenantMembershipContext) {
  const invoices = db
    .prepare(
      `SELECT i.*, c.canonical_name as contact_name,
              fp.name_fa as fiscal_period_name, fp.status as fiscal_period_status,
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
              ), 0) as cleared_paid_irr,
              COALESCE((
                SELECT SUM(ch.amount_irr)
                FROM checks ch
                JOIN payments p ON p.id = ch.payment_id
                WHERE ch.organization_id = i.organization_id
                  AND ch.contact_id = i.contact_id
                  AND ch.current_status IN ('IN_HAND', 'DEPOSITED')
              ), 0) as contact_pending_cheques_irr
       FROM invoices i
       JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN fiscal_periods fp ON fp.id = i.fiscal_period_id
       WHERE i.organization_id = ?
       ORDER BY i.issue_date_iso DESC, i.created_at DESC`
    )
    .all(ctx.organizationId) as Array<Record<string, unknown>>;

  return invoices.map((inv) => {
    const netTotal = Number(inv.net_total_irr || 0);
    const cleared = Number(inv.cleared_paid_irr || 0);
    const lines = db
      .prepare('SELECT * FROM invoice_lines WHERE organization_id = ? AND invoice_id = ? ORDER BY line_number ASC')
      .all(ctx.organizationId, String(inv.id));
    const approval = db
      .prepare('SELECT * FROM approval_requests WHERE organization_id = ? AND target_entity_id = ? ORDER BY requested_at DESC LIMIT 1')
      .get(ctx.organizationId, String(inv.id));
    return {
      ...inv,
      open_balance_irr: inv.lifecycle_status === 'Posted' ? Math.max(0, netTotal - cleared) : 0,
      lines,
      pending_approval: approval ?? null,
    };
  });
}

export function createInvoice(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  input: CreateInvoiceInput,
  idempotencyKey?: string
) {
  requirePermission(db, ctx, 'invoice:draft');

  const contact = db
    .prepare(`SELECT id FROM contacts WHERE organization_id = ? AND id = ? AND status = 'ACTIVE'`)
    .get(ctx.organizationId, input.contactId);
  if (!contact) {
    throw new ErpkianAppError(404, 'CONTACT_NOT_FOUND', 'طرف‌حساب انتخاب‌شده در این سازمان یافت نشد.');
  }

  const issueChk = validateJalaliDate(input.issueJalali);
  if (!issueChk.valid || !issueChk.parsed) {
    throw new ErpkianAppError(400, issueChk.errorCode ?? 'INVALID_JALALI_DATE', issueChk.messageFa ?? 'تاریخ صدور نامعتبر است.');
  }
  const dueChk = validateJalaliDate(input.dueJalali);
  if (!dueChk.valid || !dueChk.parsed) {
    throw new ErpkianAppError(400, dueChk.errorCode ?? 'INVALID_JALALI_DATE', dueChk.messageFa ?? 'تاریخ سررسید نامعتبر است.');
  }

  const issueIso = jalaliToIso(issueChk.parsed.formatted);
  const dueIso = jalaliToIso(dueChk.parsed.formatted);
  if (dueIso < issueIso) {
    throw new ErpkianAppError(400, 'DUE_DATE_BEFORE_ISSUE_DATE', 'تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد.');
  }

  // Resolve product UoM conversion rates from DB if productId is supplied
  const enrichedLines: InvoiceLineInput[] = input.lines.map((line) => {
    if (line.productId && (!line.conversionToBase || line.conversionToBase === 1) && line.uomName) {
      const pu = db
        .prepare('SELECT conversion_to_base FROM product_units WHERE organization_id = ? AND product_id = ? AND uom_name = ?')
        .get(ctx.organizationId, line.productId, line.uomName) as { conversion_to_base: number } | undefined;
      if (pu) {
        return { ...line, conversionToBase: pu.conversion_to_base };
      }
    }
    return line;
  });

  const calc = calculateInvoiceDeterministic({
    sourceCurrencyCode: input.sourceCurrencyCode,
    exchangeRateToBase: input.exchangeRateToBase,
    invoiceDiscountSource: input.invoiceDiscountSource ?? 0,
    invoiceDiscountTaxMode: input.invoiceDiscountTaxMode ?? 'PRE_TAX_PRORATA',
    lines: enrichedLines,
  });

  if (!calc.valid) {
    throw new ErpkianAppError(400, calc.errors[0].code, calc.errors[0].messageFa, { errors: calc.errors });
  }

  const fp = db
    .prepare('SELECT id FROM fiscal_periods WHERE organization_id = ? AND start_date_iso <= ? AND end_date_iso >= ? LIMIT 1')
    .get(ctx.organizationId, issueIso, issueIso) as { id: string } | undefined;

  const invId = newId('inv');
  const now = new Date().toISOString();
  const branchId = input.branchId || ctx.branchScopeId || getOrgDefaultBranchId(db, ctx.organizationId);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO invoices
       (id, organization_id, branch_id, fiscal_period_id, invoice_direction, invoice_number, contact_id, primary_document_id,
        issue_date_iso, issue_jalali, due_date_iso, due_jalali, source_currency_code, exchange_rate_to_base,
        subtotal_irr, line_discount_total_irr, invoice_discount_irr, tax_total_irr, net_total_irr, lifecycle_status,
        idempotency_key, created_by_membership_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Needs Review', ?, ?, ?)`
    ).run(
      invId,
      ctx.organizationId,
      branchId,
      fp?.id ?? null,
      input.invoiceDirection,
      input.invoiceNumber.trim(),
      input.contactId,
      input.primaryDocumentId ?? null,
      issueIso,
      issueChk.parsed!.formatted,
      dueIso,
      dueChk.parsed!.formatted,
      input.sourceCurrencyCode,
      calc.rateApplied,
      calc.subtotalIrr,
      calc.lineDiscountTotalIrr,
      calc.invoiceDiscountIrr,
      calc.taxTotalIrr,
      calc.netTotalIrr,
      idempotencyKey ?? null,
      ctx.membershipId,
      now
    );

    const insLine = db.prepare(
      `INSERT INTO invoice_lines
       (id, organization_id, invoice_id, line_number, product_id, description, uom_name, conversion_to_base, quantity, base_quantity,
        unit_price_irr, is_promotional_free_item, promo_reason, discount_pct, discount_amount_irr, tax_rate_pct, tax_amount_irr, net_line_amount_irr)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const line of calc.lines) {
      insLine.run(
        newId('inl'),
        ctx.organizationId,
        invId,
        line.lineNumber,
        line.productId,
        line.description,
        line.uomName,
        line.conversionToBase,
        line.quantity,
        line.baseQuantity,
        line.unitPriceIrr,
        line.isPromotionalFreeItem ? 1 : 0,
        line.promoReason,
        line.discountPct,
        line.lineDiscountIrr,
        line.taxRatePct,
        line.lineTaxIrr,
        line.lineNetIrr
      );
    }

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'INVOICE',
      entityId: invId,
      action: 'FIN_AR_INV_001_CREATED',
      actorMembershipId: ctx.membershipId,
      sourceDocumentId: input.primaryDocumentId ?? null,
      afterState: {
        invoice_number: input.invoiceNumber.trim(),
        lifecycle_status: 'Needs Review',
        net_total_irr: calc.netTotalIrr,
      },
    });
  })();

  return {
    id: invId,
    invoice_number: input.invoiceNumber.trim(),
    lifecycle_status: 'Needs Review',
    subtotal_irr: calc.subtotalIrr,
    tax_total_irr: calc.taxTotalIrr,
    net_total_irr: calc.netTotalIrr,
    warnings: calc.warnings,
  };
}

export function verifyInvoice(db: ErpkianDb, ctx: TenantMembershipContext, invoiceId: string) {
  requirePermission(db, ctx, 'invoice:verify');
  const inv = db
    .prepare('SELECT id, lifecycle_status, primary_document_id FROM invoices WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, invoiceId) as { id: string; lifecycle_status: string; primary_document_id: string | null } | undefined;

  if (!inv) {
    throw new ErpkianAppError(404, 'INVOICE_NOT_FOUND', 'فاکتور یافت نشد.');
  }
  if (inv.lifecycle_status === 'Posted' || inv.lifecycle_status === 'Reversed') {
    throw new ErpkianAppError(409, 'INVALID_STATE_TRANSITION', `فاکتور در وضعیت ${inv.lifecycle_status} قابل بازگشت به Verified نیست.`);
  }

  db.transaction(() => {
    db.prepare(`UPDATE invoices SET lifecycle_status = 'Verified' WHERE id = ? AND organization_id = ?`)
      .run(invoiceId, ctx.organizationId);
    if (inv.primary_document_id) {
      db.prepare(`UPDATE documents SET lifecycle_status = 'Verified', updated_at = ? WHERE id = ? AND organization_id = ?`)
        .run(new Date().toISOString(), inv.primary_document_id, ctx.organizationId);
    }
    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'INVOICE',
      entityId: invoiceId,
      action: 'INVOICE_VERIFIED',
      actorMembershipId: ctx.membershipId,
      sourceDocumentId: inv.primary_document_id,
      beforeState: { lifecycle_status: inv.lifecycle_status },
      afterState: { lifecycle_status: 'Verified' },
    });
  })();

  return { id: invoiceId, lifecycle_status: 'Verified' };
}

function finalizeInvoicePostingTx(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  inv: {
    id: string;
    branch_id: string | null;
    fiscal_period_id: string | null;
    invoice_direction: InvoiceDirection;
    invoice_number: string;
    primary_document_id: string | null;
    issue_date_iso: string;
    net_total_irr: number;
    lifecycle_status: string;
  },
  allowNegativeStock: boolean
) {
  // Check Fiscal Period Lock (CLOSED or SOFT_LOCKED blocks regular posting)
  const fp = inv.fiscal_period_id
    ? (db
        .prepare('SELECT id, name_fa, status FROM fiscal_periods WHERE organization_id = ? AND id = ?')
        .get(ctx.organizationId, inv.fiscal_period_id) as { id: string; name_fa: string; status: string } | undefined)
    : (db
        .prepare('SELECT id, name_fa, status FROM fiscal_periods WHERE organization_id = ? AND start_date_iso <= ? AND end_date_iso >= ? LIMIT 1')
        .get(ctx.organizationId, inv.issue_date_iso, inv.issue_date_iso) as { id: string; name_fa: string; status: string } | undefined);

  if (fp && fp.status !== 'OPEN') {
    throw new ErpkianAppError(
      409,
      'FISCAL_PERIOD_LOCKED',
      `ثبت قطعی در دوره مالی «${fp.name_fa}» با وضعیت ${fp.status} مجاز نیست.`
    );
  }

  // Check inventory stock & insert inventory movements
  const lines = db
    .prepare('SELECT * FROM invoice_lines WHERE organization_id = ? AND invoice_id = ?')
    .all(ctx.organizationId, inv.id) as Array<{
      id: string;
      product_id: string | null;
      description: string;
      uom_name: string;
      quantity: number;
      base_quantity: number;
    }>;

  const isOutbound = inv.invoice_direction === 'SALE' || inv.invoice_direction === 'PURCHASE_RETURN';
  const movementType =
    inv.invoice_direction === 'SALE'
      ? 'SALE_OUT'
      : inv.invoice_direction === 'PURCHASE'
        ? 'PURCHASE_IN'
        : inv.invoice_direction === 'SALE_RETURN'
          ? 'RETURN_IN'
          : 'RETURN_OUT';

  const now = new Date().toISOString();

  for (const line of lines) {
    if (!line.product_id) continue;
    const stockRow = db
      .prepare('SELECT COALESCE(SUM(base_qty_signed), 0) as qty FROM inventory_movements WHERE organization_id = ? AND product_id = ?')
      .get(ctx.organizationId, line.product_id) as { qty: number };

    const currentStock = Number(stockRow?.qty ?? 0);
    const signedDelta = isOutbound ? -Number(line.base_quantity) : Number(line.base_quantity);
    if (isOutbound && !allowNegativeStock && currentStock + signedDelta < 0) {
      throw new ErpkianAppError(
        409,
        'NEGATIVE_STOCK_FORBIDDEN',
        `موجودی کالای «${line.description}» کافی نیست (موجودی فعلی: ${currentStock}، مقدار درخواستی: ${line.base_quantity}).`
      );
    }

    db.prepare(
      `INSERT INTO inventory_movements
       (id, organization_id, branch_id, product_id, movement_type, source_uom_name, source_qty, base_qty_signed, unit_cost_irr, source_entity_type, source_entity_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'INVOICE', ?, ?)`
    ).run(
      newId('mov'),
      ctx.organizationId,
      inv.branch_id ?? getOrgDefaultBranchId(db, ctx.organizationId),
      line.product_id,
      movementType,
      line.uom_name,
      line.quantity,
      signedDelta,
      inv.id,
      now
    );
  }

  db.prepare(
    `UPDATE invoices SET lifecycle_status = 'Posted', posted_by_membership_id = ?, posted_at = ? WHERE id = ? AND organization_id = ?`
  ).run(ctx.membershipId, now, inv.id, ctx.organizationId);

  if (inv.primary_document_id) {
    db.prepare(`UPDATE documents SET lifecycle_status = 'Posted', updated_at = ? WHERE id = ? AND organization_id = ?`)
      .run(now, inv.primary_document_id, ctx.organizationId);
  }

  recordAuditLog(db, {
    organizationId: ctx.organizationId,
    entityType: 'INVOICE',
    entityId: inv.id,
    action: 'DOC_POST_008_POSTED',
    actorMembershipId: ctx.membershipId,
    sourceDocumentId: inv.primary_document_id,
    beforeState: { lifecycle_status: inv.lifecycle_status },
    afterState: { lifecycle_status: 'Posted', net_total_irr: inv.net_total_irr },
  });
}

/**
 * DOC-POST-008: Posting Gate with Fiscal Period Lock, Negative Stock Guard, and Dual Approval threshold.
 */
export function postInvoice(db: ErpkianDb, ctx: TenantMembershipContext, invoiceId: string) {
  requirePermission(db, ctx, 'invoice:post');

  const inv = db
    .prepare('SELECT * FROM invoices WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, invoiceId) as
    | {
        id: string;
        branch_id: string | null;
        fiscal_period_id: string | null;
        invoice_direction: InvoiceDirection;
        invoice_number: string;
        primary_document_id: string | null;
        issue_date_iso: string;
        net_total_irr: number;
        lifecycle_status: string;
      }
    | undefined;

  if (!inv) {
    throw new ErpkianAppError(404, 'INVOICE_NOT_FOUND', 'فاکتور یافت نشد.');
  }
  if (inv.lifecycle_status === 'Posted') {
    return { id: inv.id, lifecycle_status: 'Posted', requires_dual_approval: false };
  }
  if (inv.lifecycle_status !== 'Verified') {
    throw new ErpkianAppError(
      409,
      'POSTING_REQUIRES_VERIFIED_STATE',
      `ثبت قطعی فقط برای فاکتورهای Verified مجاز است (وضعیت فعلی: ${inv.lifecycle_status}).`
    );
  }

  const settings = db
    .prepare('SELECT allow_negative_stock, require_dual_approval_above_irr FROM organization_settings WHERE organization_id = ?')
    .get(ctx.organizationId) as { allow_negative_stock: number; require_dual_approval_above_irr: number } | undefined;

  const threshold = settings?.require_dual_approval_above_irr ?? 500000000;
  const allowNegativeStock = settings?.allow_negative_stock === 1;

  // Check if Period is closed BEFORE creating approval request so closed period always blocks early!
  const fp = inv.fiscal_period_id
    ? (db
        .prepare('SELECT id, name_fa, status FROM fiscal_periods WHERE organization_id = ? AND id = ?')
        .get(ctx.organizationId, inv.fiscal_period_id) as { id: string; name_fa: string; status: string } | undefined)
    : undefined;

  if (fp && fp.status !== 'OPEN') {
    throw new ErpkianAppError(
      409,
      'FISCAL_PERIOD_LOCKED',
      `ثبت قطعی در دوره مالی «${fp.name_fa}» با وضعیت ${fp.status} مجاز نیست.`
    );
  }

  if (inv.net_total_irr >= threshold) {
    const existingApproved = db
      .prepare(
        `SELECT id FROM approval_requests
         WHERE organization_id = ? AND target_entity_type = 'INVOICE' AND target_entity_id = ? AND status = 'APPROVED' LIMIT 1`
      )
      .get(ctx.organizationId, inv.id);

    if (!existingApproved) {
      const existingPending = db
        .prepare(
          `SELECT id FROM approval_requests
           WHERE organization_id = ? AND target_entity_type = 'INVOICE' AND target_entity_id = ? AND status = 'PENDING' LIMIT 1`
        )
        .get(ctx.organizationId, inv.id) as { id: string } | undefined;

      const reqId = existingPending?.id ?? newId('apr');
      const now = new Date().toISOString();

      db.transaction(() => {
        if (!existingPending) {
          db.prepare(
            `INSERT INTO approval_requests
             (id, organization_id, target_entity_type, target_entity_id, required_permission_code, requires_dual_approval, amount_irr, reason_fa, status, requested_by_membership_id, requested_at)
             VALUES (?, ?, 'INVOICE', ?, 'invoice:post', 1, ?, ?, 'PENDING', ?, ?)`
          ).run(
            reqId,
            ctx.organizationId,
            inv.id,
            inv.net_total_irr,
            `مبلغ فاکتور (${inv.net_total_irr.toLocaleString('fa-IR')} ریال) بالاتر از آستانه کنترل دوامضایی (${threshold.toLocaleString('fa-IR')} ریال) است.`,
            ctx.membershipId,
            now
          );
        }

        db.prepare(`UPDATE invoices SET lifecycle_status = 'Awaiting Approval' WHERE id = ? AND organization_id = ?`)
          .run(inv.id, ctx.organizationId);

        recordAuditLog(db, {
          organizationId: ctx.organizationId,
          entityType: 'INVOICE',
          entityId: inv.id,
          action: 'DUAL_APPROVAL_REQUESTED',
          actorMembershipId: ctx.membershipId,
          sourceDocumentId: inv.primary_document_id,
          beforeState: { lifecycle_status: inv.lifecycle_status },
          afterState: { lifecycle_status: 'Awaiting Approval', approval_request_id: reqId },
        });
      })();

      return {
        id: inv.id,
        lifecycle_status: 'Awaiting Approval',
        requires_dual_approval: true,
        approval_request_id: reqId,
        message_fa: 'به دلیل بالا بودن مبلغ از آستانه سازمانی، فاکتور به کارتابل تایید دوامضایی ارسال شد (تاییدکننده دوم باید فردی غیر از درخواست‌دهنده باشد).',
      };
    }
  }

  db.transaction(() => {
    finalizeInvoicePostingTx(db, ctx, inv, allowNegativeStock);
  })();

  return {
    id: inv.id,
    lifecycle_status: 'Posted',
    requires_dual_approval: false,
  };
}

export function listApprovalRequests(db: ErpkianDb, ctx: TenantMembershipContext) {
  return db
    .prepare(
      `SELECT ar.*, u_req.full_name_fa as requested_by_name, u_dec.full_name_fa as decided_by_name,
              i.invoice_number, i.issue_jalali, c.canonical_name as contact_name
       FROM approval_requests ar
       JOIN organization_memberships m_req ON m_req.id = ar.requested_by_membership_id
       JOIN users u_req ON u_req.id = m_req.user_id
       LEFT JOIN organization_memberships m_dec ON m_dec.id = ar.decided_by_membership_id
       LEFT JOIN users u_dec ON u_dec.id = m_dec.user_id
       LEFT JOIN invoices i ON i.id = ar.target_entity_id AND ar.target_entity_type = 'INVOICE'
       LEFT JOIN contacts c ON c.id = i.contact_id
       WHERE ar.organization_id = ?
       ORDER BY ar.requested_at DESC`
    )
    .all(ctx.organizationId);
}

export function decideApprovalRequest(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  approvalId: string,
  decision: 'APPROVE' | 'REJECT',
  noteFa?: string
) {
  requirePermission(db, ctx, 'invoice:post');

  const reqRow = db
    .prepare('SELECT * FROM approval_requests WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, approvalId) as
    | {
        id: string;
        target_entity_type: string;
        target_entity_id: string;
        requires_dual_approval: number;
        status: string;
        requested_by_membership_id: string;
      }
    | undefined;

  if (!reqRow) {
    throw new ErpkianAppError(404, 'APPROVAL_REQUEST_NOT_FOUND', 'درخواست تایید یافت نشد.');
  }
  if (reqRow.status !== 'PENDING') {
    throw new ErpkianAppError(409, 'APPROVAL_ALREADY_DECIDED', 'این درخواست قبلاً تعیین تکلیف شده است.');
  }
  if (reqRow.requires_dual_approval === 1 && reqRow.requested_by_membership_id === ctx.membershipId) {
    throw new ErpkianAppError(
      403,
      'SELF_APPROVAL_FORBIDDEN',
      'کنترل دوامضایی: درخواست‌دهنده نمی‌تواند درخواست تایید خود را تایید کند. با کاربر دارای نقش CFO یا OWNER دیگر وارد شوید.'
    );
  }

  const now = new Date().toISOString();
  const settings = db
    .prepare('SELECT allow_negative_stock FROM organization_settings WHERE organization_id = ?')
    .get(ctx.organizationId) as { allow_negative_stock: number } | undefined;

  db.transaction(() => {
    db.prepare(
      `UPDATE approval_requests
       SET status = ?, decided_by_membership_id = ?, decision_note_fa = ?, decided_at = ?
       WHERE id = ? AND organization_id = ?`
    ).run(decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', ctx.membershipId, noteFa ?? null, now, approvalId, ctx.organizationId);

    if (reqRow.target_entity_type === 'INVOICE') {
      const inv = db
        .prepare('SELECT * FROM invoices WHERE organization_id = ? AND id = ?')
        .get(ctx.organizationId, reqRow.target_entity_id) as
        | {
            id: string;
            branch_id: string | null;
            fiscal_period_id: string | null;
            invoice_direction: InvoiceDirection;
            invoice_number: string;
            primary_document_id: string | null;
            issue_date_iso: string;
            net_total_irr: number;
            lifecycle_status: string;
          }
        | undefined;

      if (inv) {
        if (decision === 'APPROVE') {
          finalizeInvoicePostingTx(db, ctx, inv, settings?.allow_negative_stock === 1);
        } else {
          db.prepare(`UPDATE invoices SET lifecycle_status = 'Verified' WHERE id = ? AND organization_id = ?`)
            .run(inv.id, ctx.organizationId);
          recordAuditLog(db, {
            organizationId: ctx.organizationId,
            entityType: 'INVOICE',
            entityId: inv.id,
            action: 'DUAL_APPROVAL_REJECTED',
            actorMembershipId: ctx.membershipId,
            afterState: { lifecycle_status: 'Verified', note_fa: noteFa ?? null },
          });
        }
      }
    }
  })();

  return {
    approval_request_id: approvalId,
    status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    invoice_lifecycle_status: decision === 'APPROVE' ? 'Posted' : 'Verified',
  };
}

export function reversePostedInvoice(db: ErpkianDb, ctx: TenantMembershipContext, invoiceId: string, reasonFa: string) {
  requirePermission(db, ctx, 'invoice:reverse');
  const inv = db
    .prepare('SELECT * FROM invoices WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, invoiceId) as Record<string, unknown> | undefined;
  if (!inv) {
    throw new ErpkianAppError(404, 'INVOICE_NOT_FOUND', 'فاکتور یافت نشد.');
  }
  if (inv.lifecycle_status !== 'Posted') {
    throw new ErpkianAppError(409, 'ONLY_POSTED_CAN_BE_REVERSED', 'فقط فاکتورهای قطعی (Posted) قابل صدور سند معکوس هستند.');
  }

  db.transaction(() => {
    db.prepare(`UPDATE invoices SET lifecycle_status = 'Reversed' WHERE id = ? AND organization_id = ?`)
      .run(invoiceId, ctx.organizationId);
    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'INVOICE',
      entityId: invoiceId,
      action: 'INVOICE_REVERSED',
      actorMembershipId: ctx.membershipId,
      beforeState: { lifecycle_status: 'Posted' },
      afterState: { lifecycle_status: 'Reversed', reason_fa: reasonFa },
    });
  })();

  return { id: invoiceId, lifecycle_status: 'Reversed' };
}
