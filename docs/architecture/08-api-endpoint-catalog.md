# 08 — کاتالوگ کامل Endpointهای API (`API Endpoint Catalog`)

این سند تمام **۲۶ گروه API** پلتفرم Erpkian را با قرارداد کامل Endpointهای اصلی MVP (بیش از ۴۰ Endpoint هسته‌ای)، مجوزهای `RBAC`، نیازمندی `Idempotency` و خطاهای استاندارد تعریف می‌کند.

---

## ۱. نقشه ۲۶ گروه API

| # | گروه API | پیشوند مسیر (`/api/v1/...`) | وضعیت در v1 |
| :-: | :--- | :--- | :---: |
| 1 | `Auth & Sessions` | `/auth/*` | `MVP P0` |
| 2 | `Organizations & Settings` | `/organizations/*` | `MVP P0` |
| 3 | `Memberships & RBAC` | `/memberships/*`, `/roles/*` | `MVP P0` |
| 4 | `Branches` | `/branches/*` | `MVP P0` |
| 5 | `Fiscal Years, Periods & Locks` | `/fiscal/*` | `MVP P0` |
| 6 | `Accounting Policies & Currencies` | `/policies/*`, `/currencies/*` | `MVP P0` |
| 7 | `Contacts & Entity Resolution` | `/contacts/*`, `/entity-matches/*` | `MVP P0` |
| 8 | `Products & Multi-UoM` | `/products/*`, `/uoms/*` | `MVP P0` |
| 9 | `Warehouses & Stock Balances` | `/warehouses/*`, `/stock/*` | `MVP P0` |
| 10 | `Document Ingestion & Storage` | `/documents/*` | `MVP P0` |
| 11 | `OCR Jobs, Extraction & Review` | `/ocr/*` | `MVP P0` |
| 12 | `Invoices (AR/AP & Returns)` | `/invoices/*` | `MVP P0` |
| 13 | `Payments & Allocations` | `/payments/*` | `MVP P0` |
| 14 | `Bank Accounts & Statements` | `/bank-accounts/*`, `/bank-transactions/*` | `MVP P0` |
| 15 | `Checks (Sayad Lifecycle)` | `/checks/*` | `MVP P0` |
| 16 | `Reconciliation Engine` | `/reconciliations/*` | `MVP P0/P1` |
| 17 | `Inventory Movements & Adjustments` | `/inventory/movements/*`, `/inventory/adjustments/*` | `MVP P0` |
| 18 | `Profitability & COGS` | `/profitability/*` | `MVP P0/P1` |
| 19 | `Management Reports & Snapshots` | `/reports/*` | `MVP P0` |
| 20 | `Official Exports (PDF/Excel/CSV)` | `/exports/*` | `MVP P0` |
| 21 | `Tax Prep & Validation` | `/tax/*` *(ارسال رسمی `LOCKED_IN_V1`)* | `MVP P1` |
| 22 | `Workflows & Approvals` | `/workflows/*`, `/approvals/*` | `MVP P0` |
| 23 | `AI Conversations & Feedback` | `/conversations/*` | `MVP P0` |
| 24 | `ERP Integrations & Imports` | `/integrations/*`, `/imports/*` | `MVP P0/P1` |
| 25 | `Windows Agent Gateway` | `/agent/*` | `MVP P1` |
| 26 | `Audit, Notifications & Subscriptions` | `/audit-logs/*`, `/notifications/*`, `/subscriptions/*` | `MVP P0` |

---

## ۲. کاتالوگ تفصیلی Endpointهای هسته (MVP P0 & P1)

| گروه | Method & Path | سرویس مرجع | مجوز (`RBAC`) | `Idempotency` | خلاصه Request / Response (`ApiResponseEnvelope`) | خطاهای کلیدی |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **1. Auth** | `POST /api/v1/auth/login` | — | عمومی | خیر | ورودی: `{ identifier, password, otp? }` ← خروجی: `{ access_token, refresh_token, memberships[] }` | `401 AUTH_INVALID_CREDENTIALS`, `429` |
| **1. Auth** | `POST /api/v1/auth/refresh` | — | عمومی با Token | خیر | ورودی: `{ refresh_token }` ← صدور جفت توکن جدید (Rotation) | `401 AUTH_TOKEN_REVOKED` |
| **2. Org** | `POST /api/v1/organizations` | — | کاربر احرازشده | **بله** | ورودی: `{ name, business_type_code, display_currency }` ← ایجاد Org + Membership `OWNER` | `409`, `422` |
| **2. Org** | `PATCH /api/v1/organizations/settings` | — | `org:manage_rbac_sync` | خیر | ورودی: `{ allow_negative_stock, require_dual_approval_above_irr, ocr_min_quality_score }` | `403`, `422` |
| **3. RBAC** | `POST /api/v1/memberships/invite` | — | `org:manage_rbac_sync` | **بله** | ورودی: `{ email_or_mobile, role_ids[], branch_scope_id? }` ← ثبت `invitations` | `403`, `409` |
| **4. Branch** | `GET /api/v1/branches` | — | عضو فعال | خیر | لیست شعب مجاز کاربر بر اساس `branch_scope_id` | `401`, `403` |
| **5. Fiscal** | `POST /api/v1/fiscal/periods/:id/close` | — | `period:close_reopen` | **بله** | بستن دوره و ثبت `period_locks`؛ بازگشت وضعیت `CLOSED` | `403`, `409` |
| **5. Fiscal** | `POST /api/v1/fiscal/periods/:id/reopen` | — | `period:close_reopen` | **بله** | ورودی اجباری: `{ reason_fa }` ← بازگشایی همراه با Audit | `403`, `422` |
| **6. Policy** | `PUT /api/v1/policies/valuation` | `PRF-COGS-001` | `period:close_reopen` | **بله** | ورودی: `{ method: 'FIFO'|'WEIGHTED_AVERAGE', effective_from_date }` | `403`, `409` |
| **7. Contact** | `GET /api/v1/contacts?q=&role=` | `DOC-ENTITY-006` | `ar:view_aging` یا `invoice:draft` | خیر | جستجوی `pg_trgm` فارسی نرمال‌شده در طرف‌حساب‌ها | `401` |
| **7. Contact** | `POST /api/v1/entity-matches/:id/resolve` | `DOC-ENTITY-006` | `invoice:verify` | **بله** | ورودی: `{ decision: 'MERGE'|'CREATE_NEW'|'REJECT', target_id? }` ← ثبت `external_entity_mappings` / `merge_history` | `404`, `409` |
| **8. Product** | `POST /api/v1/products` | `INV-MASTER-001` | `inventory:move` | **بله** | ورودی: `{ sku, canonical_name, base_uom_id, product_units[] }` | `409 DUPLICATE_SKU` |
| **9. Stock** | `GET /api/v1/stock/balances` | `INV-BAL-001` | `inventory:move` یا `ar:view_aging` | خیر | کوئری: `?warehouse_id=&as_of_date=` ← محاسبه بر اساس `stock_snapshots + movements` *(بدون بهای خرید برای نقش‌های غیرمجاز)* | `403`, `422` |
| **9. Stock** | `GET /api/v1/stock/cardex/:productId` | `INV-CARDEX-001` | `inventory:move` | خیر | کاردکس تعدادی (و ریالی فقط با مجوز `report:view_cost_profit`) | `403`, `404` |
| **10. Docs** | `POST /api/v1/documents/upload` | `DOC-INGEST-001` | `document:upload` | **بله** | ورودی Multipart: فایل(ها) + `document_type_code` ← محاسبه SHA-256، ذخیره در S3 و صف `q.ocr.preprocess` (`202 Accepted`) | `409 DUPLICATE_DOCUMENT_SHA256`, `413`, `415` |
| **10. Docs** | `POST /api/v1/documents/merge` | `DOC-MERGE-002` | `document:upload` | **بله** | ورودی: `{ document_ids[], page_order[] }` ← ساخت `document_versions` (`MERGED_PDF`) بدون حذف نسخه `ORIGINAL` | `422` |
| **10. Docs** | `GET /api/v1/documents/:id/view-url` | `DOC-LINK-009` | عضو با دسترسی سند | خیر | صدور Pre-signed URL دو دقیقه‌ای و ثبت در `document_access_logs` | `403`, `404` |
| **11. OCR** | `GET /api/v1/ocr/documents/:docId` | `DOC-OCR-003` | `document:review_ocr` | خیر | دریافت آخرین `extraction_attempts` با `extracted_fields`, `table_cells` و مختصات `bbox` | `404` |
| **11. OCR** | `POST /api/v1/ocr/documents/:docId/review` | `DOC-REVIEW-007` | `document:review_ocr` | **بله** | ورودی: `{ corrections[], create_invoice_draft: true }` ← ثبت `extraction_corrections` و ارتقا به `Verified` (هرگز `Posted`) | `422 VR_MATH_MISMATCH` |
| **12. Invoice** | `POST /api/v1/invoices` | `FIN-AR-INV-001` / `FIN-AP-INV-001` | `invoice:draft` | **بله** | ورودی: `{ direction, contact_id, branch_id, issue_date, currency_code, lines[], invoice_discount_irr }` ← وضعیت `Needs Review` یا `Verified` | `422 VR_CURR / VR_MATH` |
| **12. Invoice** | `POST /api/v1/invoices/:id/post` | `DOC-POST-008` | `invoice:post` | **بله** | ثبت قطعی: کنترل دوره باز، موجودی انبار، سقف دوامضایی ← تغییر به `Posted` یا `202 Awaiting Approval` | `409`, `422 FISCAL_PERIOD_CLOSED / INSUFFICIENT_STOCK` |
| **12. Invoice** | `POST /api/v1/invoices/:id/reverse` | `FIN-AR-INV-001` | `invoice:reverse` | **بله** | ورودی: `{ reason_fa, reversal_date }` ← ابطال با سند معکوس بدون حذف/ویرایش سند `Posted` | `403`, `422` |
| **13. Payment** | `POST /api/v1/payments` | `FIN-AR-PAY-002` / `FIN-AP-PAY-002` | `payment:post` | **بله** | ورودی: `{ direction, contact_id, method, amount_irr, bank_account_id, allocations[] | auto_fifo }` | `422 ALLOCATION_EXCEEDS_OPEN_BALANCE` |
| **14. Bank** | `POST /api/v1/bank-accounts/:id/import-statement` | `TRS-BANK-IMP-001` | `bank:reconcile` | **بله** | دریافت فایل اکسل/CSV/PDF صورتحساب بانک ← ایجاد `import_batches` و `bank_transactions` | `422` |
| **15. Checks** | `POST /api/v1/checks/:id/transition` | `TRS-CHK-001` | `check:manage` | **بله** | ورودی: `{ to_status: 'DEPOSITED'|'CLEARED'|'BOUNCED', event_date, bank_account_id? }` ← ثبت `check_status_history` | `409 INVALID_CHECK_TRANSITION` |
| **16. Recon** | `POST /api/v1/reconciliations/bank/run` | `TRS-BANK-REC-001` | `bank:reconcile` | **بله** | اجرای تطبیق خودکار `EXACT_CONFIRMED` و `PROBABILISTIC_SUGGESTED` روی تراکنش‌های `UNMATCHED` | `202` / `200` |
| **16. Recon** | `POST /api/v1/reconciliations/matches/:id/decide` | `TRS-BANK-REC-001` | `bank:reconcile` | **بله** | تایید دستی (`MANUAL_CONFIRMED`) یا رد پیشنهاد تطبیق | `409` |
| **17. Inventory** | `POST /api/v1/inventory/transfers` | `INV-MOV-001` | `inventory:move` | **بله** | ورودی: `{ from_warehouse_id, to_warehouse_id, items[] }` ← ایجاد جفت حرکت با `transfer_group_id` مشترک | `422 INSUFFICIENT_STOCK` |
| **17. Inventory** | `POST /api/v1/inventory/adjustments/:id/post` | `INV-REC-001` | `inventory:post_adjustment` | **بله** | ثبت قطعی تعدیل انبارگردانی با چک `Dual Approval` | `403`, `422` |
| **18. Profit** | `POST /api/v1/profitability/calculate` | `PRF-COGS-001`, `PRF-GM-001`, `PRF-NET-001` | `report:view_cost_profit` | **بله** | محاسبه سود ناخالص، سود واقعی و `cost_coverage_pct` در `ErpkianReportEnvelope v1` | `422 VALUATION_POLICY_UNSET` |
| **19. Reports** | `POST /api/v1/reports/ar-aging` | `FIN-AR-AGING-001` | `ar:view_aging` | **بله** | ورودی: `{ as_of_date, branch_id? }` ← ایجاد Snapshot و نسخه گزارش (`v1`/`v2`) + شواهد | `403` |
| **19. Reports** | `GET /api/v1/reports/executions/:id/diff/:otherVersionId` | `RPT-DIFF-001` | مطابق ماژول گزارش | خیر | مقایسه `v1` و `v2` بدون بازنویسی گذشته | `404` |
| **20. Export** | `POST /api/v1/exports` | `RPT-EXPORT-001` | `report:export` | **بله** | ورودی: `{ report_version_id, format: 'PDF'|'EXCEL'|'CSV'|'JSON' }` ← صف `q.export.render` (`202`) | `403`, `404` |
| **21. Tax** | `POST /api/v1/tax/vat-draft` | `TAX-PREP-VAT-001` | `tax:prepare_validate` | **بله** | خروجی پیش‌نویس VAT با برچسب اجباری `NON_OFFICIAL_DRAFT` | `403` |
| **21. Tax** | `POST /api/v1/tax/submissions/moadian` | `TAX-SUB-MOADIAN-001` | `—` | — | **همیشه مسدود در v1:** `403 FEATURE_LOCKED_IN_V1` | `403 FEATURE_LOCKED_IN_V1` |
| **22. Approval** | `POST /api/v1/approvals/:id/decide` | `DOC-POST-008` | مطابق `required_permission_code` | **بله** | ورودی: `{ decision: 'APPROVED'|'REJECTED', comment_fa }` ← کنترل `decided_by <> requested_by` | `403 SELF_APPROVAL_FORBIDDEN` |
| **23. AI Chat** | `POST /api/v1/conversations/:id/messages` | `AI Assistant` | عضو فعال | **بله** | ورودی: `{ text, context_filters? }` ← SSE / JSON شامل متن توضیحی + `widgets[]` + `tool_invocations` | `403`, `429` |
| **24. Sync** | `POST /api/v1/integrations/imports/upload` | `INT-SYNC-001` | `org:manage_rbac_sync` | **بله** | آپلود فایل اکسل/CSV هلو یا سپیدار ← ساخت `import_batches` و اجرای صف | `409`, `422` |
| **25. Agent** | `POST /api/v1/agent/sync-batches` | `INT-SYNC-001` | `X-Agent-Device-Key` | **بله** | دریافت بسته JSON استخراج‌شده از هلو/سپیدار (`read_only = true`) با `row_hash` | `401 AGENT_DEVICE_REVOKED`, `403` |
| **26. Audit** | `GET /api/v1/audit-logs` | — | `OWNER`, `CFO` | خیر | مشاهده تغییرناپذیر عملیات حساس با فیلتر تاریخ، کاربر و موجودیت | `403` |
