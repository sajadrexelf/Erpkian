import path from 'node:path';
import type { ErpkianDb } from '../../db/schema';
import {
  detectFileByMagicBytes,
  type IObjectStoragePort,
} from '../../infrastructure/object-storage';
import {
  ErpkianAppError,
  newId,
  recordAuditLog,
  recordSecurityEvent,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';

export interface UploadedFileInput {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
}

export interface IngestedDocumentSummary {
  id: string;
  title_fa: string;
  document_type_code: string;
  lifecycle_status: string;
  duplicate_of_document_id: string | null;
  is_duplicate: boolean;
  page_count: number;
  uploaded_at: string;
  sha256_hash: string;
  mime_type: string;
}

export function ingestDocuments(
  db: ErpkianDb,
  storage: IObjectStoragePort,
  ctx: TenantMembershipContext,
  files: UploadedFileInput[],
  options?: { titleFa?: string; mergeIntoSingle?: boolean }
): { documents: IngestedDocumentSummary[]; merged: boolean } {
  requirePermission(db, ctx, 'document:upload');

  if (!files || files.length === 0) {
    throw new ErpkianAppError(400, 'NO_FILES_UPLOADED', 'هیچ فایلی برای بارگذاری ارسال نشده است.');
  }

  // Validate all uploaded files with strict magic bytes before writing anything
  const validated = files.map((file) => {
    const detected = detectFileByMagicBytes(file.buffer, file.originalname);
    if (!detected.valid) {
      recordSecurityEvent(db, {
        organizationId: ctx.organizationId,
        eventCode: 'UNSAFE_OR_INVALID_FILE_UPLOAD_BLOCKED',
        severity: 'HIGH',
        actorMembershipId: ctx.membershipId,
        details: {
          filename: file.originalname,
          reported_mime: file.mimetype ?? null,
          detected_mime: detected.mimeType,
          reason: detected.rejectionReason,
        },
      });
      throw new ErpkianAppError(
        400,
        'INVALID_FILE_TYPE',
        `فایل "${file.originalname}" رد شد: ${detected.rejectionReason ?? 'نوع فایل غیرمجاز است.'}`
      );
    }
    return { file, detected };
  });

  const now = new Date().toISOString();
  const merge = Boolean(options?.mergeIntoSingle) && validated.length > 1;
  const createdDocs: IngestedDocumentSummary[] = [];

  if (merge) {
    const docId = newId('doc');
    const titleFa = options?.titleFa?.trim() || `سند چندصفحه‌ای (${validated.length} صفحه) — ${validated[0].file.originalname}`;

    db.transaction(() => {
      db.prepare(
        `INSERT INTO documents (id, organization_id, branch_id, document_type_code, title_fa, lifecycle_status, duplicate_of_document_id, uploaded_by_membership_id, uploaded_at, updated_at)
         VALUES (?, ?, ?, 'UNKNOWN', ?, 'Uploaded', NULL, ?, ?, ?)`
      ).run(docId, ctx.organizationId, ctx.branchScopeId, titleFa, ctx.membershipId, now, now);

      let firstObjId = '';
      let firstSha = '';
      let firstMime = validated[0].detected.mimeType;

      validated.forEach((item, idx) => {
        const objId = newId('obj');
        const ext = item.detected.extension || path.extname(item.file.originalname) || '.bin';
        const storageKey = `objects/${ctx.organizationId}/${docId}/v1-p${idx + 1}${ext}`;
        const stored = storage.putObject(storageKey, item.file.buffer);
        if (idx === 0) {
          firstObjId = objId;
          firstSha = stored.sha256Hash;
        }
        db.prepare(
          `INSERT INTO document_storage_objects (id, organization_id, storage_key, original_filename, mime_type, byte_size, sha256_hash, is_immutable_original, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
        ).run(objId, ctx.organizationId, stored.storageKey, item.file.originalname, item.detected.mimeType, stored.byteSize, stored.sha256Hash, now);

        const verId = idx === 0 ? newId('dver') : '';
        if (idx === 0) {
          db.prepare(
            `INSERT INTO document_versions (id, organization_id, document_id, version_number, version_kind, storage_object_id, created_at)
             VALUES (?, ?, ?, 1, 'ORIGINAL', ?, ?)`
          ).run(verId, ctx.organizationId, docId, firstObjId, now);
        }
      });

      const verRow = db
        .prepare('SELECT id FROM document_versions WHERE document_id = ? AND version_number = 1')
        .get(docId) as { id: string };

      const objs = db
        .prepare(
          `SELECT id FROM document_storage_objects WHERE organization_id = ? AND storage_key LIKE ? ORDER BY created_at ASC, rowid ASC`
        )
        .all(ctx.organizationId, `objects/${ctx.organizationId}/${docId}/%`) as Array<{ id: string }>;

      objs.forEach((o, idx) => {
        db.prepare(
          `INSERT INTO document_pages (id, organization_id, document_id, document_version_id, page_number, storage_object_id, quality_score, is_blurry_flagged)
           VALUES (?, ?, ?, ?, ?, ?, 0.9, 0)`
        ).run(newId('pg'), ctx.organizationId, docId, verRow.id, idx + 1, o.id);
      });

      recordAuditLog(db, {
        organizationId: ctx.organizationId,
        entityType: 'DOCUMENT',
        entityId: docId,
        action: 'DOCUMENT_INGESTED_MULTIPAGE',
        actorMembershipId: ctx.membershipId,
        sourceDocumentId: docId,
        afterState: { page_count: validated.length, title_fa: titleFa },
      });

      createdDocs.push({
        id: docId,
        title_fa: titleFa,
        document_type_code: 'UNKNOWN',
        lifecycle_status: 'Uploaded',
        duplicate_of_document_id: null,
        is_duplicate: false,
        page_count: validated.length,
        uploaded_at: now,
        sha256_hash: firstSha,
        mime_type: firstMime,
      });
    })();

    return { documents: createdDocs, merged: true };
  }

  // Individual upload per file with SHA-256 duplicate detection within organization
  for (const item of validated) {
    const docId = newId('doc');
    const objId = newId('obj');
    const verId = newId('dver');
    const ext = item.detected.extension || path.extname(item.file.originalname) || '.bin';
    const storageKey = `objects/${ctx.organizationId}/${docId}/v1-original${ext}`;
    const stored = storage.putObject(storageKey, item.file.buffer);

    const existingDup = db
      .prepare(
        `SELECT d.id
         FROM document_storage_objects o
         JOIN document_versions v ON v.storage_object_id = o.id
         JOIN documents d ON d.id = v.document_id
         WHERE o.organization_id = ? AND o.sha256_hash = ? AND d.lifecycle_status <> 'Rejected'
         ORDER BY d.uploaded_at ASC LIMIT 1`
      )
      .get(ctx.organizationId, stored.sha256Hash) as { id: string } | undefined;

    const titleFa =
      validated.length === 1 && options?.titleFa?.trim()
        ? options.titleFa.trim()
        : item.file.originalname;

    db.transaction(() => {
      db.prepare(
        `INSERT INTO documents (id, organization_id, branch_id, document_type_code, title_fa, lifecycle_status, duplicate_of_document_id, uploaded_by_membership_id, uploaded_at, updated_at)
         VALUES (?, ?, ?, 'UNKNOWN', ?, 'Uploaded', ?, ?, ?, ?)`
      ).run(docId, ctx.organizationId, ctx.branchScopeId, titleFa, existingDup?.id ?? null, ctx.membershipId, now, now);

      db.prepare(
        `INSERT INTO document_storage_objects (id, organization_id, storage_key, original_filename, mime_type, byte_size, sha256_hash, is_immutable_original, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(objId, ctx.organizationId, stored.storageKey, item.file.originalname, item.detected.mimeType, stored.byteSize, stored.sha256Hash, now);

      db.prepare(
        `INSERT INTO document_versions (id, organization_id, document_id, version_number, version_kind, storage_object_id, created_at)
         VALUES (?, ?, ?, 1, 'ORIGINAL', ?, ?)`
      ).run(verId, ctx.organizationId, docId, objId, now);

      db.prepare(
        `INSERT INTO document_pages (id, organization_id, document_id, document_version_id, page_number, storage_object_id, quality_score, is_blurry_flagged)
         VALUES (?, ?, ?, ?, 1, ?, 0.92, 0)`
      ).run(newId('pg'), ctx.organizationId, docId, verId, objId);

      recordAuditLog(db, {
        organizationId: ctx.organizationId,
        entityType: 'DOCUMENT',
        entityId: docId,
        action: existingDup ? 'DOCUMENT_INGESTED_DUPLICATE_DETECTED' : 'DOCUMENT_INGESTED',
        actorMembershipId: ctx.membershipId,
        sourceDocumentId: docId,
        afterState: {
          title_fa: titleFa,
          sha256_hash: stored.sha256Hash,
          duplicate_of_document_id: existingDup?.id ?? null,
        },
      });
    })();

    createdDocs.push({
      id: docId,
      title_fa: titleFa,
      document_type_code: 'UNKNOWN',
      lifecycle_status: 'Uploaded',
      duplicate_of_document_id: existingDup?.id ?? null,
      is_duplicate: Boolean(existingDup),
      page_count: 1,
      uploaded_at: now,
      sha256_hash: stored.sha256Hash,
      mime_type: item.detected.mimeType,
    });
  }

  return { documents: createdDocs, merged: false };
}

/**
 * DOC-MERGE-002: Merge existing uploaded single-page documents into a multi-page document
 * while preserving each original v1 immutable storage object.
 */
export function mergeExistingDocuments(
  db: ErpkianDb,
  storage: IObjectStoragePort,
  ctx: TenantMembershipContext,
  params: { documentIds: string[]; titleFa?: string }
): IngestedDocumentSummary {
  requirePermission(db, ctx, 'document:upload');

  const ids = Array.from(new Set(params.documentIds.filter(Boolean)));
  if (ids.length < 2) {
    throw new ErpkianAppError(400, 'MERGE_REQUIRES_AT_LEAST_TWO_DOCS', 'برای ادغام حداقل دو سند مجزا انتخاب کنید.');
  }

  const placeholders = ids.map(() => '?').join(',');
  const sourcePages = db
    .prepare(
      `SELECT d.id as doc_id, d.title_fa, p.storage_object_id, o.storage_key, o.mime_type, o.sha256_hash
       FROM documents d
       JOIN document_pages p ON p.document_id = d.id AND p.organization_id = d.organization_id
       JOIN document_storage_objects o ON o.id = p.storage_object_id
       WHERE d.organization_id = ? AND d.id IN (${placeholders})
       ORDER BY d.uploaded_at ASC, p.page_number ASC`
    )
    .all(ctx.organizationId, ...ids) as Array<{
      doc_id: string;
      title_fa: string;
      storage_object_id: string;
      storage_key: string;
      mime_type: string;
      sha256_hash: string;
    }>;

  const foundDocIds = new Set(sourcePages.map((s) => s.doc_id));
  if (foundDocIds.size !== ids.length) {
    throw new ErpkianAppError(404, 'DOCUMENT_NOT_FOUND', 'یک یا چند سند انتخاب‌شده در این سازمان یافت نشد.');
  }

  const now = new Date().toISOString();
  const mergedDocId = newId('doc');
  const titleFa = params.titleFa?.trim() || `سند ادغام‌شده (${sourcePages.length} صفحه)`;

  // Create immutable v1 manifest for the merged bundle + v2 MERGED_PDF/bundle version preserving originals
  const manifestObj = storage.putObject(
    `objects/${ctx.organizationId}/${mergedDocId}/v2-merged-manifest.json`,
    Buffer.from(
      JSON.stringify({
        merged_from_document_ids: ids,
        pages: sourcePages.map((p, idx) => ({ page: idx + 1, source_document_id: p.doc_id, storage_object_id: p.storage_object_id })),
        created_at: now,
      }),
      'utf8'
    )
  );

  db.transaction(() => {
    db.prepare(
      `INSERT INTO documents (id, organization_id, branch_id, document_type_code, title_fa, lifecycle_status, duplicate_of_document_id, uploaded_by_membership_id, uploaded_at, updated_at)
       VALUES (?, ?, ?, 'UNKNOWN', ?, 'Uploaded', NULL, ?, ?, ?)`
    ).run(mergedDocId, ctx.organizationId, ctx.branchScopeId, titleFa, ctx.membershipId, now, now);

    const objId = newId('obj');
    db.prepare(
      `INSERT INTO document_storage_objects (id, organization_id, storage_key, original_filename, mime_type, byte_size, sha256_hash, is_immutable_original, created_at)
       VALUES (?, ?, ?, ?, 'application/json', ?, ?, 0, ?)`
    ).run(objId, ctx.organizationId, manifestObj.storageKey, 'merged-manifest.json', manifestObj.byteSize, manifestObj.sha256Hash, now);

    const verId = newId('dver');
    db.prepare(
      `INSERT INTO document_versions (id, organization_id, document_id, version_number, version_kind, storage_object_id, created_at)
       VALUES (?, ?, ?, 2, 'MERGED_PDF', ?, ?)`
    ).run(verId, ctx.organizationId, mergedDocId, objId, now);

    sourcePages.forEach((p, idx) => {
      db.prepare(
        `INSERT INTO document_pages (id, organization_id, document_id, document_version_id, page_number, storage_object_id, quality_score, is_blurry_flagged)
         VALUES (?, ?, ?, ?, ?, ?, 0.9, 0)`
      ).run(newId('pg'), ctx.organizationId, mergedDocId, verId, idx + 1, p.storage_object_id);
    });

    for (const srcId of ids) {
      db.prepare(
        `INSERT INTO document_relations (id, organization_id, document_id, entity_type, entity_id, relation_role, created_at)
         VALUES (?, ?, ?, 'MERGED_FROM_DOCUMENT', ?, 'SOURCE_PAGE', ?)`
      ).run(newId('drel'), ctx.organizationId, mergedDocId, srcId, now);
    }

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'DOCUMENT',
      entityId: mergedDocId,
      action: 'DOC_MERGE_002',
      actorMembershipId: ctx.membershipId,
      sourceDocumentId: mergedDocId,
      afterState: { merged_from: ids, page_count: sourcePages.length },
    });
  })();

  return {
    id: mergedDocId,
    title_fa: titleFa,
    document_type_code: 'UNKNOWN',
    lifecycle_status: 'Uploaded',
    duplicate_of_document_id: null,
    is_duplicate: false,
    page_count: sourcePages.length,
    uploaded_at: now,
    sha256_hash: manifestObj.sha256Hash,
    mime_type: sourcePages[0].mime_type,
  };
}

export function listDocuments(db: ErpkianDb, ctx: TenantMembershipContext) {
  const rows = db
    .prepare(
      `SELECT d.id, d.title_fa, d.document_type_code, d.lifecycle_status, d.duplicate_of_document_id,
              d.uploaded_at, d.updated_at, u.full_name_fa as uploaded_by_name,
              (SELECT COUNT(*) FROM document_pages p WHERE p.document_id = d.id) as page_count,
              (SELECT o.mime_type FROM document_pages p JOIN document_storage_objects o ON o.id = p.storage_object_id WHERE p.document_id = d.id ORDER BY p.page_number ASC LIMIT 1) as primary_mime_type,
              (SELECT o.sha256_hash FROM document_pages p JOIN document_storage_objects o ON o.id = p.storage_object_id WHERE p.document_id = d.id ORDER BY p.page_number ASC LIMIT 1) as sha256_hash,
              (SELECT ea.ocr_status FROM extraction_attempts ea WHERE ea.document_id = d.id ORDER BY ea.attempt_number DESC LIMIT 1) as latest_ocr_status,
              (SELECT i.id FROM invoices i WHERE i.primary_document_id = d.id AND i.organization_id = d.organization_id ORDER BY i.created_at DESC LIMIT 1) as linked_invoice_id
       FROM documents d
       JOIN organization_memberships m ON m.id = d.uploaded_by_membership_id
       JOIN users u ON u.id = m.user_id
       WHERE d.organization_id = ?
       ORDER BY d.uploaded_at DESC`
    )
    .all(ctx.organizationId);

  return rows;
}

export function getDocumentDetail(
  db: ErpkianDb,
  storage: IObjectStoragePort,
  ctx: TenantMembershipContext,
  documentId: string
) {
  const doc = db
    .prepare(
      `SELECT d.*
       FROM documents d
       WHERE d.organization_id = ? AND d.id = ?`
    )
    .get(ctx.organizationId, documentId) as Record<string, unknown> | undefined;

  if (!doc) {
    throw new ErpkianAppError(404, 'DOCUMENT_NOT_FOUND', 'سند در سازمان شما یافت نشد.');
  }

  const pages = db
    .prepare(
      `SELECT p.id, p.page_number, p.quality_score, p.is_blurry_flagged,
              o.storage_key, o.original_filename, o.mime_type, o.byte_size, o.sha256_hash
       FROM document_pages p
       JOIN document_storage_objects o ON o.id = p.storage_object_id
       WHERE p.organization_id = ? AND p.document_id = ?
       ORDER BY p.page_number ASC`
    )
    .all(ctx.organizationId, documentId) as Array<{
      id: string;
      page_number: number;
      quality_score: number | null;
      is_blurry_flagged: number;
      storage_key: string;
      original_filename: string;
      mime_type: string;
      byte_size: number;
      sha256_hash: string;
    }>;

  const pagesWithUrls = pages.map((p) => {
    const token = storage.createSignedToken({
      organizationId: ctx.organizationId,
      documentId,
      storageKey: p.storage_key,
      ttlSeconds: 120,
    });
    const isTextReadable = p.mime_type === 'application/json' || p.mime_type === 'text/csv' || p.mime_type === 'text/plain';
    return {
      ...p,
      signed_preview_url: `/api/documents/${documentId}/preview?token=${encodeURIComponent(token)}`,
      inline_text_preview: isTextReadable && storage.exists(p.storage_key) ? storage.getObject(p.storage_key).toString('utf8') : null,
    };
  });

  const latestAttempt = db
    .prepare(
      `SELECT * FROM extraction_attempts WHERE organization_id = ? AND document_id = ? ORDER BY attempt_number DESC LIMIT 1`
    )
    .get(ctx.organizationId, documentId) as Record<string, unknown> | undefined;

  const extractedFields = latestAttempt
    ? db
        .prepare('SELECT * FROM extracted_fields WHERE organization_id = ? AND extraction_attempt_id = ?')
        .all(ctx.organizationId, latestAttempt.id as string)
    : [];

  const corrections = db
    .prepare(
      `SELECT * FROM extraction_corrections WHERE organization_id = ? AND document_id = ? ORDER BY occurred_at DESC`
    )
    .all(ctx.organizationId, documentId);

  const linkedInvoice = db
    .prepare(
      `SELECT id, invoice_number, lifecycle_status, net_total_irr FROM invoices WHERE organization_id = ? AND primary_document_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(ctx.organizationId, documentId);

  return {
    document: doc,
    pages: pagesWithUrls,
    latest_attempt: latestAttempt
      ? {
          ...latestAttempt,
          raw_payload: JSON.parse(String(latestAttempt.raw_payload_json || '{}')),
        }
      : null,
    extracted_fields: extractedFields,
    corrections,
    linked_invoice: linkedInvoice ?? null,
  };
}
