import type {
  AgingCustomerRow,
  CurrencyCode,
  ErpkianReportEnvelope,
  ReportEvidenceItem,
  ReportWarning,
} from '../../../shared/contracts';
import { calculateOpenInvoiceBalance, classifyAgingBucket, roundHalfEvenIrr } from '../../../shared/decimal-math';
import { diffDaysIso, isoToJalali, jalaliToIso, nowTehranParts, validateJalaliDate } from '../../../shared/jalali';
import type { ErpkianDb } from '../../db/schema';
import {
  ErpkianAppError,
  hashObject,
  newId,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';

function convertDisplayValue(amountIrr: number, displayCurrency: CurrencyCode): number {
  if (displayCurrency === 'IRT') {
    return roundHalfEvenIrr(amountIrr / 10);
  }
  return amountIrr;
}

/**
 * FIN-AR-AGING-001: Deterministic AR Aging Report with Snapshots, Report Versions (v1 -> v2),
 * Pending Cheques separation, Pending Document Warnings, and Full Evidence Linkage.
 */
export function runAccountsReceivableAgingReport(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  options?: { asOfJalali?: string; displayCurrency?: CurrencyCode; saveVersion?: boolean }
): ErpkianReportEnvelope<AgingCustomerRow> {
  requirePermission(db, ctx, 'ar:view_aging');

  const asOfJalaliInput = options?.asOfJalali?.trim() || '1405/08/25';
  const chk = validateJalaliDate(asOfJalaliInput);
  if (!chk.valid || !chk.parsed) {
    throw new ErpkianAppError(400, chk.errorCode ?? 'INVALID_JALALI_DATE', chk.messageFa ?? 'تاریخ مبنای گزارش سنی نامعتبر است.');
  }
  const asOfJalali = chk.parsed.formatted;
  const asOfIso = jalaliToIso(asOfJalali);
  const displayCurrency: CurrencyCode = options?.displayCurrency ?? ctx.displayCurrencyCode ?? 'IRT';
  const exchangeRateApplied = displayCurrency === 'IRT' ? 10 : 1;

  // Fetch Posted SALE invoices on or before asOfIso
  const postedInvoices = db
    .prepare(
      `SELECT i.id, i.invoice_number, i.contact_id, c.canonical_name as contact_name,
              i.primary_document_id, i.issue_date_iso, i.issue_jalali, i.due_date_iso, i.due_jalali,
              i.net_total_irr
       FROM invoices i
       JOIN contacts c ON c.id = i.contact_id
       WHERE i.organization_id = ?
         AND i.lifecycle_status = 'Posted'
         AND i.invoice_direction = 'SALE'
         AND i.issue_date_iso <= ?
       ORDER BY i.due_date_iso ASC`
    )
    .all(ctx.organizationId, asOfIso) as Array<{
      id: string;
      invoice_number: string;
      contact_id: string;
      contact_name: string;
      primary_document_id: string | null;
      issue_date_iso: string;
      issue_jalali: string;
      due_date_iso: string;
      due_jalali: string;
      net_total_irr: number;
    }>;

  // Count non-posted / pending documents for Confidence & Completeness Warning
  const pendingDocs = db
    .prepare(
      `SELECT id FROM documents WHERE organization_id = ? AND lifecycle_status IN ('Uploaded', 'Processing', 'Needs Review', 'Verified', 'Eligible for Posting')`
    )
    .all(ctx.organizationId) as Array<{ id: string }>;
  const pendingInvoices = db
    .prepare(
      `SELECT id FROM invoices WHERE organization_id = ? AND lifecycle_status IN ('Needs Review', 'Verified', 'Awaiting Approval')`
    )
    .all(ctx.organizationId) as Array<{ id: string }>;

  const customerMap = new Map<string, AgingCustomerRow>();
  const evidences: ReportEvidenceItem[] = [];

  for (const inv of postedInvoices) {
    // Only count CLEARED payments (TRANSFER/CASH/POS Posted, or CHEQUE where status = 'CLEARED')
    const clearedRow = db
      .prepare(
        `SELECT COALESCE(SUM(pa.allocated_amount_irr), 0) as cleared_irr
         FROM payment_allocations pa
         JOIN payments p ON p.id = pa.payment_id
         LEFT JOIN checks ch ON ch.payment_id = p.id
         WHERE pa.organization_id = ?
           AND pa.invoice_id = ?
           AND pa.status = 'ACTIVE'
           AND p.lifecycle_status = 'Posted'
           AND p.payment_date_iso <= ?
           AND (p.method <> 'CHEQUE' OR ch.current_status = 'CLEARED')`
      )
      .get(ctx.organizationId, inv.id, asOfIso) as { cleared_irr: number };

    const clearedPaidIrr = Number(clearedRow?.cleared_irr ?? 0);
    const { openBalanceIrr } = calculateOpenInvoiceBalance({
      netTotalIrr: inv.net_total_irr,
      clearedAllocatedPaidIrr: clearedPaidIrr,
    });

    const daysPastDue = diffDaysIso(asOfIso, inv.due_date_iso);
    const bucket = classifyAgingBucket(daysPastDue);

    let row = customerMap.get(inv.contact_id);
    if (!row) {
      row = {
        contact_id: inv.contact_id,
        contact_name: inv.contact_name,
        invoice_count: 0,
        total_invoiced_irr: 0,
        cleared_paid_irr: 0,
        pending_cheques_irr: 0,
        open_balance_irr: 0,
        unallocated_credit_irr: 0,
        current_irr: 0,
        bucket_1_30_irr: 0,
        bucket_31_60_irr: 0,
        bucket_61_90_irr: 0,
        bucket_90_plus_irr: 0,
        max_days_past_due: 0,
        evidence_invoice_ids: [],
      };
      customerMap.set(inv.contact_id, row);
    }

    row.invoice_count += 1;
    row.total_invoiced_irr += inv.net_total_irr;
    row.cleared_paid_irr += clearedPaidIrr;
    row.open_balance_irr += openBalanceIrr;
    row.evidence_invoice_ids.push(inv.id);

    if (openBalanceIrr > 0) {
      row.max_days_past_due = Math.max(row.max_days_past_due, Math.max(0, daysPastDue));
      if (bucket === 'CURRENT') row.current_irr += openBalanceIrr;
      else if (bucket === 'BUCKET_1_30') row.bucket_1_30_irr += openBalanceIrr;
      else if (bucket === 'BUCKET_31_60') row.bucket_31_60_irr += openBalanceIrr;
      else if (bucket === 'BUCKET_61_90') row.bucket_61_90_irr += openBalanceIrr;
      else row.bucket_90_plus_irr += openBalanceIrr;

      evidences.push({
        metric_key: 'total_open_ar_irr',
        source_entity_type: 'INVOICE',
        source_entity_id: inv.id,
        source_document_id: inv.primary_document_id,
        contribution_amount_irr: openBalanceIrr,
        document_number: inv.invoice_number,
        issue_jalali: inv.issue_jalali,
        contact_name: inv.contact_name,
      });
    }
  }

  // Add Pending Sayad Cheques & Unallocated Credits per contact
  for (const row of customerMap.values()) {
    const pendChk = db
      .prepare(
        `SELECT COALESCE(SUM(amount_irr), 0) as total
         FROM checks
         WHERE organization_id = ? AND contact_id = ? AND check_direction = 'RECEIVABLE' AND current_status IN ('IN_HAND', 'DEPOSITED')`
      )
      .get(ctx.organizationId, row.contact_id) as { total: number };
    row.pending_cheques_irr = Number(pendChk?.total ?? 0);

    const creditRow = db
      .prepare(
        `SELECT COALESCE(SUM(p.amount_irr), 0) - COALESCE(SUM(alloc.allocated_irr), 0) as unalloc
         FROM payments p
         LEFT JOIN checks ch ON ch.payment_id = p.id
         LEFT JOIN (
           SELECT payment_id, SUM(allocated_amount_irr) as allocated_irr
           FROM payment_allocations WHERE status = 'ACTIVE' GROUP BY payment_id
         ) alloc ON alloc.payment_id = p.id
         WHERE p.organization_id = ? AND p.contact_id = ? AND p.direction = 'RECEIPT_IN' AND p.lifecycle_status = 'Posted'
           AND (p.method <> 'CHEQUE' OR ch.current_status = 'CLEARED')`
      )
      .get(ctx.organizationId, row.contact_id) as { unalloc: number };
    row.unallocated_credit_irr = Math.max(0, Number(creditRow?.unalloc ?? 0));
  }

  const rows = Array.from(customerMap.values()).sort((a, b) => b.open_balance_irr - a.open_balance_irr);

  const totalOpenArIrr = rows.reduce((s, r) => s + r.open_balance_irr, 0);
  const totalOverdueArIrr = rows.reduce(
    (s, r) => s + r.bucket_1_30_irr + r.bucket_31_60_irr + r.bucket_61_90_irr + r.bucket_90_plus_irr,
    0
  );
  const totalPendingChequesIrr = rows.reduce((s, r) => s + r.pending_cheques_irr, 0);

  const warnings: ReportWarning[] = [];
  const pendingTotalCount = pendingDocs.length + pendingInvoices.length;
  if (pendingTotalCount > 0) {
    warnings.push({
      warning_code: 'PENDING_UNPOSTED_DOCUMENTS',
      severity: 'MEDIUM',
      message_fa: `${pendingTotalCount} سند یا فاکتور تاییدنشده/قطعی‌نشده وجود دارد و در محاسبه رسمی مطالبات منظور نشده است.`,
      affected_record_ids: [...pendingDocs.map((d) => d.id), ...pendingInvoices.map((i) => i.id)],
    });
  }
  if (totalPendingChequesIrr > 0) {
    warnings.push({
      warning_code: 'PENDING_CHEQUES_NOT_CLEARED',
      severity: 'LOW',
      message_fa: `مبلغ ${totalPendingChequesIrr.toLocaleString('fa-IR')} ریال چک صیادی در جریان (وصول‌نشده) وجود دارد؛ تا زمان وصول قطعی، مانده بدهی مشتری کاهش نیافته است.`,
      affected_record_ids: [],
    });
  }

  const tehran = nowTehranParts();
  const snapshotHash = hashObject({ asOfIso, rows, pendingTotalCount });

  // Persist immutable snapshot + report execution + report version (v1 -> v2)
  const snapshotId = newId('snap');
  const execId = newId('rex');
  const versionId = newId('rver');

  const prevVer = db
    .prepare(
      `SELECT rv.id, rv.version_number
       FROM report_versions rv
       JOIN report_executions re ON re.id = rv.report_execution_id
       WHERE re.organization_id = ? AND re.service_code = 'FIN-AR-AGING-001'
       ORDER BY rv.created_at DESC LIMIT 1`
    )
    .get(ctx.organizationId) as { id: string; version_number: number } | undefined;

  const versionNumber = options?.saveVersion === false ? 1 : (prevVer?.version_number ?? 0) + 1;

  const envelope: ErpkianReportEnvelope<AgingCustomerRow> = {
    schema_version: '1.0.0',
    service_code: 'FIN-AR-AGING-001',
    algorithm_version: '1.0.0',
    formula_version: 'CF-AR-01..02',
    is_demo_synthetic_data: ctx.isDemoSynthetic,
    execution_meta: {
      organization_id: ctx.organizationId,
      branch_scope_id: ctx.branchScopeId,
      report_execution_id: execId,
      report_version_id: versionId,
      version_number: versionNumber,
      generated_at_utc: tehran.utcIso,
      generated_at_jalali: tehran.jalaliDateTime,
      display_currency: displayCurrency,
      canonical_currency: 'IRR',
      exchange_rate_applied: exchangeRateApplied,
    },
    data_snapshot: {
      data_snapshot_id: snapshotId,
      as_of_date_iso: asOfIso,
      as_of_date_jalali: asOfJalali,
      snapshot_hash: snapshotHash,
      included_document_count: postedInvoices.length,
      pending_document_count: pendingTotalCount,
      confidence_level: pendingTotalCount > 0 ? 'MEDIUM' : 'HIGH',
    },
    summary_metrics: [
      {
        metric_key: 'total_open_ar_irr',
        label_fa: 'کل مانده مطالبات باز',
        value_irr: totalOpenArIrr,
        value_display: convertDisplayValue(totalOpenArIrr, displayCurrency),
        unit: displayCurrency === 'IRT' ? 'IRT' : 'IRR',
        formula_code: 'CF-AR-01',
      },
      {
        metric_key: 'total_overdue_ar_irr',
        label_fa: 'کل مطالبات معوق (سررسید گذشته)',
        value_irr: totalOverdueArIrr,
        value_display: convertDisplayValue(totalOverdueArIrr, displayCurrency),
        unit: displayCurrency === 'IRT' ? 'IRT' : 'IRR',
        formula_code: 'CF-AR-02',
      },
      {
        metric_key: 'pending_cheques_irr',
        label_fa: 'چک‌های در جریان وصول (غیرنقد)',
        value_irr: totalPendingChequesIrr,
        value_display: convertDisplayValue(totalPendingChequesIrr, displayCurrency),
        unit: displayCurrency === 'IRT' ? 'IRT' : 'IRR',
        formula_code: 'TRS-CHK-001',
      },
    ],
    rows,
    warnings_and_limitations: warnings,
    evidences,
    next_best_actions: [
      {
        action_code: 'EXPORT_AGING_EXCEL',
        title_fa: 'دانلود گزارش اکسل ۴ شیتی (Excel)',
        target_service_code: 'RPT-EXPORT-001',
      },
      {
        action_code: 'EXPORT_AGING_PDF',
        title_fa: 'دانلود گزارش چاپی فارسی (PDF)',
        target_service_code: 'RPT-EXPORT-001',
      },
      {
        action_code: 'REVIEW_PENDING_DOCS',
        title_fa: 'تکمیل و قطعی‌سازی اسناد در انتظار بررسی',
        target_service_code: 'DOC-REVIEW-007',
        target_route: 'ocr-review',
      },
    ],
  };

  if (options?.saveVersion !== false) {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO report_data_snapshots (id, organization_id, as_of_date_iso, as_of_date_jalali, snapshot_hash, included_document_count, pending_document_count, confidence_level, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        snapshotId,
        ctx.organizationId,
        asOfIso,
        asOfJalali,
        snapshotHash,
        postedInvoices.length,
        pendingTotalCount,
        envelope.data_snapshot.confidence_level,
        tehran.utcIso
      );

      db.prepare(
        `INSERT INTO report_executions (id, organization_id, service_code, branch_scope_id, requested_by_membership_id, created_at)
         VALUES (?, ?, 'FIN-AR-AGING-001', ?, ?, ?)`
      ).run(execId, ctx.organizationId, ctx.branchScopeId, ctx.membershipId, tehran.utcIso);

      db.prepare(
        `INSERT INTO report_versions (id, organization_id, report_execution_id, data_snapshot_id, version_number, supersedes_report_version_id, algorithm_version, envelope_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '1.0.0', ?, ?)`
      ).run(versionId, ctx.organizationId, execId, snapshotId, versionNumber, prevVer?.id ?? null, JSON.stringify(envelope), tehran.utcIso);
    })();
  }

  return envelope;
}

export function listReportVersionHistory(db: ErpkianDb, ctx: TenantMembershipContext) {
  return db
    .prepare(
      `SELECT rv.id, rv.version_number, rv.supersedes_report_version_id, rv.created_at,
              rs.as_of_date_jalali, rs.snapshot_hash, rs.included_document_count, rs.pending_document_count, rs.confidence_level
       FROM report_versions rv
       JOIN report_executions re ON re.id = rv.report_execution_id
       JOIN report_data_snapshots rs ON rs.id = rv.data_snapshot_id
       WHERE rv.organization_id = ? AND re.service_code = 'FIN-AR-AGING-001'
       ORDER BY rv.created_at DESC
       LIMIT 15`
    )
    .all(ctx.organizationId);
}

export function getDashboardSummary(db: ErpkianDb, ctx: TenantMembershipContext) {
  const canViewAr = ctx.permissions.has('ar:view_aging');
  const canViewCost = ctx.permissions.has('report:view_cost_profit');

  const docCounts = db
    .prepare(
      `SELECT lifecycle_status, COUNT(*) as cnt
       FROM documents WHERE organization_id = ? GROUP BY lifecycle_status`
    )
    .all(ctx.organizationId) as Array<{ lifecycle_status: string; cnt: number }>;

  const invCounts = db
    .prepare(
      `SELECT lifecycle_status, COUNT(*) as cnt, COALESCE(SUM(net_total_irr), 0) as total_irr
       FROM invoices WHERE organization_id = ? GROUP BY lifecycle_status`
    )
    .all(ctx.organizationId) as Array<{ lifecycle_status: string; cnt: number; total_irr: number }>;

  const pendingApprovals = db
    .prepare(`SELECT COUNT(*) as cnt FROM approval_requests WHERE organization_id = ? AND status = 'PENDING'`)
    .get(ctx.organizationId) as { cnt: number };

  let agingSummary: ErpkianReportEnvelope<AgingCustomerRow> | null = null;
  if (canViewAr) {
    agingSummary = runAccountsReceivableAgingReport(db, ctx, { asOfJalali: '1405/08/25', saveVersion: false });
  }

  const recentDocs = db
    .prepare(
      `SELECT id, title_fa, document_type_code, lifecycle_status, uploaded_at
       FROM documents WHERE organization_id = ? ORDER BY uploaded_at DESC LIMIT 6`
    )
    .all(ctx.organizationId);

  const tehran = nowTehranParts();
  return {
    organization_id: ctx.organizationId,
    organization_name: ctx.organizationName,
    is_demo_synthetic_data: ctx.isDemoSynthetic,
    display_currency: ctx.displayCurrencyCode,
    generated_at_jalali: tehran.jalaliDateTime,
    can_view_ar: canViewAr,
    can_view_cost_profit: canViewCost,
    document_counts: docCounts,
    invoice_counts: invCounts,
    pending_approvals_count: pendingApprovals.cnt,
    aging: agingSummary,
    recent_documents: recentDocs,
  };
}
