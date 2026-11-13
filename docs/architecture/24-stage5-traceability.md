# 24 — ماتریس ردیابی جامع مرحله پنجم، ممیزی بخش ۲۲ و گیت‌های کیفیت (`Stage 5 Traceability & Quality Gates`)

این سند زنجیره اتصال بدون گسست بین **مرحله ۲ (`PRD`) ← مرحله ۳ (`109` جدول) ← مرحله ۴ (`62` خدمت، `10` گردشکار، `81` تست) ← مرحله ۵ (`25` ماژول، `26` گروه API، `16` صفحه، `13` صف، `14` مایلستون)** را مستند می‌سازد و تطبیق کامل با بخش‌های ۲۲ و ۲۳ را گزارش می‌دهد.

---

## ۱. ماتریس ردیابی سرتاسری دسته‌های ۹گانه (`A` تا `I`)

| دسته مرحله ۴ | سرویس‌ها | گردشکارها (`WF-*`) | ماژول‌های Backend (`04`) | گروه‌های API (`08`) | صفحات UI (`06`) | صف‌ها و رویدادها (`11`) | جداول مرحله ۳ | تست‌های مرجع (`19`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. اسناد و OCR** | `DOC-INGEST-001` تا `DOC-LINK-009` (`9`) | `WF-DOC-OCR-001`, `WF-INV-REG-001` | `documents`, `ocr-ingestion`, `contacts`, `workflow` | `10. Docs`, `11. OCR`, `22. Approvals` | `/documents/upload`, `/documents/review`, `/approvals` | `q.ocr.*`, `DocumentUploaded`, `OcrExtractionCompleted` | `document_*`, `extraction_*`, `entity_match_*` (`19`) | `DQT-09, 14`, `NST-06`, `THR-12..15` |
| **B. دریافتنی (`AR`)** | `FIN-AR-INV-001` تا `FIN-AR-PROFILE-001` (`8`) | `WF-INV-REG-001`, `WF-PAY-ALLOC-001`, `WF-AR-AGING-001` | `invoices`, `payments`, `contacts`, `reporting` | `7. Contact`, `12. Invoice`, `13. Payment`, `19. Reports` | `/sales/invoices`, `/contacts`, `/reports` | `q.finance.posting`, `InvoicePosted`, `PaymentPosted` | `invoices`, `invoice_*`, `payments`, `payment_allocations`, `contacts*` | `GTC-01..03, 05, 06`, `DQT-01, 04..06, 10, 11` |
| **C. پرداختنی (`AP`)** | `FIN-AP-INV-001` تا `FIN-AP-PRIO-001` (`6`) | `WF-INV-REG-001`, `WF-PAY-ALLOC-001` | `invoices`, `payments`, `reconciliation`, `treasury` | `12. Invoice`, `13. Payment`, `16. Recon` | `/purchases/invoices`, `/treasury` | `q.finance.posting`, `InvoicePosted`, `PaymentPosted` | `invoices`, `payments`, `payment_allocations`, `reconciliation_*` | `GTC-01, 05`, `DQT-10, 13` |
| **D. بانک و خزانه** | `TRS-BANK-IMP-001` تا `TRS-CASH-REC-001` (`7`) | `WF-BANK-REC-001`, `WF-PAY-ALLOC-001` | `treasury`, `reconciliation`, `payments` | `14. Bank`, `15. Checks`, `16. Recon` | `/treasury`, `/workspace` | `q.reconciliation.bank`, `ChequeStatusChanged`, `ReconciliationRunCompleted` | `bank_*`, `checks*`, `reconciliation_*`, `financial_adjustments` | `GTC-11`, `THR-06` |
| **E. کالا و انبار** | `INV-MASTER-001` تا `INV-SLOW-001` (`7`) | `WF-INV-REG-001`, `WF-INV-ADJ-001` | `products`, `inventory`, `reconciliation` | `8. Product`, `9. Stock`, `17. Inventory` | `/inventory`, `/approvals` | `q.reconciliation.inventory`, `q.maintenance.snapshots`, `StockMoved`, `NegativeStockOccurred` | `product_*`, `unit_*`, `warehouses`, `inventory_*`, `stock_snapshots` | `GTC-04`, `DQT-03, 07, 12`, `NST-06/Role` |
| **F. فروش، خرید و ERP** | `SLS-*`, `PUR-*`, `INT-SYNC-001` (`7`) | `WF-ERP-SYNC-001` | `invoices`, `integrations`, `windows-agent-gateway` | `24. Sync`, `25. Agent` | `/sales/invoices`, `/settings/integrations` | `q.integration.sync`, `ImportBatchCompleted` | `source_systems`, `integration_*`, `sync_*`, `import_*`, `external_entity_mappings` | `DQT-09`, `NST-07`, `THR-18, 19` |
| **G. سودآوری و بها** | `PRF-COGS-001` تا `PRF-LOSS-001` (`5`) | `WF-PROFIT-PNL-001` | `profitability`, `inventory`, `invoices`, `reporting` | `18. Profit`, `6. Policy` | `/profitability` | `q.inventory.costing`, `ProfitabilityCalculated` | `accounting_policies`, `inventory_movements`, `invoice_lines`, `report_*` | `GTC-07..10`, `THR-06` |
| **H. گزارش مدیریتی** | `RPT-DASH-001` تا `RPT-EXPORT-001` (`5`) | `WF-AR-AGING-001`, `WF-PROFIT-PNL-001` | `reporting`, `export`, `ai-orchestration` | `19. Reports`, `20. Export`, `23. AI Chat` | `/dashboard`, `/reports`, `/workspace` | `q.reporting.generate`, `q.export.render`, `ReportVersionGenerated` | `report_*`, `conversations*`, `tool_invocations` | `DQT-15`, `THR-25`, تست Export 4-sheet |
| **I. مالیات و انطباق** | `TAX-PREP-*`, `TAX-VAL-*`, `TAX-SUB-*` (`8`) | `WF-TAX-PREP-001` | `tax`, `invoices`, `contacts`, `reporting` | `21. Tax` *(Submission قفل)* | `/tax` | `q.reporting.generate`, `TaxDraftPrepared` | `invoices`, `contacts`, `contact_identifiers`, `fiscal_periods` | `GTC-11`, `THR-24` (`403 Locked`) |

---

## ۲. نگاشت کامل ۲۷ سرویس P0 به معماری هدف (`P0 Traceability`)

| # | `service_code` (P0) | ماژول Backend | Endpoint اصلی (`/api/v1/...`) | صف / هماهنگ‌کننده | تست‌های پذیرش (`10-acceptance` + `19`) |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | `DOC-INGEST-001` | `documents` | `POST /documents/upload` | `q.ocr.preprocess` | `AC-DOC-01..03` + `THR-13` |
| 2 | `DOC-MERGE-002` | `documents` | `POST /documents/merge` | `q.ocr.preprocess` | `AC-DOC-04..06` |
| 3 | `DOC-OCR-003` | `ocr-ingestion` | `GET /ocr/documents/:docId` | FastAPI + `q.ocr.extract` | `AC-DOC-07..09` |
| 4 | `DOC-CLASS-004` | `ocr-ingestion` | *(داخلی در OCR Pipeline)* | `q.ocr.extract` | `AC-DOC-10..12` |
| 5 | `DOC-MATH-005` | `ocr-ingestion` + `kernel` | *(داخلی در Post-OCR)* | `q.ocr.postprocess` | `GTC-01..03` |
| 6 | `DOC-ENTITY-006` | `contacts` + `products` | `POST /entity-matches/:id/resolve` | `q.ocr.postprocess` | `AC-DOC-16..18` |
| 7 | `DOC-REVIEW-007` | `ocr-ingestion` | `POST /ocr/documents/:docId/review` | Synchronous ACID Tx | `DQT-14` |
| 8 | `DOC-POST-008` | `PostingCoordinator` | `POST /invoices/:id/post` | `PostingCoordinator` | `DQT-13, 16` + `NST-05, 08` |
| 9 | `DOC-LINK-009` | `documents` | `GET /documents/:id/view-url` | Synchronous + Access Log | `THR-12` |
| 10 | `FIN-AR-INV-001` | `invoices` | `POST /invoices` (SALE / RETURN) | `PostingCoordinator` | `GTC-01..03` + `DQT-05` |
| 11 | `FIN-AR-PAY-002` | `payments` | `POST /payments` (RECEIPT) | ACID Tx | `DQT-06, 10` |
| 12 | `FIN-AR-ALLOC-003` | `payments` | `POST /payments` / `POST /allocations` | ACID Tx (`FOR UPDATE`) | `GTC-06` + `DQT-10, 11` |
| 13 | `FIN-AR-AGING-001` | `reporting` + `invoices` | `POST /reports/ar-aging` | `q.reporting.generate` | `GTC-05` + `DQT-15` |
| 14 | `FIN-AP-INV-001` | `invoices` | `POST /invoices` (PURCHASE) | `PostingCoordinator` | `GTC-01` + `DQT-01` |
| 15 | `FIN-AP-PAY-002` | `payments` | `POST /payments` (PAYMENT_OUT) | ACID Tx | `DQT-10` |
| 16 | `FIN-AP-AGING-001` | `reporting` + `invoices` | `POST /reports/ap-aging` | `q.reporting.generate` | `GTC-05` |
| 17 | `TRS-BANK-IMP-001` | `treasury` + `integrations` | `POST /bank-accounts/:id/import-statement` | `q.integration.sync` | `DQT-09` |
| 18 | `TRS-BANK-REC-001` | `reconciliation` | `POST /reconciliations/bank/run` | `q.reconciliation.bank` | `GTC-11` |
| 19 | `TRS-CHK-001` | `treasury` | `POST /checks/:id/transition` | ACID Tx | Check state machine tests |
| 20 | `INV-MASTER-001` | `products` | `POST /products` | ACID Tx | `DQT-03, 07` |
| 21 | `INV-MOV-001` | `inventory` | `POST /inventory/transfers` | ACID Tx (`transfer_group_id`) | `GTC-04` + `DQT-12` |
| 22 | `INV-BAL-001` | `inventory` | `GET /stock/balances` | Read + Snapshot anchor | `GTC-04` |
| 23 | `INV-CARDEX-001` | `inventory` | `GET /stock/cardex/:productId` | Read + RBAC Cost filter | `THR-06` |
| 24 | `SLS-RPT-001` | `reporting` | `POST /reports/sales-summary` | `q.reporting.generate` | `DQT-15` + Branch Scope |
| 25 | `PRF-COGS-001` | `profitability` | `POST /profitability/calculate` | `q.inventory.costing` | `GTC-07, 08, 10` |
| 26 | `RPT-DASH-001` | `reporting` | `GET /reports/dashboard` | Read + Short Cache | `THR-06, 07` |
| 27 | `RPT-EXPORT-001` | `export` | `POST /exports` | `q.export.render` | Export 4-sheet & PDF tests |

*(تمام ۳۵ سرویس `P1`، `P2` و `P3` دیگر نیز در دسته‌های `A..I` جدول بخش ۱ و جداول کاتالوگ API سند `08` پوشش کامل دارند؛ از جمله دو سرویس `P3` یعنی `TAX-SUB-MOADIAN-001` و `TAX-SUB-RETURN-001` با قفل `LOCKED_IN_V1`)*.

---

## ۳. گزارش ویژه ممیزی بخش ۲۲ (`Stage 4 Audit Resolution Log`)

| شماره ممیزی | یافته ممیزی در خروجی مرحله ۴ | اقدام اصلاحی دقیق در اسناد مرحله ۵ | سند مرجع اصلاح در مرحله ۵ | وضعیت |
| :-: | :--- | :--- | :--- | :---: |
| **1** | تکراری بودن شناسه `CF-INV-01` هم برای محاسبه فاکتور (بخش ۱) و هم موجودی انبار (بخش ۳) | تفکیک رسمی به **`CF-DOC-INV-01`** (فاکتور) و **`CF-STK-01`** (موجودی لحظه‌ای) و افزودن Golden Tests مجزا برای هر دو | `09`, `19` (`GTC-01..04`) | `PROPOSED_FOR_OWNER_APPROVAL` |
| **2** | محاسبه اشتباه `GrossMarginPct` با صورت کسر `TrueOperatingMargin` در `CF-PRF-01` | جداسازی کامل فرمول **`GrossMarginPct`** (`GrossProfit / NetSales`) از **`TrueOperatingMarginPct`** (`TrueOperatingMargin / NetSales`) | `16`, `19` (`GTC-09`) | `PROPOSED_FOR_OWNER_APPROVAL` |
| **3** | ابهام در ترتیب محاسبه تخفیف ردیفی، تخفیف پای فاکتور و نرخ ثابت ۱۰٪ مالیات | تعریف ترتیب قطعی ۶مرحله‌ای (`PRE_TAX_PRORATA` با Largest Remainder + حالت استثنای `POST_TAX_DISCOUNT`) و نرخ مالیات تاریخ‌دار به جای عدد ثابت | `09`, `19` (`GTC-02`) | `PROPOSED_FOR_OWNER_APPROVAL` |
| **4** | پیش‌نویس Migration `011` با `NOT NULL DEFAULT 'A'` روی `service_definitions` | بازطراحی مشخصات غیرقابل اجرای Migration `011` به الگوی `Expand -> Explicit Backfill per service_code ('A'..'I') -> Validate NOT NULL` | `09` بخش ۳.۱ | `PROPOSED_FOR_OWNER_APPROVAL` |
| **5** | احتمال خلط بین Envelope عمومی REST API و `ErpkianReportEnvelope v1` | تفکیک صریح `ApiResponseEnvelope<T>` برای کل لایه REST و استقرار `ErpkianReportEnvelope v1` در لایه دامنه گزارش/فایل JSON | `07` بخش ۲ | `CONFIRMED` |
| **6** | اطمینان از عدم ترفیع خودسرانه تصمیم‌های باز `OD-01, 03, 04, 05, 12` | ثبت صریح برچسب `PROPOSED_FOR_OWNER_APPROVAL` در تمام ۲۵ سند و جدول تجمیعی `23-open-decisions.md` | `23-open-decisions.md` | `CONFIRMED` |
| **7** | ممنوعیت بازطراحی ۱۰۹ جدول مرحله سوم یا حذف فایل‌های مرحله ۴ | حفظ کامل فایل‌های `docs/PRD.md`, `docs/data-model/*` و `docs/processing/*` بدون ویرایش مخرب؛ مالکیت دقیق ۱۰۹ جدول در ۲۵ ماژول | `04-modular-monolith-design.md` | `CONFIRMED` |

---

## ۴. ارزیابی ۱۰ گیت کیفیت مرحله پنجم (`10 Quality Gates Verification`)

| گیت | معیار کنترل | وضعیت پاس | شواهد |
| :-: | :--- | :---: | :--- |
| **1** | **Consistency** — همخوانی با `PRD`, `109` جدول، `62` خدمت و رفع تناقض‌ها | `PASS` | بخش ۱ و ۳ همین سند + سند `23` |
| **2** | **Modularity** — تعریف مرز ۲۵ ماژول بدون چرخه و معیار استخراج | `PASS` | اسناد `04`, `05` + `module-dependencies.mmd` |
| **3** | **API Completeness** — پوشش ۲۶ گروه و >= ۳۰ Endpoint با قرارداد و خطا | `PASS` | اسناد `07`, `08` (۴۰+ Endpoint مستند) |
| **4** | **Financial Integrity** — قطعی بودن IRR، عدم Math در AI/UI، Golden Tests | `PASS` | اسناد `09`, `12`, `16`, `19` (`GTC-01..12`) |
| **5** | **Security** — ۲۵ بردار تهدید، RLS، S3، AI Injection و Agent Kill-Switch | `PASS` | سند `15` + `security-trust-boundaries.mmd` |
| **6** | **OCR Readiness** — خط لوله ۱۴گانه، چالش فارسی، Hybrid Engine و گیت `0.65`/`0.85` | `PASS` | سند `10` + `document-processing-flow.mmd` |
| **7** | **Operational Readiness** — ۱۳ صف BullMQ، ۱۲ رویداد، Outbox، بکاپ، مانیتورینگ | `PASS` | اسناد `11`, `17`, `18` + `event-driven-architecture.mmd` |
| **8** | **Deployability** — ۳ سناریو، ملاحظات تحریم/ایران و استراتژی گذار AI Studio | `PASS` | اسناد `17`, `20` + `deployment-architecture.mmd` |
| **9** | **Traceability** — اتصال کامل مراحل ۲ → ۳ → ۴ → ۵ و ۲۷ سرویس P0 | `PASS` | همین سند (`24-stage5-traceability.md`) |
| **10** | **No Premature Coding** — صفر کد رانتایم، صفر تغییر در `src/*` و `package.json` | `PASS` | وضعیت رسمی پیاده‌سازی: **`NOT IMPLEMENTED`** |
