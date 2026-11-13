# 04 — مشخصات گردشکارهای اجرایی مستقل از LLM (`Workflow Specifications`)

این سند چرخه حیات و قراردادهای اجرایی **گردشکارهای رسمی پلتفرم Erpkian** را تعریف می‌کند. تمام گردشکارها توسط **Workflow Orchestrator (`workflow_definitions` / `workflow_executions` / `workflow_step_executions`)** به صورت قطعی و قابل ازسرگیری اجرا می‌شوند و مستقل از مدل زبانی هستند.

---

## ۱. پایپ‌لاین استاندارد ۱۳ مرحله‌ای پلتفرم (`Standard 13-Stage Execution Pipeline`)

تمام درخواست‌های کاربر (چه از فرم UI، چه از آپلود فایل و چه از مکالمه دستیار) از این پایپ‌لاین عبور می‌کنند:

| مرحله | نام انگلیسی | نام فارسی | مسئول اجرا | خروجی / جدول ثبت |
| :---: | :--- | :--- | :--- | :--- |
| **۱** | `Intent Detection` | تشخیص نیت کاربر | AI Router / UI Action | `conversation_messages.detected_intent` |
| **۲** | `Service Discovery` | انتخاب سرویس و نسخه گردشکار | Service Registry | `service_definitions` + `workflow_definitions` |
| **۳** | `Permission Check` | کنترل عضویت، مجوز و شعبه | `NestJS Auth + RBAC Guard` | `membership_roles` / رد `403` در `security_events` |
| **۴** | `Data Readiness` | بررسی آمادگی و موجود بودن داده‌ها | Readiness Checker | `workflow_executions.current_state` |
| **۵** | `Missing Data Detection` | کشف دقیق کمبودها و فیلدهای مبهم | Validation Pre-check | لیست کمبودها در `checkpoint_state_json` |
| **۶** | `Document Collection` | توقف کنترل‌شده و دریافت سند/پارامتر | Orchestrator (`Awaiting Input`) | `documents` / `document_batches` |
| **۷** | `Extraction & Validation` | OCR، نرمال‌سازی، تطبیق نام و کنترل ریاضی | Python Worker + Validation | `extraction_attempts` + `VR-*` |
| **۸** | `Human Approval` | بازبینی خطاها و تایید دوامضایی بالای سقف | UI Review + `approval_requests` | `extraction_reviews` / `approval_requests` |
| **۹** | `Deterministic Processing` | اجرای محاسبه قطعی مالی/انبار/تطبیق | Processing Engine (`processing_jobs`) | `processing_results` + `processing_warnings` |
| **۱۰** | `Report Generation` | قفل Snapshot و ساخت گزارش نسخه‌دار | Reporting Engine | `report_data_snapshots` + `report_versions` + `report_metrics` |
| **۱۱** | `Evidence Linking` | اتصال اعداد به رکوردها و تصاویر مبدأ | Evidence Linker | `report_evidences` + `processing_result_sources` |
| **۱۲** | `Delivery` | تولید PDF/Excel/JSON و نمایش خلاصه به کاربر | Export Worker + AI Explainer | `report_outputs` + لینک کوتاه‌عمر S3 |
| **۱۳** | `Next Best Action` | پیشنهاد گام بعدی متناسب با نتیجه و نقش | Proactive / NBA Engine | دکمه‌های اقدام سریع یا `assistant_recommendations` |

---

## ۲. ماشین وضعیت استاندارد گردشکار (`Workflow State Machine`)
وضعیت‌های مجاز در `workflow_executions.current_state` مطابق مرحله سوم:
`Draft` ← `Checking Readiness` ← `Awaiting Input` ← `Processing` ← `Awaiting Review` ← `Awaiting Approval` ← `Completed` / `Partially Completed` / `Failed` / `Cancelled`

### قوانین مشترک مدیریت اجرا:
- **Pause / Resume (`checkpoint_state_json`):** در وضعیت‌های `Awaiting Input`، `Awaiting Review` و `Awaiting Approval` اجرای ماشین وضعیت متوقف (`Paused`) شده و آخرین گام، شناسه‌های فایل/سند و پارامترهای تاییدشده در `checkpoint_state_json` ذخیره می‌شود تا با بازگشت کاربر (حتی چند روز بعد) دقیقاً از همان نقطه ادامه یابد.
- **Retry Policy:** خطاهای موقت (`Transient Network/OCR Timeout`) حداکثر **۳ بار** با تاخیر نمایی (`Backoff: 5s, 20s, 60s`) و بدون تغییر `idempotency_key` تکرار می‌شوند؛ خطاهای منطقی/داده (`INCOMPLETE_INPUT`, `FISCAL_PERIOD_CLOSED`) بلافاصله متوقف و به کاربر گزارش می‌شوند.
- **Idempotency:** کلید `idempotency_key` در سطح سازمان یکتا است (`SHA256(org_id + workflow_code + canonical_target_ids + params)`). درخواست تکراری یک اجرای جدید نمی‌سازد.
- **Audit Logging:** هر تغییر وضعیت یک ردیف Append-only در `workflow_step_executions` و عملیات مالی نهایی در `audit_logs` ثبت می‌کند.

---

## ۳. مشخصات ۱۰ گردشکار اصلی عملیاتی

### گردشکار ۱: `WF-DOC-OCR-001` — دریافت، پردازش OCR، کنترل ریاضی و تایید سند
- **نمودار مرجع:** `diagram-wf-ocr.mmd` | **سرویس‌های مرتبط:** `DOC-INGEST-001` تا `DOC-REVIEW-007`
- **وضعیت‌ها (`States`):** `Draft -> Checking Readiness -> Processing -> Awaiting Review -> Completed | Failed | Cancelled`
- **گام‌ها و ورودی/خروجی (`Steps & I/O`):**
  1. `INGEST_FILE`: ورودی فایل خام + `document_type_id` اختیاری ← بررسی MIME، سایز و `sha256_hash`؛ خروجی `document_id` + `document_version_id (v1 ORIGINAL)`.
  2. `PREPROCESS_PAGES`: ورودی `document_version_id` ← جداسازی صفحات PDF/ادغام عکس‌ها، چرخش و `quality_score`؛ خروجی `document_pages`. اگر `quality_score < 0.65` ← انتقال به `Awaiting Input` (درخواست عکس واضح‌تر).
  3. `RUN_OCR`: ارسال Job به صف Redis/BullMQ (`extraction_jobs`) ← خروجی `extraction_attempts`, `extracted_fields`, `extracted_tables/rows/cells`.
  4. `VALIDATE_AND_MATCH`: اجرای `VR-MATH-01..05`, `VR-DATE`, `VR-CURR`, `VR-ENT` و تطبیق نام مشتری/کالا با `pg_trgm` ← پر کردن `math_validation_passed` و `entity_match_candidates`.
  5. `HUMAN_REVIEW_GATE`: اگر هر فیلد `confidence < 0.85` یا `math_validation_passed = false` یا `CURRENCY_UNIT_AMBIGUOUS` ← `Awaiting Review`؛ در غیر این صورت نیز پیش از ثبت مالی نیازمند تایید نهایی کاربر (`extraction_reviews`) است.
- **قوانین انتقال (`Transitions`):** `Processing -> Awaiting Input` (تصویر تار) | `Processing -> Awaiting Review` (استخراج تمام شد) | `Awaiting Review -> Completed` (تایید کاربر + وضعیت `Verified`) | `Awaiting Review -> Cancelled` (رد سند به `Rejected`).
- **Pause/Resume:** توقف در `Awaiting Input` (در انتظار تصویر جدید) و `Awaiting Review` (در انتظار اصلاح سلول‌ها توسط کاربر) با حفظ مختصات و داده‌های استخراجی قبلی.
- **خطاها و Retry:** خطای سرویس OCR ← ۳ بار Retry خودکار؛ پس از ۳ شکست ← `Failed` با گزینه «تلاش مجدد دستی با مدل جایگزین».
- **Idempotency:** بر مبنای `(org_id, sha256_hash, document_version_id)`.
- **سطح تایید انسانی:** تایید بازبین (`document:review_ocr`)؛ هنوز `Posted` مالی محسوب نمی‌شود.
- **قوانین لغو (`Cancellation`):** قبل از `Posted` کاربر می‌تواند سند را لغو/رد (`Rejected`) کند؛ فایل خام طبق `data_retention_policies` محفوظ می‌ماند.
- **Audit Logging:** ثبت تمام اصلاحات عددی با `value_before`/`value_after` در `extraction_corrections` و رویداد گام‌ها در `workflow_step_executions`.
- **پیام‌های فارسی کاربر:**
  - *توقف خوانایی:* «کیفیت تصویر صفحه ۲ پایین است (`امتیاز ۰.۴۸`). لطفاً عکس واضح‌تری جایگزین کنید یا ادامه را دستی اصلاح نمایید.»
  - *نیاز به بازبینی:* «سند استخراج شد، اما جمع سطر ۳ با جمع کل سند ۲,۰۰۰,۰۰۰ ریال اختلاف دارد. لطفاً کادر هایلایت‌شده را بررسی کنید.»
  - *تکمیل:* «سند با موفقیت بررسی و در وضعیت `تایید اولیه (Verified)` قرار گرفت. اکنون می‌توانید آن را ثبت قطعی کنید.»

---

### گردشکار ۲: `WF-INV-REG-001` — ثبت و تایید قطعی فاکتور فروش یا خرید
- **نمودار مرجع:** `diagram-wf-invoice.mmd` | **سرویس‌های مرتبط:** `FIN-AR-INV-001`, `FIN-AP-INV-001`, `DOC-POST-008`, `INV-MOV-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Awaiting Input -> Processing -> Awaiting Review -> Awaiting Approval -> Completed | Failed | Cancelled`
- **گام‌ها و I/O:**
  1. `CHECK_CONTEXT`: ورودی هدر/ردیف فاکتور یا `document_id` `Verified` ← بررسی دوره مالی `OPEN` (`VR-PER-01/02`)، واحد پول (`VR-CURR`)، تکراری نبودن شماره فاکتور (`VR-DUP-02`) و اعتبار طرف حساب/کالا (`VR-ENT-02`).
  2. `NORMALIZE_UOM_AND_MATH`: تبدیل `quantity` به `base_quantity` از `product_units` (`VR-UOM`) و بازمحاسبه قطعی `subtotal`, `discount`, `tax`, `net_total` (`CF-INV-01`).
  3. `STOCK_AND_CREDIT_CHECK`: در فاکتور فروش بررسی موجودی منفی (`VR-INV-01`) و سقف اعتبار مشتری (`FIN-AR-CREDIT-001`).
  4. `APPROVAL_GATE`: مقایسه `net_total_irr` با `organization_settings.require_dual_approval_above_irr` و مجوز `invoice:post`. اگر مبلغ بالای سقف یا کاربر فاقد مجوز `Post` باشد ← ایجاد `approval_requests` و انتقال به `Awaiting Approval`.
  5. `COMMIT_POSTING`: تغییر `lifecycle_status = 'Posted'`، ایجاد ردیف‌های `inventory_movements` و ثبت `audit_logs`.
- **Pause/Resume:** توقف در `Awaiting Input` (نبود ضریب تبدیل کارتن به عدد یا ابهام ریال/تومان) و `Awaiting Approval` (انتظار امضای مدیر مالی).
- **خطاها و Retry:** خطای تراکنش دیتابیس (Deadlock) ← ۲ بار Retry؛ خطای موجودی منفی یا دوره بسته ← توقف فوری (`Failed` یا `Awaiting Input`).
- **Idempotency:** `invoices.idempotency_key` یکتا در سطح سازمان.
- **سطح تایید انسانی:** زیر سقف ← `SENIOR_ACCOUNTANT`/`CFO`/`OWNER`؛ بالای سقف ← تایید دوامضایی (`Dual Approval`) در `approval_requests`.
- **قوانین لغو:** پیش از `Posted` قابل لغو به `Cancelled`؛ پس از `Posted` لغو مستقیم ممنوع و فقط از مسیر صدور فاکتور معکوس (`Reversed`) مجاز است.
- **Audit Logging:** ثبت `INVOICE_POSTED` با `before_state_json` / `after_state_json` و `approved_by_membership_id`.
- **پیام‌های فارسی کاربر:**
  - *نقص واحد:* «ضریب تبدیل واحد «کارتن» به «عدد» برای کالای «رب گوجه ۸۰۰ گرمی» تعریف نشده است. تعداد عدد در هر کارتن را وارد کنید.»
  - *نیاز به تایید دوامضایی:* «مبلغ فاکتور (`۶۵۰,۰۰۰,۰۰۰ ریال`) بالاتر از سقف مجاز ثبت مستقیم است و برای تایید به مدیر مالی ارسال شد.»

---

### گردشکار ۳: `WF-PAY-ALLOC-001` — ثبت دریافت/پرداخت، چک و تخصیص چندبه‌چند به فاکتورها
- **سرویس‌های مرتبط:** `FIN-AR-PAY-002`, `FIN-AP-PAY-002`, `FIN-AR-ALLOC-003`, `TRS-CHK-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Awaiting Input -> Processing -> Awaiting Approval -> Completed | Failed | Cancelled`
- **گام‌ها و I/O:** ورودی سند دریافت/پرداخت و لیست فاکتورهای هدف یا حالت `FIFO_AUTO` ← کنترل دوره باز و حساب بانکی (`bank_accounts`) ← در روش `CHEQUE` ایجاد رکورد `checks` و `check_status_history` ← اجرای تخصیص `1:1`، `M:1`، `1:M` یا `FIFO` در `payment_allocations` با کنترل `VR-MATH-06` ← ثبت `Posted`.
- **Pause/Resume:** اگر مبلغ دریافت بزرگ‌تر از جمع فاکتورهای انتخابی یا فاقد طرف حساب مشخص باشد ← `Awaiting Input` (تایید ثبت باقی‌مانده به عنوان بستانکاری علی‌الحساب).
- **خطاها و Retry / Idempotency:** کنترل `payments.idempotency_key`؛ در صورت عبور از مانده فاکتور ← خطای `ALLOCATION_OVERFLOW` بدون ثبت ناقص.
- **سطح تایید انسانی:** تایید `payment:post`؛ پرداخت‌های خروجی بالای سقف سازمان نیازمند `approval_requests`.
- **قوانین لغو:** پس از `Posted` فقط `Reversed` (همراه با `status = 'REVERSED'` روی `payment_allocations`).
- **پیام فارسی کاربر:** «دریافت `۹۰,۰۰۰,۰۰۰ ریال` با موفقیت به ۳ فاکتور باز (`#101` کامل، `#102` کامل، `#103` جزئی به مبلغ `۱۰,۰۰۰,۰۰۰ ریال`) تخصیص یافت.»

---

### گردشکار ۴: `WF-BANK-REC-001` — ورود صورتحساب و مغایرت‌گیری خودکار بانک
- **نمودار مرجع:** `diagram-wf-bank-reconcile.mmd` | **سرویس‌های مرتبط:** `TRS-BANK-IMP-001`, `TRS-BANK-REC-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Awaiting Input -> Processing -> Awaiting Review -> Partially Completed | Completed | Failed`
- **گام‌ها و I/O:** ورود ردیف‌های بانک به `bank_transactions` ← ایجاد `reconciliation_runs` ← اجرای ۴ گذر تطبیق (`CF-TRS-01`): تطبیق قطعی کد پیگیری/مبلغ، تطبیق چک صیاد، تطبیق احتمالی با تلرانس روز/کارمزد، تطبیق تجمیعی POS ← تفکیک `EXACT_CONFIRMED`، `PROBABILISTIC_SUGGESTED` و `reconciliation_exceptions`.
- **Pause/Resume:** تا زمانی که موارد `PROBABILISTIC_SUGGESTED` یا استثناهای `OPEN` توسط حسابدار تعیین تکلیف نشوند، وضعیت گردشکار `Awaiting Review` یا `Partially Completed` می‌ماند و در گزارش خروجی «تطبیق‌نیافته‌های باز» درج می‌شود.
- **سطح تایید انسانی:** تطبیق `EXACT_CONFIRMED` ثبت خودکار؛ تطبیق احتمالی (`0.70..0.99`) **حتماً** نیازمند کلیک تایید/رد حسابدار (`MANUAL_CONFIRMED` / `REJECTED`) است.
- **پیام فارسی کاربر:** «از ۱۲۰ تراکنش بانکی، ۹۴ مورد قطعی تطبیق داده شد، ۱۸ مورد احتمالی منتظر تایید شماست و ۸ تراکنش بدون سند متناظر یافت شد.»

---

### گردشکار ۵: `WF-AR-AGING-001` — تحلیل سنی مطالبات و گزارش مشتریان معوق
- **نمودار مرجع:** `diagram-wf-ar-aging.mmd` | **سرویس‌های مرتبط:** `FIN-AR-AGING-001`, `FIN-AR-CREDIT-001`, `RPT-EXPORT-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Processing -> Completed | Partially Completed | Failed`
- **گام‌ها و I/O:** چک مجوز `ar:view_aging` و `branch_scope_id` ← شمارش فاکتورها و دریافت‌های `Needs Review` ← ثبت `report_data_snapshots` ← محاسبه قطعی مانده باز، چک‌های `IN_HAND` و سبدهای سنی (`CF-AR-01`, `CF-AR-02`) ← ذخیره `report_versions`، `report_metrics` و `report_evidences` ← تولید JSON/PDF/Excel.
- **قانون شفافیت:** اگر سند معلق وجود داشته باشد وضعیت `Partially Completed` (با سطح اطمینان `MEDIUM`/`LOW`) و هشدار `PENDING_DOCS_EXCLUDED` صادر می‌شود.
- **پیام فارسی کاربر:** «گزارش سنی مطالبات تا تاریخ `۱۴۰۵/۰۸/۲۵` با `۴۰` فاکتور قطعی تولید شد. ⚠️ توجه: `۲` فاکتور و `۱` رسید منتظر تایید در محاسبه لحاظ نشده‌اند.»

---

### گردشکار ۶: `WF-INV-ADJ-001` — مغایرت‌گیری انبارگردانی و تعدیل موجودی
- **سرویس‌های مرتبط:** `INV-BAL-001`, `INV-REC-001`, `INV-MOV-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Awaiting Input -> Processing -> Awaiting Review -> Awaiting Approval -> Completed | Cancelled`
- **گام‌ها و I/O:** دریافت فایل شمارش انبار + تاریخ مبنا ← محاسبه موجودی سیستم در همان تاریخ (`CF-INV-01`) ← مقایسه تعدادی و کشف `STOCK_VARIANCE` ← تولید پیش‌نویس `inventory_adjustments` (`Needs Review`) ← تایید انباردار/حسابدار (`Verified`) ← تایید نهایی مدیر مالی (`inventory:post_adjustment` در `approval_requests`) ← ثبت `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` در `inventory_movements`.
- **سطح تایید انسانی:** هیچ کسری/اضافه انبار بدون تایید `CFO`/`OWNER` به موجودی رسمی تبدیل نمی‌شود.

---

### گردشکار ۷: `WF-PROFIT-PNL-001` — محاسبه بهای تمام‌شده، سودآوری و سود و زیان عملیاتی
- **نمودار مرجع:** `diagram-wf-reporting.mmd` | **سرویس‌های مرتبط:** `PRF-COGS-001`, `PRF-GM-001`, `PRF-NET-001`, `RPT-PNL-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Awaiting Input -> Processing -> Completed | Partially Completed | Failed`
- **گام‌ها و I/O:** کنترل `report:view_cost_profit` ← بررسی `accounting_policies.inventory_valuation_method`؛ اگر `UNSPECIFIED` باشد ← توقف در `Awaiting Input` (`VALUATION_POLICY_UNSET`) ← اجرای محاسبه COGS (`WEIGHTED_AVERAGE` یا `FIFO`) ← محاسبه `cost_coverage_pct` (`CF-PRF-02`) ← تفکیک کالاهای فاقد بهای خرید ← ذخیره نسخه گزارش + شواهد.
- **پیام فارسی کاربر:** «گزارش سود ناخالص با پوشش `۹۴.۵٪` از فروش محاسبه شد. برای ۳ کالا (۵.۵٪ فروش) فاکتور خرید یا موجودی اول دوره ثبت نشده بود و از محاسبه سود مستثنی شدند.»

---

### گردشکار ۸: `WF-ERP-SYNC-001` — ورود داده و همگام‌سازی یک‌طرفه از هلو/سپیدار/اکسل
- **سرویس‌های مرتبط:** `INT-SYNC-001`, `DOC-ENTITY-006`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Awaiting Input -> Processing -> Awaiting Review -> Completed | Partially Completed | Failed`
- **گام‌ها و I/O:** دریافت فایل اکسل/پکیج Agent (`read_only = true`) ← بررسی `idempotency_key` و `row_hash` ← کنترل `external_entity_mappings` ← ایجاد کاندیداهای تطبیق جدید در `entity_match_candidates` ← در صورت وجود خطای سطری یا نگاشت تاییدنشده ← ورود سطرهای سالم به `Needs Review`/`Verified` و توقف رکوردهای خطادار در `sync_errors` / `import_rows (INVALID)`.

---

### گردشکار ۹: `WF-PERIOD-CLOSE-001` — بستن و قفل دوره مالی (و بازگشایی کنترل‌شده)
- **سرویس‌های مرتبط:** `DOC-POST-008`, `TRS-BANK-REC-001`, `INV-REC-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Awaiting Review -> Awaiting Approval -> Completed | Failed`
- **گام‌ها و I/O:** بررسی وجود اسناد `Needs Review`، استثناهای باز بانکی و کسری‌های انبار در دوره هدف ← اعمال `SOFT_LOCK` توسط حسابدار ارشد/مدیر مالی ← تولید Snapshot پایان دوره (`report_data_snapshots` + `stock_snapshots`) ← تایید نهایی `CLOSED` توسط `CFO`/`OWNER` و ثبت در `period_locks`. بازگشایی (`REOPEN`) فقط با مجوز `period:close_reopen` و دلیل کتبی حداقل ۵ کاراکتری مجاز است.

---

### گردشکار ۱۰: `WF-TAX-PREP-001` — آماده‌سازی و اعتبارسنجی پیش‌نویس مالیاتی فصل
- **سرویس‌های مرتبط:** `TAX-PREP-VAT-001`, `TAX-PREP-EXEMPT-001`, `TAX-PREP-READY-001`, `TAX-VAL-INVOICE-001`, `TAX-VAL-SEASONAL-001`
- **وضعیت‌ها:** `Draft -> Checking Readiness -> Processing -> Partially Completed | Completed | Failed`
- **گام‌ها و I/O:** بررسی `tax:prepare_validate` ← کنترل بازه فصل شمسی ← ارزیابی کامل بودن `contact_identifiers` (شناسه ملی/اقتصادی) و نرخ مالیات ردیف‌ها ← اجرای محاسبه قطعی `CF-TAX` ← خروجی کارپوشه پیش‌نویس همراه با **برچسب اجباری غیررسمی بودن و عدم ارسال مستقیم به مودیان**.
