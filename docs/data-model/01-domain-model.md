# 01 — مدل دامنه و موجودیت‌های تجاری (`Domain Model`)

این سند حوزه‌های ۱۳گانه مدل داده `Erpkian`، مسئولیت هر موجودیت، قواعد تجاری حاکم بر شرکت‌های پخش و عمده‌فروشی و الگوی توسعه برای سایر کسب‌وکارها را تشریح می‌کند.

---

## ۱. حوزه `Organization & Identity` (سازمان، هویت و دسترسی)
* **مسئله تجاری:** یک حسابدار مستقل یا مدیر مالی ممکن است همزمان برای چند شرکت پخش کار کند و در شرکت اول «حسابدار» و در شرکت دوم «مدیر مالی با حق تایید» باشد؛ همچنین یک شرکت پخش دارای چندین شعبه/انبار است.
* **موجودیت‌ها:**
  * `business_types`: مرجع نوع کسب‌وکار (`distribution_wholesale`, `retail`, `manufacturing`, `service`, `personal`).
  * `organizations`: ریشه Tenant؛ مالک تمام داده‌های مالی و اسنادی.
  * `business_profiles` *(`PROVISIONAL`)*: تنظیمات تخصصی صنعت متصل به سازمان (مانند فعال بودن چندواحدی پخش، رژیم مالیاتی، مدل فروش مویرگی).
  * `organization_settings`: تنظیمات عملیاتی تایپ‌شده (دوره پیش‌فرض سررسید فاکتور، سیاست موجودی منفی، سقف تایید دوامضایی، دقت اعشار).
  * `branches`: شعب یا مراکز عملیات سازمان.
  * `users`: هویت سراسری شخص (ایمیل/موبایل/MFA).
  * `organization_memberships`: اتصال کاربر به سازمان؛ تمام مجوزها و انتساب‌ها به `membership_id` متصل می‌شوند نه به `user_id` صرف.
  * `roles`, `permissions`, `role_permissions`, `membership_roles`: مدل RBAC منعطف (شامل نقش‌های استاندارد سیستمی و نقش‌های سفارشی سازمان، با قابلیت محدودسازی دسترسی به یک شعبه خاص `branch_scope_id`).
  * `invitations`: دعوت‌نامه امن عضویت در سازمان با توکن هش‌شده و تاریخ انقضا.

---

## ۲. حوزه `Fiscal & Localization` (تقویم، دوره مالی، ارز و واحد سنجش)
* **مسئله تجاری:** در ایران تاریخ رسمی شمسی است ولی محاسبه اختلاف روز، مرتب‌سازی و منطقه زمانی در دیتابیس باید با نوع استاندارد میلادی (`DATE`/`TIMESTAMPTZ`) انجام شود؛ همچنین اختلاط ریال و تومان و تبدیل کارتن به عدد از پرتکرارترین خطاهاست.
* **قواعد کلیدی:**
  * **سال و دوره مالی (`fiscal_years`, `fiscal_periods`):** هر سازمان سال مالی خود را تعریف می‌کند (مثلاً ۱۴۰۵/۰۱/۰۱ تا ۱۴۰۵/۱۲/۲۹) و دوره‌های ماهانه یا فصلی زیرمجموعه آن است.
  * **قفل دوره (`period_locks`):** وقتی دوره‌ای به `CLOSED` منتقل شود، هیچ فاکتور، دریافت، پرداخت یا تعدیل انباری در بازه آن دوره قابل ثبت (`Posted`) یا تغییر نیست. بازگشایی دوره بسته فقط توسط نقش دارای مجوز `fiscal:reopen_period` (معمولاً مدیر مالی یا مالک سازمان) و با ثبت اجباری دلیل و کاربر تاییدکننده در جدول Append-only `period_locks` انجام می‌شود.
  * **تاریخ شمسی و میلادی:** تمام تاریخ‌های واقعی با نوع `DATE` یا `TIMESTAMPTZ` ذخیره می‌شوند و در کنار آن، ستون `*_jalali` (`CHAR(10)` با فرمت `YYYY/MM/DD`) برای ردیابی و جستجوی سریع و `*_raw` (در لایه Extraction) برای نگهداری رشته خام سند منبع استفاده می‌شود.
  * **واحد پول (`currencies`, `exchange_rates`):** ستون‌های محاسباتی داخلی با واحد پایه کاننیکال **`IRR` (ریال صحیح)** نگهداری می‌شوند، ضمن آنکه ارز اصلی سند (`currency_code`: مثلاً `IRT` یا `IRR`) و نرخ تبدیل زمان سند (`exchange_rate_to_base`: مثلاً `10` برای تومان به ریال) دقیقاً ثبت می‌شود.
  * **واحدهای سنجش (`units_of_measure`, `unit_conversions`):** تبدیل واحد می‌تواند **هم در سطح عمومی** (مثلاً `1 kg = 1000 g`) و **هم در سطح اختصاصی هر کالا** (مثلاً `کارتن ۲۴تایی` برای آبمیوه، `کارتن ۱۲تایی` برای روغن) تعریف شود. اولویت در محاسبه با جدول اختصاصی `product_units` است.
  * **سیاست مالی (`accounting_policies`):** روش ارزش‌گذاری موجودی (`WEIGHTED_AVERAGE`, `FIFO`, یا `UNSPECIFIED`) به صورت صریح و تاریخ‌دار برای سازمان ثبت می‌شود؛ اگر `UNSPECIFIED` باشد، موتور مالی گزارش ارزش ریالی موجودی را با وضعیت `INCOMPLETE_POLICY` متوقف یا هشداردار اعلام می‌کند.

---

## ۳. حوزه `Contacts & Entity Resolution` (طرف حساب‌ها و یکتاسازی)
* **مسئله تجاری:** «فروشگاه بهار»، «آقای کریمی - بهار» و کد `1042` در سپیدار همگی یک مشتری هستند، و همزمان ممکن است یک شرکت هم تأمین‌کننده باشد و هم مشتری.
* **موجودیت‌ها:**
  * `contacts`: موجودیت یکتای طرف حساب با پرچم‌های `is_customer`, `is_supplier`, `is_employee` و وضعیت ادغام (`ACTIVE`, `MERGED`).
  * `contact_roles`: نقش‌های تجاری تفکیکی و کدهای داخلی/اعتباری طرف حساب.
  * `contact_identifiers`: شناسه ملی، کد اقتصادی، شماره موبایل، شبا و شماره کارت برای تطبیق قطعی.
  * `contact_addresses`: آدرس‌های تحویل/صورتحساب (حیاتی برای تحلیل مسیر پخش).
  * `entity_match_candidates`: **جداسازی تطبیق احتمالی از قطعی**؛ نتایج Fuzzy Matching در این جدول با وضعیت `PENDING` قرار می‌گیرند تا انسان تایید یا رد کند.
  * `entity_merge_history`: تاریخچه تغییرناپذیر ادغام دو طرف حساب (هیچ رکوردی پس از ادغام حذف نمی‌شود؛ رکورد قدیمی به `MERGED` تغییر وضعیت داده و به `merged_into_contact_id` اشاره می‌کند).

---

## ۴. حوزه `Product & Inventory` (کالا، انبار و گردش موجودی)
* **مسئله تجاری:** در پخش، کالا به کارتن خریداری می‌شود و به کارتن یا عدد فروخته می‌شود؛ موجودی باید از روی رویدادها قابل بازسازی باشد.
* **موجودیت‌ها:**
  * `product_categories`, `products`, `product_identifiers`: سلسله‌مراتب کالا و شناسه‌های بارکد/ایران‌کد/کد تامین‌کننده.
  * `product_units`: واحدهای فرعی هر کالا و ضریب تبدیل دقیق به `base_uom_id` (مثلاً `1 Carton = 24 Pcs`) همراه با قیمت پیش‌فرض هر واحد.
  * `warehouses`, `inventory_locations`: انبارها (متصل به شعبه) و قفسه/محل نگهداری اختیاری.
  * `inventory_movements`: دفتر کل گردش تعدادی و بهای کالا؛ ذخیره همزمان `source_uom_id` + `source_qty` و مقدار تبدیل‌شده `base_qty_signed` (مثبت برای ورود، منفی برای خروج).
  * `inventory_adjustments`: اسناد تعدیل شمارش/ضایعات نیازمند تأیید.
  * `stock_snapshots`: موجودی اول دوره یا عکس لحظه‌ای تاییدشده در یک تاریخ مشخص به عنوان نقطه لنگر بازسازی.

---

## ۵. حوزه `Document Management` (مدیریت اسناد و فایل‌ها)
* **مسئله تجاری:** یک فاکتور ممکن است ۳ عکس موبایل باشد که کاربر آن را برش داده، چرخانده و به ۱ PDF تبدیل کرده است؛ فایل خام اصلی هرگز نباید از بین برود.
* **موجودیت‌ها:**
  * `document_types`, `document_batches`, `document_storage_objects`: نوع سند، دسته بارگذاری و اشاره به آبجکت رمزنگاری‌شده S3 با `sha256_hash`.
  * `documents`: پرونده منطقی سند با چرخه عمر `Uploaded → Processing → Needs Review → Verified → Eligible for Posting → Posted` (یا `Rejected`).
  * `document_versions` و `document_pages`: جداسازی نسخه اصلی (`ORIGINAL`) از نسخه اصلاح‌شده (`IMAGE_ENHANCED`, `MERGED_PDF`) و نگهداری ترتیب صفحات و امتیاز خوانایی (`quality_score`).
  * `document_relations`: مدل‌سازی رابطه **چندبه‌چند (M:N)** بین اسناد و رکوردهای مالی (مثلاً ۳ برگ رسید متصل به ۱ فاکتور یا ۱ فایل PDF شامل ۵ فاکتور).
  * `document_access_logs`: ثبت مشاهده، دانلود و درخواست حذف فایل‌های محرمانه.

---

## ۶. حوزه `OCR & Extraction` (استخراج هوشمند و بازبینی انسانی)
* **مسئله تجاری:** یک سند ممکن است با نسخه ۱ موتور OCR خوانده شود، خطا داشته باشد، دوباره با نسخه ۲ اجرا شود و نهایتاً حسابدار سه سلول جدول آن را اصلاح کند.
* **موجودیت‌ها:**
  * `extraction_model_versions`: رجیستری مدل‌ها/موتورهای OCR و VLM.
  * `extraction_jobs` و `extraction_attempts`: پشتیبانی از اجرای چندباره روی یک سند بدون پاک کردن خروجی قبلی.
  * `ocr_page_results`, `extracted_fields`, `extracted_tables`, `extracted_table_rows`, `extracted_table_cells`: نگهداری کامل مختصات (`bbox_*`)، مقدار خام (`raw_value`)، مقدار استاندارد (`normalized_value`)، نوع داده، `confidence` و وضعیت بازبینی.
  * `extraction_reviews` و `extraction_corrections`: ثبت دقیق مقدار قبل و بعد از اصلاح توسط کاربر جهت ممیزی و یادگیری سیستم.

---

## ۷. حوزه `Financial Documents & Transactions` (اسناد مالی عملیاتی)
* **مسئله تجاری:** پشتیبانی از تمام سناریوهای ۱۲گانه بخش ۵.۷ (یک دریافت برای چند فاکتور، چند پرداخت برای یک فاکتور، پرداخت جزئی، تسویه، تخفیف، برگشت، چک در جریان/وصول/برگشت، انتقال بین حساب‌ها، تراکنش بانکی بی‌پشتوانه، سند بدون تراکنش بانکی و ابطال/برگشت بدون حذف).
* **موجودیت‌ها:**
  * `invoices`, `invoice_lines`, `invoice_adjustments`: فاکتورهای خرید، فروش و برگشتی با تفکیک تخفیف خطی، تخفیف پای فاکتور، مالیات و عوارض.
  * `bank_accounts`, `payments`, `payment_allocations`: جدول میانی `payment_allocations` رابطه M:N بین دریافت/پرداخت و فاکتورها را با مبلغ تخصیص‌یافته، روش تخصیص (`EXPLICIT`, `FIFO_AUTO`) و امکان ابطال (`REVERSAL`) پیاده‌سازی می‌کند.
  * `checks` و `check_status_history`: ردیابی کامل چرخه چک (صیاد، سریال، سررسید، وضعیت‌های در جریان/واگذاری/وصول/برگشت) با تاریخچه تغییر وضعیت.
  * `bank_transactions`: ردیف‌های صورتحساب بانک با امکان ثبت مستقل قبل از وجود سند متناظر (`reconciliation_status = UNMATCHED`).
  * `financial_adjustments`: تعدیلات تاییدشده روی مانده یا سند بدون دستکاری تاریخچه.
  * `accounting_entries`, `accounting_entry_lines` *(`PROVISIONAL`)*: آماده اتصال به دفتر کل دوطرفه در فاز آتی.

---

## ۸. حوزه `Accounting Integration` (اتصال نرم‌افزارهای حسابداری)
* `source_systems`, `integration_connections`, `external_entity_mappings`, `sync_jobs`, `sync_cursors`, `sync_errors`, `import_batches`, `import_rows`.
* تضمین عدم ورود تکراری از طریق `(organization_id, source_system_id, entity_domain, external_id)` و `row_hash` در سطح Batch، در حالی که دو فاکتور مجزا با مبلغ مشابه در یک روز به اشتباه تکراری محسوب نمی‌شوند.

---

## ۹. حوزه `Reconciliation` (تطبیق و مغایرت‌گیری)
* `reconciliation_rules`, `reconciliation_runs`, `reconciliation_matches`, `reconciliation_exceptions`.
* تفکیک صریح بین تطبیق قطعی (`EXACT_CONFIRMED`)، پیشنهادی (`PROBABILISTIC_SUGGESTED`) و تایید دستی (`MANUAL_CONFIRMED`) با پشتیبانی از تطبیق چندبه‌چند و ثبت استثناهای باز (`OPEN`).

---

## ۱۰. حوزه `Processing & Workflow` (کاتالوگ و موتور گردشکار)
* `service_definitions`, `workflow_definitions`, `workflow_executions`, `workflow_step_executions`, `processing_jobs`, `processing_results`, `processing_result_sources`, `processing_warnings`, `processing_errors`, `approval_requests`.
* جدا نگه داشتن وضعیت اجرای سرویس و State Machine از جداول عملیاتی مالی، به همراه `idempotency_key` و Checkpoint برای توقف و ازسرگیری.

---

## ۱۱. حوزه `Reporting & Evidence` (گزارش‌گیری نسخه‌پذیر و شواهد)
* `report_definitions`, `report_data_snapshots`, `report_executions`, `report_versions`, `report_metrics`, `report_evidences`, `report_outputs`.
* اتصال هر نسخه گزارش به یک `report_data_snapshot` تغییرناپذیر و نگاشت هر شاخص عددی به ردیف‌های سند منبع در `report_evidences`.

---

## ۱۲. حوزه `AI Assistant & Conversation` (دستیار مکالمه‌ای)
* `conversations`, `conversation_contexts`, `conversation_messages`, `tool_invocations`, `assistant_recommendations`, `user_feedback`.
* ایزولاسیون کامل داده‌های مکالمه از جداول مالی و ثبت ردپای هر `ToolInvocation` برای ممیزی امنیتی.

---

## ۱۳. حوزه `Audit, Security, Notification & Subscription`
* `audit_logs` (ثبت کامل تغییر قبل/بعد روی عملیات حساس)، `security_events`، `notifications`، `notification_preferences`، `subscription_plans`، `subscriptions`، `usage_records`، `usage_limits`، `data_retention_policies`.

---

## ۱۴. برنامه توسعه مدل برای سایر کسب‌وکارها (`Business Extensibility`)
* **فروشگاهی / خرده‌فروشی:** با استفاده از همین `products`, `product_identifiers (BARCODE)`, `bank_accounts (POS)` و `invoices (SALE)` بدون تغییر هسته کار می‌کند.
* **تولیدی (آینده):** افزودن جداول `bom_headers`, `bom_lines`, `production_orders` متصل به `inventory_movements (CONSUME_IN/PRODUCE_OUT)`.
* **رستورانی (آینده):** مشابه تولیدی با BOM دستور پخت + جدول ضایعات متصل به `inventory_adjustments`.
* **خدماتی و اشخاص مستقل:** `products (product_type='SERVICE')` بدون نیاز به انبارداری، با تمرکز بر `invoices`, `payments` و `bank_transactions`.
