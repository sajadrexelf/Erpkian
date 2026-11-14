import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { openErpkianDatabase, type ErpkianDb } from './db/schema';
import { seedErpkianDatabase } from './db/seed';
import { LocalDiskObjectStorage, type IObjectStoragePort } from './infrastructure/object-storage';
import {
  ErpkianAppError,
  newId,
  resolveTenantContext,
  runIdempotent,
  sendError,
  sendOk,
  type TenantMembershipContext,
} from './kernel/context';
import {
  attemptLockedTaxSubmission,
  getOrganizationSettings,
  listAuditAndSecurityLogs,
  listFiscalPeriods,
  listSwitchablePersonas,
  transitionFiscalPeriod,
  updateOrganizationSettings,
} from './modules/admin/admin-service';
import { runAiOrchestrator } from './modules/ai/ai-orchestrator';
import {
  createContact,
  listContacts,
  listProductsWithStock,
  resolveEntityCandidate,
} from './modules/contacts/entity-service';
import {
  getDocumentDetail,
  ingestDocuments,
  listDocuments,
  mergeExistingDocuments,
} from './modules/documents/document-service';
import { exportAgingReport } from './modules/export/export-service';
import {
  createInvoice,
  decideApprovalRequest,
  listApprovalRequests,
  listInvoices,
  postInvoice,
  reversePostedInvoice,
  verifyInvoice,
} from './modules/invoices/invoice-service';
import { runOcrExtraction, submitHumanReview } from './modules/ocr/ocr-service';
import {
  createPaymentWithAllocation,
  listPaymentsAndChecks,
  transitionCheckStatus,
} from './modules/payments/payment-service';
import {
  getDashboardSummary,
  listReportVersionHistory,
  runAccountsReceivableAgingReport,
} from './modules/reporting/reporting-service';

export interface ErpkianServerInstance {
  app: express.Express;
  db: ErpkianDb;
  storage: IObjectStoragePort;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

export function createErpkianServer(options?: { dbPath?: string; storageDir?: string }): ErpkianServerInstance {
  const db = openErpkianDatabase(options?.dbPath);
  seedErpkianDatabase(db);
  const storage = new LocalDiskObjectStorage(options?.storageDir);

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const withTenant = (
    handler: (req: Request, res: Response, ctx: TenantMembershipContext) => Promise<void> | void
  ) => {
    return async (req: Request, res: Response, _next: NextFunction) => {
      const fallbackReqId = req.header('x-request-id') || newId('req');
      let ctx: TenantMembershipContext | null = null;
      try {
        ctx = resolveTenantContext(db, req);
        await handler(req, res, ctx);
      } catch (err) {
        sendError(res, ctx?.requestId ?? fallbackReqId, ctx?.organizationId ?? null, ctx?.branchScopeId ?? null, err);
      }
    };
  };

  app.get('/api/health', (_req, res) => {
    sendOk(res, { requestId: newId('req'), organizationId: null, branchScopeId: null }, {
      status: 'ok',
      engine: 'sqlite-dev',
      gemini_configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.get(
    '/api/session/context',
    withTenant((_req, res, ctx) => {
      const personas = listSwitchablePersonas(db);
      const settings = getOrganizationSettings(db, ctx);
      sendOk(res, ctx, {
        current_context: {
          organization_id: ctx.organizationId,
          organization_name: ctx.organizationName,
          is_demo_synthetic: ctx.isDemoSynthetic,
          display_currency_code: ctx.displayCurrencyCode,
          membership_id: ctx.membershipId,
          full_name_fa: ctx.fullNameFa,
          email: ctx.email,
          roles: ctx.roles,
          branch_scope_id: ctx.branchScopeId,
          permissions: Array.from(ctx.permissions),
          gemini_ocr_configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        },
        personas,
        settings: settings.settings,
      });
    })
  );

  app.get(
    '/api/dashboard',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, getDashboardSummary(db, ctx));
    })
  );

  // Documents (DOC-INGEST-001, DOC-MERGE-002, Signed 2-min Preview)
  app.get(
    '/api/documents',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listDocuments(db, ctx));
    })
  );

  app.post(
    '/api/documents/upload',
    upload.array('files', 10),
    withTenant((req, res, ctx) => {
      const uploadedFiles = ((req as Request & { files?: Express.Multer.File[] }).files ?? []).map((f) => ({
        originalname: f.originalname,
        buffer: f.buffer,
        mimetype: f.mimetype,
      }));
      const titleFa = typeof req.body?.title_fa === 'string' ? req.body.title_fa : undefined;
      const mergeIntoSingle = String(req.body?.merge_into_single || '') === 'true';
      const out = ingestDocuments(db, storage, ctx, uploadedFiles, { titleFa, mergeIntoSingle });
      sendOk(res, ctx, out, 201);
    })
  );

  app.post(
    '/api/documents/merge',
    withTenant((req, res, ctx) => {
      const documentIds = Array.isArray(req.body?.document_ids) ? (req.body.document_ids as string[]) : [];
      const titleFa = typeof req.body?.title_fa === 'string' ? req.body.title_fa : undefined;
      const merged = mergeExistingDocuments(db, storage, ctx, { documentIds, titleFa });
      sendOk(res, ctx, merged, 201);
    })
  );

  app.get(
    '/api/documents/:id/preview',
    (req, res) => {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const verified = storage.verifySignedToken(token);
      if (!verified || verified.documentId !== req.params.id) {
        sendError(
          res,
          newId('req'),
          null,
          null,
          new ErpkianAppError(403, 'INVALID_OR_EXPIRED_PREVIEW_TOKEN', 'توکن پیش‌نمایش سند معتبر نیست یا منقضی شده است.')
        );
        return;
      }

      const objRow = db
        .prepare('SELECT mime_type, original_filename FROM document_storage_objects WHERE organization_id = ? AND storage_key = ?')
        .get(verified.organizationId, verified.storageKey) as { mime_type: string; original_filename: string } | undefined;

      if (!objRow || !storage.exists(verified.storageKey)) {
        sendError(res, newId('req'), verified.organizationId, null, new ErpkianAppError(404, 'OBJECT_NOT_FOUND', 'فایل سند یافت نشد.'));
        return;
      }

      db.prepare(
        `INSERT INTO document_access_logs (id, organization_id, document_id, actor_membership_id, action, occurred_at)
         VALUES (?, ?, ?, 'signed-url', 'VIEW_SIGNED_PREVIEW', ?)`
      ).run(newId('dacc'), verified.organizationId, verified.documentId, new Date().toISOString());

      res.setHeader('Content-Type', objRow.mime_type);
      res.setHeader('Cache-Control', 'no-store');
      res.send(storage.getObject(verified.storageKey));
    }
  );

  app.get(
    '/api/documents/:id',
    withTenant((req, res, ctx) => {
      sendOk(res, ctx, getDocumentDetail(db, storage, ctx, req.params.id));
    })
  );

  // OCR & Human Review (DOC-OCR-003, DOC-CLASS-004, DOC-MATH-005, DOC-REVIEW-007)
  app.post(
    '/api/documents/:id/ocr',
    withTenant(async (req, res, ctx) => {
      const result = await runOcrExtraction(db, storage, ctx, req.params.id);
      sendOk(res, ctx, result);
    })
  );

  app.post(
    '/api/documents/:id/review',
    withTenant((req, res, ctx) => {
      const result = submitHumanReview(db, ctx, req.params.id, req.body);
      sendOk(res, ctx, result);
    })
  );

  // Contacts, Products & Entity Resolution (DOC-ENTITY-006)
  app.get(
    '/api/contacts',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listContacts(db, ctx));
    })
  );

  app.post(
    '/api/contacts',
    withTenant((req, res, ctx) => {
      const created = createContact(db, ctx, req.body);
      sendOk(res, ctx, created, 201);
    })
  );

  app.get(
    '/api/products',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listProductsWithStock(db, ctx));
    })
  );

  app.post(
    '/api/entity-candidates/:id/resolve',
    withTenant((req, res, ctx) => {
      const action = req.body?.action as 'MERGE' | 'CREATE_NEW' | 'REJECT';
      sendOk(res, ctx, resolveEntityCandidate(db, ctx, req.params.id, action));
    })
  );

  // Invoices & Posting Gate & Dual Approval (FIN-AR-INV-001, DOC-POST-008)
  app.get(
    '/api/invoices',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listInvoices(db, ctx));
    })
  );

  app.post(
    '/api/invoices',
    withTenant((req, res, ctx) => {
      const idempotencyKey = req.header('idempotency-key') || undefined;
      const result = runIdempotent(db, ctx, 'POST /api/invoices', idempotencyKey, req.body, () => ({
        status: 201,
        body: createInvoice(db, ctx, req.body, idempotencyKey),
      }));
      sendOk(res, ctx, result.body, result.status);
    })
  );

  app.post(
    '/api/invoices/:id/verify',
    withTenant((req, res, ctx) => {
      sendOk(res, ctx, verifyInvoice(db, ctx, req.params.id));
    })
  );

  app.post(
    '/api/invoices/:id/post',
    withTenant((req, res, ctx) => {
      sendOk(res, ctx, postInvoice(db, ctx, req.params.id));
    })
  );

  app.post(
    '/api/invoices/:id/reverse',
    withTenant((req, res, ctx) => {
      sendOk(res, ctx, reversePostedInvoice(db, ctx, req.params.id, req.body?.reasonFa || 'اصلاح و برگشت سند'));
    })
  );

  app.get(
    '/api/approvals',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listApprovalRequests(db, ctx));
    })
  );

  app.post(
    '/api/approvals/:id/decide',
    withTenant((req, res, ctx) => {
      const decision = req.body?.decision === 'REJECT' ? 'REJECT' : 'APPROVE';
      sendOk(res, ctx, decideApprovalRequest(db, ctx, req.params.id, decision, req.body?.noteFa));
    })
  );

  // Payments, FIFO/Explicit Allocations & Sayad Checks (FIN-AR-PAY-002, FIN-AR-ALLOC-003, TRS-CHK-001)
  app.get(
    '/api/payments',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listPaymentsAndChecks(db, ctx));
    })
  );

  app.post(
    '/api/payments',
    withTenant((req, res, ctx) => {
      const idempotencyKey = req.header('idempotency-key') || undefined;
      const result = runIdempotent(db, ctx, 'POST /api/payments', idempotencyKey, req.body, () => ({
        status: 201,
        body: createPaymentWithAllocation(db, ctx, req.body, idempotencyKey),
      }));
      sendOk(res, ctx, result.body, result.status);
    })
  );

  app.post(
    '/api/checks/:id/transition',
    withTenant((req, res, ctx) => {
      sendOk(res, ctx, transitionCheckStatus(db, ctx, req.params.id, req.body?.to_status, req.body?.note_fa));
    })
  );

  // AR Aging & Version History & Official Exports (FIN-AR-AGING-001, RPT-EXPORT-001)
  app.get(
    '/api/reports/ar-aging',
    withTenant((req, res, ctx) => {
      const asOfJalali = typeof req.query.as_of_jalali === 'string' ? req.query.as_of_jalali : undefined;
      const displayCurrency = req.query.currency === 'IRR' ? 'IRR' : req.query.currency === 'IRT' ? 'IRT' : undefined;
      const saveVersion = req.query.save !== 'false';
      sendOk(res, ctx, runAccountsReceivableAgingReport(db, ctx, { asOfJalali, displayCurrency, saveVersion }));
    })
  );

  app.get(
    '/api/reports/ar-aging/versions',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listReportVersionHistory(db, ctx));
    })
  );

  app.get(
    '/api/reports/export',
    withTenant(async (req, res, ctx) => {
      const fmtRaw = String(req.query.format || 'EXCEL').toUpperCase();
      const format: 'EXCEL' | 'PDF' | 'CSV' | 'JSON' =
        fmtRaw === 'PDF' ? 'PDF' : fmtRaw === 'CSV' ? 'CSV' : fmtRaw === 'JSON' ? 'JSON' : 'EXCEL';
      const asOfJalali = typeof req.query.as_of_jalali === 'string' ? req.query.as_of_jalali : undefined;
      const exported = await exportAgingReport(db, storage, ctx, format, asOfJalali);
      res.setHeader('Content-Type', exported.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      res.setHeader('X-Report-Version-Id', exported.reportVersionId);
      res.send(exported.buffer);
    })
  );

  // Conversational AI Orchestrator
  app.post(
    '/api/ai/orchestrate',
    withTenant(async (req, res, ctx) => {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      const convId = typeof req.body?.conversation_id === 'string' ? req.body.conversation_id : null;
      const result = await runAiOrchestrator(db, ctx, prompt, convId);
      sendOk(res, ctx, result);
    })
  );

  // Admin, Fiscal Periods & Audit Logs
  app.get(
    '/api/admin/settings',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, getOrganizationSettings(db, ctx));
    })
  );

  app.put(
    '/api/admin/settings',
    withTenant((req, res, ctx) => {
      sendOk(res, ctx, updateOrganizationSettings(db, ctx, req.body));
    })
  );

  app.get(
    '/api/admin/fiscal-periods',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listFiscalPeriods(db, ctx));
    })
  );

  app.post(
    '/api/admin/fiscal-periods/:id/transition',
    withTenant((req, res, ctx) => {
      sendOk(res, ctx, transitionFiscalPeriod(db, ctx, req.params.id, req.body?.action, req.body?.reason_fa || ''));
    })
  );

  app.get(
    '/api/admin/audit-logs',
    withTenant((_req, res, ctx) => {
      sendOk(res, ctx, listAuditAndSecurityLogs(db, ctx));
    })
  );

  // Locked Tax Submission Endpoints (V1 Locked)
  app.post(
    '/api/tax/moadian/submit',
    withTenant((_req, _res, ctx) => {
      attemptLockedTaxSubmission(db, ctx, 'TAX-SUB-MOADIAN-001');
    })
  );

  app.post(
    '/api/tax/return/submit',
    withTenant((_req, _res, ctx) => {
      attemptLockedTaxSubmission(db, ctx, 'TAX-SUB-RETURN-001');
    })
  );

  // Central Multer / JSON error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    sendError(res, req.header('x-request-id') || newId('req'), null, null, err);
  });

  return { app, db, storage };
}
