import type { CurrencyCode, InvoiceDirection } from '../../../shared/contracts';
import { calculateInvoiceDeterministic } from '../../../shared/decimal-math';
import { jalaliToIso, normalizePersianText, validateJalaliDate } from '../../../shared/jalali';
import type { ErpkianDb } from '../../db/schema';
import type { IObjectStoragePort } from '../../infrastructure/object-storage';
import {
  ErpkianAppError,
  newId,
  recordAuditLog,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';
import { resolveOrSuggestContact } from '../contacts/entity-service';
import { CompositeOcrAdapter, type OcrExtractedLine } from './ocr-adapter';

export async function runOcrExtraction(
  db: ErpkianDb,
  storage: IObjectStoragePort,
  ctx: TenantMembershipContext,
  documentId: string
) {
  requirePermission(db, ctx, 'document:review_ocr');

  const doc = db
    .prepare('SELECT id, lifecycle_status FROM documents WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, documentId) as { id: string; lifecycle_status: string } | undefined;

  if (!doc) {
    throw new ErpkianAppError(404, 'DOCUMENT_NOT_FOUND', 'سند در سازمان شما یافت نشد.');
  }

  const pageRows = db
    .prepare(
      `SELECT o.storage_key, o.mime_type, o.original_filename
       FROM document_pages p
       JOIN document_storage_objects o ON o.id = p.storage_object_id
       WHERE p.organization_id = ? AND p.document_id = ?
       ORDER BY p.page_number ASC`
    )
    .all(ctx.organizationId, documentId) as Array<{
      storage_key: string;
      mime_type: string;
      original_filename: string;
    }>;

  if (pageRows.length === 0) {
    throw new ErpkianAppError(400, 'DOCUMENT_HAS_NO_PAGES', 'سند فاقد صفحه قابل پردازش است.');
  }

  const pageBuffers = pageRows.map((r) => ({
    buffer: storage.getObject(r.storage_key),
    mimeType: r.mime_type,
    filename: r.original_filename,
  }));

  const now = new Date().toISOString();
  const jobId = newId('job');
  const attemptId = newId('att');
  const prevAttempt = db
    .prepare('SELECT MAX(attempt_number) as mx FROM extraction_attempts WHERE organization_id = ? AND document_id = ?')
    .get(ctx.organizationId, documentId) as { mx: number | null };
  const attemptNumber = (prevAttempt?.mx ?? 0) + 1;

  db.prepare(
    `INSERT INTO extraction_jobs (id, organization_id, document_id, status, engine_adapter, created_at)
     VALUES (?, ?, ?, 'RUNNING', 'CompositeOcrAdapter', ?)`
  ).run(jobId, ctx.organizationId, documentId, now);

  const ocr = await new CompositeOcrAdapter().extract(pageBuffers);

  // DOC-MATH-005 validation if lines & currency are present
  let mathPassed = 0;
  let mathSummary: ReturnType<typeof calculateInvoiceDeterministic> | null = null;
  if (ocr.status === 'EXTRACTED' && ocr.lines.length > 0 && ocr.sourceCurrencyCode) {
    mathSummary = calculateInvoiceDeterministic({
      sourceCurrencyCode: ocr.sourceCurrencyCode,
      invoiceDiscountSource: ocr.invoiceDiscountSource,
      lines: ocr.lines,
    });
    mathPassed = mathSummary.valid && mathSummary.warnings.length === 0 ? 1 : 0;
  }

  const contactMatch = ocr.contactName
    ? resolveOrSuggestContact(db, ctx, ocr.contactName, documentId)
    : null;

  const fullPayload = {
    ...ocr,
    math_validation: mathSummary,
    contact_match: contactMatch,
  };

  db.transaction(() => {
    db.prepare('UPDATE extraction_jobs SET status = ?, engine_adapter = ?, finished_at = ? WHERE id = ?')
      .run(ocr.status === 'EXTRACTED' ? 'COMPLETED' : 'NEEDS_MANUAL_ENTRY', ocr.engineAdapter, new Date().toISOString(), jobId);

    db.prepare(
      `INSERT INTO extraction_attempts
       (id, organization_id, extraction_job_id, document_id, attempt_number, model_version, ocr_status, detected_doc_type, detected_currency, raw_payload_json, math_validation_passed, average_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attemptId,
      ctx.organizationId,
      jobId,
      documentId,
      attemptNumber,
      ocr.modelVersion,
      ocr.status,
      ocr.detectedDocType,
      ocr.sourceCurrencyCode,
      JSON.stringify(fullPayload),
      mathPassed,
      ocr.averageConfidence,
      new Date().toISOString()
    );

    const fieldsToSave: Array<[string, string, number]> = [
      ['invoice_number', ocr.invoiceNumber, ocr.fieldConfidences.invoice_number ?? 0],
      ['contact_name', ocr.contactName, ocr.fieldConfidences.contact_name ?? 0],
      ['issue_jalali', ocr.issueJalali, ocr.fieldConfidences.issue_jalali ?? 0],
      ['due_jalali', ocr.dueJalali, ocr.fieldConfidences.issue_jalali ?? 0],
      ['source_currency_code', ocr.sourceCurrencyCode ?? '', ocr.fieldConfidences.source_currency_code ?? 0],
      ['invoice_discount', String(ocr.invoiceDiscountSource), ocr.fieldConfidences.lines ?? 0],
    ];

    const insField = db.prepare(
      `INSERT INTO extracted_fields (id, organization_id, extraction_attempt_id, document_id, field_key, raw_value, normalized_value, confidence, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [k, v, conf] of fieldsToSave) {
      const flagged = conf < 0.7 || !v ? 'FLAGGED' : 'UNREVIEWED';
      insField.run(newId('fld'), ctx.organizationId, attemptId, documentId, k, v, normalizePersianText(v), conf, flagged);
    }

    // Never auto-Posted: always advance to Needs Review
    db.prepare(
      `UPDATE documents SET document_type_code = ?, lifecycle_status = 'Needs Review', updated_at = ? WHERE id = ? AND organization_id = ?`
    ).run(ocr.detectedDocType, new Date().toISOString(), documentId, ctx.organizationId);

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'DOCUMENT',
      entityId: documentId,
      action: 'DOC_OCR_003_EXECUTED',
      actorMembershipId: ctx.membershipId,
      sourceDocumentId: documentId,
      afterState: {
        ocr_status: ocr.status,
        engine_adapter: ocr.engineAdapter,
        detected_doc_type: ocr.detectedDocType,
        math_validation_passed: mathPassed === 1,
      },
    });
  })();

  return {
    attempt_id: attemptId,
    document_id: documentId,
    lifecycle_status: 'Needs Review',
    ocr_status: ocr.status,
    engine_adapter: ocr.engineAdapter,
    reason_fa: ocr.reasonFa ?? null,
    payload: fullPayload,
  };
}

export interface HumanReviewInput {
  decision: 'VERIFIED' | 'REJECTED';
  notesFa?: string;
  invoiceDirection: InvoiceDirection;
  invoiceNumber: string;
  contactId?: string | null;
  contactName: string;
  issueJalali: string;
  dueJalali: string;
  sourceCurrencyCode: CurrencyCode;
  exchangeRateToBase?: number | null;
  invoiceDiscountSource?: number;
  lines: OcrExtractedLine[];
}

/**
 * DOC-REVIEW-007: Split-screen Human Review & Correction.
 * Records before/after corrections, validates math & Jalali dates, creates Verified invoice (never auto-Posted!).
 */
export function submitHumanReview(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  documentId: string,
  input: HumanReviewInput
) {
  requirePermission(db, ctx, 'document:review_ocr');

  const doc = db
    .prepare('SELECT id, lifecycle_status FROM documents WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, documentId) as { id: string; lifecycle_status: string } | undefined;

  if (!doc) {
    throw new ErpkianAppError(404, 'DOCUMENT_NOT_FOUND', 'سند یافت نشد.');
  }

  let latestAttempt = db
    .prepare('SELECT * FROM extraction_attempts WHERE organization_id = ? AND document_id = ? ORDER BY attempt_number DESC LIMIT 1')
    .get(ctx.organizationId, documentId) as
    | { id: string; raw_payload_json: string }
    | undefined;

  const now = new Date().toISOString();

  // If user jumps directly to review without running OCR button first, create an initial manual attempt record
  if (!latestAttempt) {
    const jobId = newId('job');
    const attId = newId('att');
    db.prepare(
      `INSERT INTO extraction_jobs (id, organization_id, document_id, status, engine_adapter, created_at, finished_at)
       VALUES (?, ?, ?, 'MANUAL_REVIEW', 'HumanManualEntry', ?, ?)`
    ).run(jobId, ctx.organizationId, documentId, now, now);
    db.prepare(
      `INSERT INTO extraction_attempts (id, organization_id, extraction_job_id, document_id, attempt_number, model_version, ocr_status, detected_doc_type, detected_currency, raw_payload_json, math_validation_passed, average_confidence, created_at)
       VALUES (?, ?, ?, ?, 1, 'human', 'MANUAL_ENTRY', 'UNKNOWN', NULL, '{}', 0, NULL, ?)`
    ).run(attId, ctx.organizationId, jobId, documentId, now);
    latestAttempt = { id: attId, raw_payload_json: '{}' };
  }

  if (input.decision === 'REJECTED') {
    const reviewId = newId('rev');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO extraction_reviews (id, organization_id, document_id, extraction_attempt_id, reviewer_membership_id, decision, notes_fa, reviewed_at)
         VALUES (?, ?, ?, ?, ?, 'REJECTED', ?, ?)`
      ).run(reviewId, ctx.organizationId, documentId, latestAttempt!.id, ctx.membershipId, input.notesFa ?? 'رد شده توسط کاربر', now);

      db.prepare(`UPDATE documents SET lifecycle_status = 'Rejected', updated_at = ? WHERE id = ? AND organization_id = ?`)
        .run(now, documentId, ctx.organizationId);

      recordAuditLog(db, {
        organizationId: ctx.organizationId,
        entityType: 'DOCUMENT',
        entityId: documentId,
        action: 'DOC_REVIEW_007_REJECTED',
        actorMembershipId: ctx.membershipId,
        sourceDocumentId: documentId,
        beforeState: { lifecycle_status: doc.lifecycle_status },
        afterState: { lifecycle_status: 'Rejected', notes_fa: input.notesFa ?? null },
      });
    })();

    return {
      document_id: documentId,
      lifecycle_status: 'Rejected',
      review_id: reviewId,
      corrections_count: 0,
      invoice: null,
    };
  }

  // Validate Jalali dates
  const issueCheck = validateJalaliDate(input.issueJalali);
  if (!issueCheck.valid || !issueCheck.parsed) {
    throw new ErpkianAppError(400, issueCheck.errorCode ?? 'INVALID_JALALI_DATE', issueCheck.messageFa ?? 'تاریخ صدور نامعتبر است.');
  }
  const dueCheck = validateJalaliDate(input.dueJalali);
  if (!dueCheck.valid || !dueCheck.parsed) {
    throw new ErpkianAppError(400, dueCheck.errorCode ?? 'INVALID_JALALI_DATE', dueCheck.messageFa ?? 'تاریخ سررسید نامعتبر است.');
  }

  const issueIso = jalaliToIso(issueCheck.parsed.formatted);
  const dueIso = jalaliToIso(dueCheck.parsed.formatted);
  if (dueIso < issueIso) {
    throw new ErpkianAppError(400, 'DUE_DATE_BEFORE_ISSUE_DATE', 'تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد.');
  }

  const calc = calculateInvoiceDeterministic({
    sourceCurrencyCode: input.sourceCurrencyCode,
    exchangeRateToBase: input.exchangeRateToBase,
    invoiceDiscountSource: input.invoiceDiscountSource ?? 0,
    lines: input.lines,
  });

  if (!calc.valid) {
    throw new ErpkianAppError(400, calc.errors[0].code, calc.errors[0].messageFa, { errors: calc.errors });
  }

  if (!input.invoiceNumber?.trim()) {
    throw new ErpkianAppError(400, 'INVOICE_NUMBER_REQUIRED', 'شماره فاکتور الزامی است.');
  }

  const prevPayload = JSON.parse(latestAttempt.raw_payload_json || '{}') as Record<string, unknown>;
  const reviewId = newId('rev');

  let resolvedContactId = input.contactId?.trim() || null;
  if (resolvedContactId) {
    const exists = db
      .prepare(`SELECT id FROM contacts WHERE organization_id = ? AND id = ? AND status = 'ACTIVE'`)
      .get(ctx.organizationId, resolvedContactId);
    if (!exists) {
      throw new ErpkianAppError(404, 'CONTACT_NOT_FOUND', 'طرف‌حساب انتخاب‌شده در این سازمان یافت نشد.');
    }
  } else {
    const cleanName = input.contactName?.trim();
    if (!cleanName) {
      throw new ErpkianAppError(400, 'CONTACT_NAME_REQUIRED', 'نام طرف‌حساب الزامی است.');
    }
    const norm = normalizePersianText(cleanName);
    const existingByName = db
      .prepare(`SELECT id FROM contacts WHERE organization_id = ? AND normalized_name = ? AND status = 'ACTIVE' LIMIT 1`)
      .get(ctx.organizationId, norm) as { id: string } | undefined;
    if (existingByName) {
      resolvedContactId = existingByName.id;
    } else {
      resolvedContactId = newId('cnt');
      db.prepare(
        `INSERT INTO contacts (id, organization_id, canonical_name, normalized_name, is_customer, is_supplier, credit_limit_irr, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'ACTIVE', ?)`
      ).run(
        resolvedContactId,
        ctx.organizationId,
        cleanName,
        norm,
        input.invoiceDirection === 'SALE' || input.invoiceDirection === 'SALE_RETURN' ? 1 : 0,
        input.invoiceDirection === 'PURCHASE' || input.invoiceDirection === 'PURCHASE_RETURN' ? 1 : 0,
        now
      );
    }
  }

  // Find fiscal period covering issueIso
  const fp = db
    .prepare(
      `SELECT id FROM fiscal_periods WHERE organization_id = ? AND start_date_iso <= ? AND end_date_iso >= ? LIMIT 1`
    )
    .get(ctx.organizationId, issueIso, issueIso) as { id: string } | undefined;

  let createdInvoiceId = '';
  let correctionsCount = 0;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO extraction_reviews (id, organization_id, document_id, extraction_attempt_id, reviewer_membership_id, decision, notes_fa, reviewed_at)
       VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?, ?)`
    ).run(reviewId, ctx.organizationId, documentId, latestAttempt!.id, ctx.membershipId, input.notesFa ?? null, now);

    // Record exact before/after corrections
    const diffs: Array<[string, string, string]> = [
      ['invoice_number', String(prevPayload.invoiceNumber ?? ''), input.invoiceNumber.trim()],
      ['contact_name', String(prevPayload.contactName ?? ''), input.contactName.trim()],
      ['issue_jalali', String(prevPayload.issueJalali ?? ''), issueCheck.parsed!.formatted],
      ['due_jalali', String(prevPayload.dueJalali ?? ''), dueCheck.parsed!.formatted],
      ['source_currency_code', String(prevPayload.sourceCurrencyCode ?? ''), input.sourceCurrencyCode],
      ['net_total_irr', String((prevPayload.math_validation as { netTotalIrr?: number } | undefined)?.netTotalIrr ?? ''), String(calc.netTotalIrr)],
    ];

    const insCorr = db.prepare(
      `INSERT INTO extraction_corrections (id, organization_id, extraction_review_id, document_id, field_key, value_before, value_after, actor_membership_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const [fieldKey, beforeVal, afterVal] of diffs) {
      if (beforeVal !== afterVal) {
        insCorr.run(newId('cor'), ctx.organizationId, reviewId, documentId, fieldKey, beforeVal, afterVal, ctx.membershipId, now);
        correctionsCount++;
      }
    }

    // Check if there is already a non-Posted invoice linked to this doc; otherwise create Verified invoice
    const existingInv = db
      .prepare(`SELECT id, lifecycle_status FROM invoices WHERE organization_id = ? AND primary_document_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(ctx.organizationId, documentId) as { id: string; lifecycle_status: string } | undefined;

    if (existingInv && existingInv.lifecycle_status === 'Posted') {
      throw new ErpkianAppError(409, 'DOCUMENT_ALREADY_POSTED', 'این سند قبلاً به فاکتور قطعی (Posted) تبدیل شده است.');
    }

    createdInvoiceId = existingInv?.id ?? newId('inv');

    if (existingInv) {
      db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ? AND organization_id = ?').run(createdInvoiceId, ctx.organizationId);
      db.prepare(
        `UPDATE invoices SET
           fiscal_period_id = ?, invoice_direction = ?, invoice_number = ?, contact_id = ?,
           issue_date_iso = ?, issue_jalali = ?, due_date_iso = ?, due_jalali = ?,
           source_currency_code = ?, exchange_rate_to_base = ?,
           subtotal_irr = ?, line_discount_total_irr = ?, invoice_discount_irr = ?, tax_total_irr = ?, net_total_irr = ?,
           lifecycle_status = 'Verified'
         WHERE id = ? AND organization_id = ?`
      ).run(
        fp?.id ?? null,
        input.invoiceDirection,
        input.invoiceNumber.trim(),
        resolvedContactId,
        issueIso,
        issueCheck.parsed!.formatted,
        dueIso,
        dueCheck.parsed!.formatted,
        input.sourceCurrencyCode,
        calc.rateApplied,
        calc.subtotalIrr,
        calc.lineDiscountTotalIrr,
        calc.invoiceDiscountIrr,
        calc.taxTotalIrr,
        calc.netTotalIrr,
        createdInvoiceId,
        ctx.organizationId
      );
    } else {
      db.prepare(
        `INSERT INTO invoices
         (id, organization_id, branch_id, fiscal_period_id, invoice_direction, invoice_number, contact_id, primary_document_id,
          issue_date_iso, issue_jalali, due_date_iso, due_jalali, source_currency_code, exchange_rate_to_base,
          subtotal_irr, line_discount_total_irr, invoice_discount_irr, tax_total_irr, net_total_irr, lifecycle_status,
          idempotency_key, created_by_membership_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Verified', NULL, ?, ?)`
      ).run(
        createdInvoiceId,
        ctx.organizationId,
        ctx.branchScopeId ?? 'br-aria-hq',
        fp?.id ?? null,
        input.invoiceDirection,
        input.invoiceNumber.trim(),
        resolvedContactId,
        documentId,
        issueIso,
        issueCheck.parsed!.formatted,
        dueIso,
        dueCheck.parsed!.formatted,
        input.sourceCurrencyCode,
        calc.rateApplied,
        calc.subtotalIrr,
        calc.lineDiscountTotalIrr,
        calc.invoiceDiscountIrr,
        calc.taxTotalIrr,
        calc.netTotalIrr,
        ctx.membershipId,
        now
      );
    }

    const insLine = db.prepare(
      `INSERT INTO invoice_lines
       (id, organization_id, invoice_id, line_number, product_id, description, uom_name, conversion_to_base, quantity, base_quantity,
        unit_price_irr, is_promotional_free_item, promo_reason, discount_pct, discount_amount_irr, tax_rate_pct, tax_amount_irr, net_line_amount_irr)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const line of calc.lines) {
      let productId = line.productId;
      if (!productId) {
        const normDesc = normalizePersianText(line.description);
        const prodMatch = db
          .prepare('SELECT id FROM products WHERE organization_id = ? AND normalized_name = ? LIMIT 1')
          .get(ctx.organizationId, normDesc) as { id: string } | undefined;
        productId = prodMatch?.id ?? null;
      }

      insLine.run(
        newId('inl'),
        ctx.organizationId,
        createdInvoiceId,
        line.lineNumber,
        productId,
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

    db.prepare(
      `INSERT INTO document_relations (id, organization_id, document_id, entity_type, entity_id, relation_role, created_at)
       VALUES (?, ?, ?, 'INVOICE', ?, 'PRIMARY_SOURCE', ?)`
    ).run(newId('drel'), ctx.organizationId, documentId, createdInvoiceId, now);

    db.prepare(`UPDATE documents SET lifecycle_status = 'Verified', updated_at = ? WHERE id = ? AND organization_id = ?`)
      .run(now, documentId, ctx.organizationId);

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'DOCUMENT',
      entityId: documentId,
      action: 'DOC_REVIEW_007_VERIFIED',
      actorMembershipId: ctx.membershipId,
      sourceDocumentId: documentId,
      beforeState: { lifecycle_status: doc.lifecycle_status },
      afterState: {
        lifecycle_status: 'Verified',
        invoice_id: createdInvoiceId,
        invoice_lifecycle_status: 'Verified',
        corrections_count: correctionsCount,
        net_total_irr: calc.netTotalIrr,
      },
    });
  })();

  return {
    document_id: documentId,
    lifecycle_status: 'Verified',
    review_id: reviewId,
    corrections_count: correctionsCount,
    invoice: {
      id: createdInvoiceId,
      invoice_number: input.invoiceNumber.trim(),
      lifecycle_status: 'Verified',
      net_total_irr: calc.netTotalIrr,
      tax_total_irr: calc.taxTotalIrr,
      subtotal_irr: calc.subtotalIrr,
      warnings: calc.warnings,
    },
  };
}
