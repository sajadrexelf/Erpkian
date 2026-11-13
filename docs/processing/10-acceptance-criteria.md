# 10 — معیارهای پذیرش و ماتریس آزمون خدمات (`Acceptance Criteria & QA Tests`)

این سند معیارهای پذیرش (`Acceptance Criteria`) را برای تمام **۲۷ خدمت اولویت `P0`** (هر خدمت حداقل **۳ آزمون مستقل**: ۱. محاسبه/رفتار عادی، ۲. داده ناقص یا مغایرت، ۳. شرایط مرزی/خطا و کنترل دسترسی) و خلاصه معیارهای آزمون خدمات `P1..P3` مستند می‌سازد. تمام داده‌های نمونه این سند **`Synthetic`** هستند.

---

## ۱. ماتریس آزمون خدمات P0 (۲۷ سرویس × ۳ تست = ۸۱ تست مستقل)

### دسته A: اسناد و استخراج (`DOC-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`DOC-INGEST-001`** | **`AT-DOC-INGEST-01`:** آپلود عکس فاکتور ۲ مگابایتی ← ذخیره تغییرناپذیر در `v1 ORIGINAL` با مسیر `<org_id>/...` و وضعیت `Uploaded` و ثبت مصرف در `usage_records`. | **`AT-DOC-INGEST-02`:** آپلود مجدد همان فایل با نام متفاوت (`scan_copy.jpg`) ← تطبیق `sha256_hash`، پر کردن `duplicate_of_document_id` و صدور هشدار `DUPLICATE_FILE_DETECTED` بدون اجرای مجدد OCR. | **`AT-DOC-INGEST-03`:** آپلود فایل `.exe` تغییرنام‌یافته به `.pdf` ← تشخیص Magic Bytes جعلی، رد `400 MALICIOUS_FILE_BLOCKED` و ثبت `SUSPICIOUS_FILE` در `security_events`. |
| **`DOC-MERGE-002`** | **`AT-DOC-MERGE-01`:** ارسال ۳ عکس فاکتور چندبرگی ← ایجاد `v2 MERGED_PDF` با حفظ `v1 ORIGINAL` و ثبت ۳ ردیف `document_pages` به ترتیب ۱ تا ۳ با `quality_score >= 0.85`. | **`AT-DOC-MERGE-02`:** صفحه ۲ از PDF دارای تاری شدید (`quality_score = 0.48`) ← ثبت `is_blurry_flagged = true` و توقف در `Awaiting Input` با درخواست تصویر بهتر. | **`AT-DOC-MERGE-03`:** آپلود PDF رمزدار یا بیش از ۵۰ صفحه ← رد کنترل‌شده با خطای `PDF_PASSWORD_PROTECTED` / `PAGE_LIMIT_EXCEEDED` بدون کرش Worker. |
| **`DOC-OCR-003`** | **`AT-DOC-OCR-01`:** استخراج فاکتور استاندارد ۵ سطری ← تولید `extracted_fields` و جدول در `extracted_table_*` با مختصات `bbox` در `[0,1]` و مصرف ۵ یا ۱ صفحه در `usage_records`. | **`AT-DOC-OCR-02`:** یکی از سلول‌های قیمت ناخواناست (`confidence = 0.52`) ← مقدار `normalized_value` هرگز حدس زده نمی‌شود و فیلد با وضعیت `UNREVIEWED/FLAGGED` به کاربر نمایش داده می‌شود. | **`AT-DOC-OCR-03`:** خطای Timeout موتور Python ← اجرای دقیق ۳ بار Retry با Backoff؛ اجرای مجدد با مدل جدید باعث ساخت `attempt_number = 2` بدون حذف تلاش ۱ می‌شود. |
| **`DOC-CLASS-004`** | **`AT-DOC-CLASS-01`:** سند با عبارت «فروشنده: پخش آریا گستر» (سازمان جاری) ← تشخیص قطعی `SALES_INVOICE` و زبان `fa`. | **`AT-DOC-CLASS-02`:** نام سازمان در هدر ناخواناست ← برچسب `UNKNOWN` + هشدار `AMBIGUOUS_INVOICE_DIRECTION` برای انتخاب دستی کاربر. | **`AT-DOC-CLASS-03`:** جدول گردش با ستون‌های واریز/برداشت/مانده و نام بانک ← طبقه‌بندی `BANK_STATEMENT` (نه اشتباه گرفتن با فاکتور). |
| **`DOC-MATH-005`** | **`AT-DOC-MATH-01`:** سطر `10 * 1,200,000 - 600,000 + 1,140,000 = 12,540,000` با کلمه «ریال» ← `math_valid = true` و `math_validation_passed = true`. | **`AT-DOC-MATH-02`:** جمع ردیف‌ها `14,500,000` ولی جمع پایین عکس `12,500,000` و بدون کلمه ریال/تومان ← `math_validation_passed = false` + هشدار `CURRENCY_UNIT_AMBIGUOUS` (عدم ضرب خودکار در ۱۰). | **`AT-DOC-MATH-03`:** تاریخ نامعتبر `1405/12/30` (سال ۱۴۰۵ کبیسه نیست) ← رد با خطای `INVALID_JALALI_DATE`. |
| **`DOC-ENTITY-006`** | **`AT-DOC-ENTITY-01`:** نام خام «هایپر پارسیان» با شناسه ملی `10103456789` ← تطبیق دقیق `1.0000` با رکورد موجود در `contacts` بدون ساخت مشتری تکراری. | **`AT-DOC-ENTITY-02`:** فقط نام «فروشگاه بهار» بدون شناسه ملی و وجود «سوپر مارکت بهار» (`score = 0.76`) ← ایجاد کاندیدا در `entity_match_candidates (PENDING)` بدون ادغام خودکار. | **`AT-DOC-ENTITY-03`:** تلاش برای ثبت فاکتور `Posted` با ارجاع به `contact` دارای وضعیت `MERGED` ← مسدودسازی یا هدایت کنترل‌شده و منع نهایی‌سازی کاندیدای `PENDING`. |
| **`DOC-REVIEW-007`** | **`AT-DOC-REVIEW-01`:** حسابدار رقم غلط `12,000,000` را به `120,000,000` اصلاح و تایید می‌کند ← ثبت `value_before`/`value_after` در `extraction_corrections` و انتقال سند به `Verified`. | **`AT-DOC-REVIEW-02`:** بازبین بدون اصلاح اختلاف ۲,۰۰۰,۰۰۰ ریالی دکمه تایید می‌زند ← مسدودسازی `CANNOT_APPROVE_UNBALANCED_MATH`. | **`AT-DOC-REVIEW-03`:** کاربر دارای نقش `OPERATOR` (بدون مجوز `document:review_ocr`) تلاش به تایید نهایی می‌کند ← خطای `403 Forbidden` و ثبت در `security_events`. |
| **`DOC-POST-008`** | **`AT-DOC-POST-01`:** فاکتور `Verified` زیر سقف با مجوز `invoice:post` ← انتقال اتمیک به `Posted` و ثبت `audit_logs (INVOICE_POSTED)`. | **`AT-DOC-POST-02`:** مبلغ فاکتور `650M` ریال > سقف `500M` ← عدم `Posted` مستقیم؛ انتقال به `Awaiting Approval` و ایجاد `approval_requests` برای `CFO`. | **`AT-DOC-POST-03`:** تلاش برای `Posted` کردن در دوره `CLOSED` یا تلاش درخواست‌کننده برای تایید درخواست دوامضایی خودش ← خطای `FISCAL_PERIOD_CLOSED` / `SELF_APPROVAL_FORBIDDEN`. |

### دسته B: حساب‌های دریافتنی (`FIN-AR-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`FIN-AR-INV-001`** | **`AT-AR-INV-01`:** ثبت فاکتور فروش ۱۰ کارتن (ضریب ۱۲) به فی ۱,۲۰۰,۰۰۰ + ۱ کارتن اشانتیون + ۵٪ تخفیف + ۱۰٪ مالیات ← جمع خالص دقیقاً `12,540,000` ریال و خروج `132` عدد از انبار. | **`AT-AR-INV-02`:** فاکتور با ردیف `unit_price_irr = 0` بدون پرچم `is_promotional_free_item` ← توقف در `Needs Review` برای تایید اشانتیون. | **`AT-AR-INV-03`:** ارسال مجدد همان فاکتور با `idempotency_key` یکسان ← ثبت تکراری رخ نمی‌دهد و کسر مضاعف انبار انجام نمی‌شود. |
| **`FIN-AR-PAY-002`** | **`AT-AR-PAY-01`:** ثبت دریافت کارتخوان `4,000,000 IRT` ← ذخیره `amount_irr = 40,000,000` با تبدیل دقیق و اتصال به حساب بانکی. | **`AT-AR-PAY-02`:** دریافت مبلغ `50,000,000` بدون تعیین فاکتور ← ثبت معتبر با هشدار `UNALLOCATED_ADVANCE_CREDIT`. | **`AT-AR-PAY-03`:** مبلغ صفر یا منفی یا کد پیگیری تکراری در همان حساب بانکی ← رد با `ZERO_OR_NEGATIVE_AMOUNT` / `DUPLICATE_TRACKING_CODE`. |
| **`FIN-AR-ALLOC-003`** | **`AT-AR-ALLOC-01`:** تخصیص ۱ دریافت `90M` ریالی به ۳ فاکتور (`40M`, `30M`, `50M`) با `FIFO` ← ایجاد ۳ رکورد `payment_allocations` با مانده‌های `0`, `0`, `30M`. | **`AT-AR-ALLOC-02`:** تخصیص `100M` به یک فاکتور `70M` ← تخصیص `70M` به فاکتور و نگهداری `30M` به عنوان بستانکاری تخصیص‌نیافته (نه منفی‌شدن مانده فاکتور). | **`AT-AR-ALLOC-03`:** تلاش تخصیص مبلغ `60M` به فاکتوری با مانده باز `30M` در حالت `EXPLICIT` ← مسدودسازی `ALLOCATION_OVERFLOW`. |
| **`FIN-AR-AGING-001`** | **`AT-AR-AGING-01`:** اجرای گزارش روی ۲ فاکتور معوق (`50M` تاخیر ۴۵ روز + `40M` تاخیر ۵ روز با چک در دست) ← دقیقاً `BUCKET_31_60 = 50M`، `BUCKET_1_30 = 40M`، `pending_cheques = 40M` (عدم کسر چک از بدهی). | **`AT-AR-AGING-02`:** وجود ۲ فاکتور `Needs Review` در تاریخ گزارش ← لحاظ نشدن در جمع، ثبت `pending_document_count = 2` در Snapshot، `confidence_level = MEDIUM` و هشدار `PENDING_DOCS_EXCLUDED`. | **`AT-AR-AGING-03`:** درخواست گزارش توسط `SALES_MANAGER` محدود به `شعبه غرب` یا `INVENTORY_MANAGER` ← فیلتر خودکار به `شعبه غرب` برای اولی و رد `403 Forbidden` برای دومی. |

### دسته C: حساب‌های پرداختنی (`FIN-AP-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`FIN-AP-INV-001`** | **`AT-AP-INV-01`:** ثبت فاکتور خرید ۱۰ کارتن × ۶M + کرایه حمل ۱.۲M ← ورود `120` عدد پایه با بهای تمام‌شده دقیقاً `510,000` ریال بر عدد. | **`AT-AP-INV-02`:** افزایش قیمت خرید بیش از ۲۰٪ نسبت به آخرین فاکتور همان کالا ← ثبت صحیح همراه با هشدار `PURCHASE_PRICE_SPIKE_OVER_20_PCT`. | **`AT-AP-INV-03`:** ثبت دو فاکتور خرید با شماره، تاریخ و مبلغ یکسان برای یک تأمین‌کننده ← مسدودسازی `DUPLICATE_SUPPLIER_INVOICE`. |
| **`FIN-AP-PAY-002`** | **`AT-AP-PAY-01`:** پرداخت ۱۰۰M به تأمین‌کننده بابت دو فاکتور ۶۰M و ۷۰M با FIFO ← مانده `0` و `30M` و ثبت `Posted`. | **`AT-AP-PAY-02`:** پرداخت `120M` بالای سقف `100M` ثبت‌شده توسط حسابدار ارشد ← توقف در `Awaiting Approval` تا امضای `CFO`. | **`AT-AP-PAY-03`:** تلاش برای تخصیص پرداخت به فاکتور خرید متعلق به تأمین‌کننده دیگر ← خطای `CONTACT_MISMATCH`. |

### دسته D: بانک و خزانه (`TRS-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`TRS-BANK-IMP-001`** | **`AT-TRS-IMP-01`:** ایمپورت اکسل ۱۲۰ سطری بانک ملت با تراز مانده پیوسته ← درج ۱۲۰ ردیف در `bank_transactions` و `import_rows`. | **`AT-TRS-IMP-02`:** فایل صورتحساب بدون ذکر واحد ریال یا تومان ← توقف پیش از درج با خطای `AMBIGUOUS_BANK_CURRENCY`. | **`AT-TRS-IMP-03`:** ایمپورت مجدد فایل همپوشان (۹۰ سطر قدیمی + ۳۰ سطر جدید) ← `imported = 30`, `duplicate_skipped = 90`. |
| **`TRS-BANK-REC-001`** | **`AT-TRS-REC-01`:** تطبیق کد پیگیری و مبلغ یکسان + تطبیق تجمیعی `3:1` کارتخوان (`10M+15M+25M = 50M`) ← ثبت `EXACT_CONFIRMED` و `MATCHED`. | **`AT-TRS-REC-02`:** تراکنش بانکی `50,000,000` بدون سند داخلی + یک واریز با اختلاف ۲ روز (`score = 0.86`) ← اولی `MISSING_BOOK_RECORD` و دومی `PROBABILISTIC_SUGGESTED (PENDING)` تا تایید انسان. | **`AT-TRS-REC-03`:** تلاش دسترسی به مغایرت بانکی توسط `INVENTORY_MANAGER` ← رد `403` و عدم افشای مانده بانک. |
| **`TRS-CHK-001`** | **`AT-TRS-CHK-01`:** ثبت چک صیادی ۱۶ رقمی `IN_HAND` ← واگذاری `DEPOSITED` ← وصول `CLEARED` متصل به `bank_transaction_id` با تاریخچه ۳ گام در `check_status_history`. | **`AT-TRS-CHK-02`:** برگشت خوردن چک (`BOUNCED`) ← حفظ بدهی باز فاکتور و صدور هشدار ریسک مشتری. | **`AT-TRS-CHK-03`:** ورود شناسه صیاد ۱۵ رقمی یا تلاش تغییر مستقیم از `CLEARED` به `IN_HAND` ← خطای `INVALID_SAYAD_ID_FORMAT` / `ILLEGAL_CHECK_STATUS_TRANSITION`. |

### دسته E: کالا و انبار (`INV-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`INV-MASTER-001`** | **`AT-INV-MST-01`:** تعریف کالا با واحد پایه «عدد» و واحد فرعی «کارتن» با ضریب `12` و بارکد یکتا ← تبدیل دقیق در فاکتور. | **`AT-INV-MST-02`:** تعریف کالا بدون قیمت خرید مرجع ← ثبت موفق با هشدار `MISSING_DEFAULT_PURCHASE_PRICE`. | **`AT-INV-MST-03`:** تغییر `base_uom_id` پس از ثبت اولین حرکت انبار ← مسدودسازی `BASE_UOM_IMMUTABLE`. |
| **`INV-MOV-001`** | **`AT-INV-MOV-01`:** انتقال ۱۰ کارتن از انبار مرکزی به انبار خودرو ← ایجاد جفت اتمیک `TRANSFER_OUT (-120)` و `TRANSFER_IN (+120)` با `transfer_group_id` مشترک. | **`AT-INV-MOV-02`:** خروج از انبار وقتی `allow_negative_stock = true` و موجودی صفر است ← ثبت خروج همراه با هشدار `NEGATIVE_STOCK_OCCURRED`. | **`AT-INV-MOV-03`:** خروج بیش از موجودی وقتی `allow_negative_stock = false` یا انتقال به همان انبار مبدأ ← خطای `INSUFFICIENT_STOCK_BLOCKED` / `SAME_SOURCE_DEST_WAREHOUSE`. |
| **`INV-BAL-001`** | **`AT-INV-BAL-01`:** Snapshot تاییدشده `500` + خرید `120` - فروش `85` = `535` عدد (`۴۴ کارتن و ۷ عدد`). | **`AT-INV-BAL-02`:** `accounting_policies.inventory_valuation_method = 'UNSPECIFIED'` ← نمایش موجودی تعدادی صحیح + صفر نکردن ارزش، بلکه خطا/هشدار `VALUATION_OMITTED_POLICY_UNSET`. | **`AT-INV-BAL-03`:** درخواست موجودی توسط `INVENTORY_MANAGER` ← نمایش مقادیر انبار و مخفی‌سازی کامل `unit_cost_irr` و `total_value_irr`. |
| **`INV-REC-001`** | **`AT-INV-REC-01`:** موجودی سیستم `120` عدد vs شمارش اکسل انباردار `9` کارتن (`108` عدد) ← محاسبه کسری دقیق `-12` عدد و ساخت پیش‌نویس `inventory_adjustments`. | **`AT-INV-REC-02`:** وجود فاکتور فروش `Needs Review` در روز شمارش ← اجرای مغایرت همراه با هشدار `PENDING_INVOICES_AFFECT_SYSTEM_STOCK`. | **`AT-INV-REC-03`:** تلاش انباردار برای `Posted` کردن مستقیم سند تعدیل انبار ← رد `403` و الزام ارسال به تایید `CFO`/`OWNER`. |

### دسته F: فروش و همگام‌سازی (`SLS-*`, `INT-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`SLS-RPT-001`** | **`AT-SLS-RPT-01`:** فروش ناخالص `200M` - تخفیف `15M` - برگشت از فروش `25M` ← فروش خالص دقیقاً `160M` ریال و مقایسه درصد رشد با دوره قبل. | **`AT-SLS-RPT-02`:** ۳ فاکتور فروش در وضعیت `Needs Review` ← مستثنی شدن از جمع فروش خالص با نمایش در بخش هشدار و کاهش `confidence_level`. | **`AT-SLS-RPT-03`:** گزارش بدون وجود هیچ فاکتور در بازه ← بازگشت صفر با پیام شفاف (نه خطای تقسیم بر صفر هنگام محاسبه درصد رشد). |
| **`INT-SYNC-001`** | **`AT-INT-SYNC-01`:** ایمپورت ۱۰۰ ردیف خروجی سپیدار ← نگاشت `external_entity_mappings` و ایجاد ۱۰۰ رکورد استاندارد. | **`AT-INT-SYNC-02`:** ۹۵ ردیف سالم + ۵ ردیف فاقد واحد یا تاریخ نامعتبر ← ورود ۹۵ ردیف و ثبت ۵ خطا در `import_rows (INVALID)` / `sync_errors` بدون توقف کل فایل. | **`AT-INT-SYNC-03`:** آپلود مجدد ۹۹ سطر تکراری + ۱ سطر جدید، یا تلاش Write-back با `read_only = true` ← `imported = 1, duplicate_skipped = 99` و مسدودسازی هرگونه نوشتن به مبدأ. |

### دسته G: سودآوری و بها (`PRF-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`PRF-COGS-001`** | **`AT-PRF-COGS-01`:** خرید ۱۰۰ عدد @ ۵۰k + ۱۰۰ عدد @ ۶۰k و فروش ۸۰ عدد ← در `WEIGHTED_AVERAGE` بها = `4,400,000`؛ در `FIFO` بها = `4,000,000`. | **`AT-PRF-COGS-02`:** خروج کالا با موجودی منفی ← علامت‌گذاری مقدار بدون لایه به عنوان `COST_UNRESOLVED_NEGATIVE_STOCK`. | **`AT-PRF-COGS-03`:** سیاست موجودی `UNSPECIFIED` ← توقف قطعی محاسبه ریالی با خطای `VALUATION_POLICY_UNSET`. |
| **`PRF-GM-001`** | **`AT-PRF-GM-01`:** فروش خالص `100M` با بهای خرید کامل `75M` ← سود ناخالص `25M` (`25.00%`)، `cost_coverage_pct = 100%` و `confidence = HIGH`. | **`AT-PRF-GM-02`:** فروش `100M` که برای `20M` آن (۲ کالا) فاکتور خرید ثبت نشده ← محاسبه سود فقط برای `80M` دارای بها، `cost_coverage_pct = 80.00%`, `confidence = MEDIUM` و افشای ۲ کالا. | **`AT-PRF-GM-03`:** درخواست گزارش سود توسط `SALES_MANAGER` یا `INVENTORY_MANAGER` ← رد قطعی `403` و ثبت `PERMISSION_DENIED`. |

### دسته H: گزارش‌های مدیریتی (`RPT-*`)

| کد سرویس | تست ۱: مسیر عادی (`Happy Path`) | تست ۲: داده ناقص / مغایرت (`Incomplete / Discrepancy`) | تست ۳: شرط مرزی / خطا / امنیت (`Boundary / Error / RBAC`) |
| :--- | :--- | :--- | :--- |
| **`RPT-DASH-001`** | **`AT-RPT-DASH-01`:** نمایش همزمان کارت‌های فروش ماه، نقد/بانک، مطالبات معوق و چک‌های ۷ روز آینده مطابق با جمع گزارش‌های تفکیکی. | **`AT-RPT-DASH-02`:** وجود مغایرت بانکی باز و اسناد معلق ← نمایش نشانگر هشدار کیفیت داده کنار کارت متناظر. | **`AT-RPT-DASH-03`:** داشبورد برای `SALES_MANAGER` کارت مانده بانک و سود ناخالص را برنمی‌گرداند (حذف امن بر پایه مجوز). |
| **`RPT-EXPORT-001`** | **`AT-RPT-EXP-01`:** صدور خروجی PDF فارسی RTL و Excel ۴ شیته از یک `report_version_id` ← ذخیره در S3 (`report_outputs`) با `snapshot_hash` یکسان با JSON. | **`AT-RPT-EXP-02`:** گزارش با هشدار `PENDING_DOCS_EXCLUDED` ← چاپ اجباری کادر هشدار در صفحه اول PDF و شیت ۴ اکسل. | **`AT-RPT-EXP-03`:** کاربر سازمان B لینک فایل خروجی سازمان A را درخواست دهد ← رد `403` (RLS + بررسی عضویت) و ثبت `CROSS_TENANT_ATTEMPT` در `security_events`. |

---

## ۲. استاندارد پذیرش خدمات `P1`, `P2` و `P3`
- تمام ۲۵ خدمت `P1` و ۸ خدمت `P2` دارای تست واحد دوقلو (دقت محاسباتی + سناریوی نقص داده/دسترسی) هستند که کد آن‌ها (`AT-*`) در بخش ۱۹ هر خدمت در `03-processing-specifications.md` قید شده است.
- دو خدمت `P3` (`TAX-SUB-MOADIAN-001` و `TAX-SUB-RETURN-001`) در تست‌های نسخه اول موظف‌اند **تست منفی قفل‌بودن (`AT-TAX-SUB-LOCKED`)** را پاس کنند؛ یعنی در فراخوانی مستقیم API همیشه کد وضعیت `501/403 FEATURE_LOCKED_EXTERNAL_CERT_REQUIRED` برگردانند و هرگز ارسال جعلی شبیه‌سازی نکنند.
