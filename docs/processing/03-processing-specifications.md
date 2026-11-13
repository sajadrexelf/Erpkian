# 03 — مشخصات دقیق پردازش‌های مالی و اسنادی (`Processing Specifications`)

این سند قرارداد اجرایی **تمام ۶۲ خدمت** کاتالوگ `01-service-catalog.md` را بر مبنای **۲۰ بخش استاندارد** تعریف می‌کند. هیچ منطق محاسباتی در لایه LLM اجرا نمی‌شود؛ تمام الگوریتم‌ها در سرویس‌های قطعی `NestJS` / `PostgreSQL` / `Python Worker` پیاده‌سازی می‌شوند.

### ساختار ۲۰ بخشی اجباری هر خدمت
۱. شناسه یکتای سرویس | ۲. هدف سرویس | ۳. سناریوی کاربرد | ۴. نقش‌های مجاز (کد `permissions`) | ۵. پیش‌نیازهای داده‌ای | ۶. جدول‌های مبدأ دیتابیس (مرحله ۳) | ۷. فیلدهای ورودی | ۸. پارامترهای قابل تنظیم | ۹. قوانین اعتبارسنجی (`VR-*`) | ۱۰. فرمول‌های محاسباتی (`CF-*`) | ۱۱. الگوریتم گام‌به‌گام اجرا | ۱۲. شرایط خطا و مسدودسازی | ۱۳. هشدارهای احتمالی (`processing_warnings`) | ۱۴. ساختار خروجی استاندارد `JSON` | ۱۵. قالب گزارش `PDF` | ۱۶. قالب فایل `Excel` | ۱۷. شواهد و اسناد مبدأ (`Evidence`) | ۱۸. تست‌های دقت محاسبه عددی | ۱۹. معیارهای پذیرش (`AT-*`) | ۲۰. نسخه الگوریتم (`algorithm_version`)

---

# دسته A: مدیریت اسناد و استخراج (`DOC-*`)

## ۱. `DOC-INGEST-001` — دریافت، بارگذاری و دسته‌بندی اسناد
1. **شناسه یکتای سرویس:** `DOC-INGEST-001` (`P0`)
2. **هدف سرویس:** دریافت امن فایل‌های تصویر، PDF، اکسل، CSV و ZIP، نگهداری نسخه خام تغییرناپذیر در S3 و جلوگیری از بارگذاری تکراری.
3. **سناریوی کاربرد:** اپراتور یا حسابدار ۵ عکس فاکتور خرید را با موبایل یا وب بارگذاری می‌کند تا وارد صف استخراج شوند.
4. **نقش‌های مجاز:** دارندگان `document:upload` (`OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `INVENTORY_MANAGER`, `OPERATOR`, `PERSONAL_USER`).
5. **پیش‌نیازهای داده‌ای:** `organization_id` فعال، عضویت فعال، فایل با فرمت مجاز (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `.xlsx`, `.csv`, `.zip`) و حجم زیر سقف پلن.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `document_batches`, `documents`, `document_versions`, `document_storage_objects`, `document_types`, `usage_records`, `usage_limits`, `audit_logs`, `security_events`.
7. **فیلدهای ورودی:** `file_stream`, `original_filename`, `source_channel`, `branch_id` (اختیاری), `document_type_code` (اختیاری), `batch_id` (اختیاری), `allow_duplicate_override` (`boolean`, پیش‌فرض `false`).
8. **پارامترهای قابل تنظیم:** حداکثر حجم فایل (پیش‌فرض ۲۵ مگابایت)، سهمیه `usage_limits` (`DOCUMENTS`, `STORAGE_MB`).
9. **قوانین اعتبارسنجی:** بررسی Magic Bytes واقعی فایل (نه فقط پسوند)، `VR-DUP-01` (کنترل `sha256_hash` درون `organization_id`)، چک سقف سهمیه `usage_limits`.
10. **فرمول‌های محاسباتی:** `sha256_hash = SHA256(raw_bytes)`؛ محاسبه مصرف فضا `ROUND(byte_size / 1048576.0, 2)` مگابایت.
11. **الگوریتم اجرا:**
    - گام ۱: کنترل مجوز `document:upload` و سهمیه `usage_limits`.
    - گام ۲: اسکن Magic Bytes و پسوند؛ در فایل مشکوک ثبت `SUSPICIOUS_FILE` در `security_events` و رد `400`.
    - گام ۳: محاسبه `sha256_hash` و جستجو در `document_storage_objects` سازمان؛ در صورت وجود مشابه و `allow_duplicate_override = false` ← ایجاد رکورد با `duplicate_of_document_id` و بازگرداندن هشدار فایل تکراری.
    - گام ۴: آپلود به S3 با مسیر `<org_id>/<doc_id>/v1_original.<ext>` و ثبت `is_immutable_original = true`.
    - گام ۵: ایجاد `documents (lifecycle_status = 'Uploaded')` و `document_versions (version_number = 1, version_kind = 'ORIGINAL')` و ثبت مصرف در `usage_records`.
12. **شرایط خطا:** `UNSUPPORTED_MIME_TYPE`, `FILE_TOO_LARGE`, `QUOTA_HARD_LIMIT_REACHED`, `MALICIOUS_FILE_BLOCKED`.
13. **هشدارهای احتمالی:** `DUPLICATE_FILE_DETECTED` (ارسال شناسه سند قبلی به کاربر)، `QUOTA_SOFT_LIMIT_85_PCT`.
14. **ساختار خروجی JSON:** `{ "document_id": "uuid", "version_id": "uuid", "lifecycle_status": "Uploaded", "sha256_hash": "64hex", "is_duplicate": false, "duplicate_of_document_id": null }`.
15. **قالب PDF:** ندارد (سرویس ورودی اسناد).
16. **قالب Excel:** ندارد (سرویس ورودی اسناد).
17. **شواهد:** آبجکت تغییرناپذیر S3 در `document_storage_objects` + لاگ `audit_logs`.
18. **تست دقت عددی:** آپلود یکسان یک فایل ۲.۴ مگابایتی با دو نام متفاوت باید دقیقا `sha256_hash` برابر تولید کند و هشدار تکراری بدهد.
19. **معیارهای پذیرش:** `AT-DOC-INGEST-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۲. `DOC-MERGE-002` — ادغام تصاویر، جداسازی PDF و پیش‌پردازش
1. **شناسه یکتای سرویس:** `DOC-MERGE-002` (`P0`)
2. **هدف سرویس:** تبدیل چند عکس فاکتور چندبرگی به یک نسخه PDF ادغام‌شده، تفکیک صفحات PDF، اصلاح زاویه و سنجش وضوح تصویر.
3. **سناریوی کاربرد:** مشتری فاکتور ۳ برگی فروش را در ۳ عکس مجزا ارسال کرده یا یک PDF ۱۰ صفحه‌ای شامل چند فاکتور بارگذاری کرده است.
4. **نقش‌های مجاز:** `document:upload`, `document:review_ocr`.
5. **پیش‌نیازهای داده‌ای:** وجود `document_id` در وضعیت `Uploaded` یا آرایه `document_ids` برای ادغام.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `documents`, `document_versions`, `document_pages`, `document_storage_objects`.
7. **فیلدهای ورودی:** `document_id` (یا `source_document_ids[]` برای ادغام)، `page_order[]`, `manual_rotations[]` (اختیاری).
8. **پارامترهای قابل تنظیم:** `min_quality_score` (پیش‌فرض `0.65`)، `max_pdf_pages` (پیش‌فرض `50`).
9. **قوانین اعتبارسنجی:** حداقل ۱ صفحه، چرخش فقط در مقادیر `{0, 90, 180, 270}`، هر صفحه متعلق به همان `organization_id`.
10. **فرمول‌های محاسباتی:** `quality_score` (ترکیب واریانس لاپلاسین وضوح + کنتراست + زاویه کجی نرمال‌شده به `[0.0000, 1.0000]`).
11. **الگوریتم اجرا:**
    - گام ۱: در حالت ادغام، رندر تصاویر/صفحات و ساخت PDF استاندارد به عنوان `document_versions (version_number = 2, version_kind = 'MERGED_PDF')` بدون دستکاری `v1 ORIGINAL`.
    - گام ۲: رندر تک‌تک صفحات در Python/OpenCV با `DPI = 300` و تصحیح چرخش.
    - گام ۳: محاسبه `quality_score`؛ اگر `< 0.65` باشد ← `is_blurry_flagged = true`.
    - گام ۴: ثبت ردیف‌های `document_pages` به ترتیب `page_number`.
12. **شرایط خطا:** `CORRUPTED_PDF`, `PDF_PASSWORD_PROTECTED`, `PAGE_LIMIT_EXCEEDED`.
13. **هشدارهای احتمالی:** `LOW_IMAGE_QUALITY_BLURRY` (توقف در `Awaiting Input` جهت پیشنهاد آپلود مجدد).
14. **ساختار خروجی JSON:** `{ "document_version_id": "uuid", "page_count": 3, "pages": [{"page_number": 1, "quality_score": 0.915, "is_blurry_flagged": false}] }`.
15. **قالب PDF:** خروجی نسخه PDF ادغام‌شده قابل دانلود با Pre-signed URL.
16. **قالب Excel:** ندارد.
17. **شواهد:** حفظ `v1 ORIGINAL` کنار `v2 MERGED_PDF` در `document_versions`.
18. **تست دقت:** PDF ۳ صفحه‌ای باید دقیقاً ۳ ردیف `document_pages` با ترتیب ۱..۳ بسازد و نسخه ۱ تغییر نکند.
19. **معیارهای پذیرش:** `AT-DOC-MERGE-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۳. `DOC-OCR-003` — استخراج هوشمند متن، فیلدها و جداول سند
1. **شناسه یکتای سرویس:** `DOC-OCR-003` (`P0`)
2. **هدف سرویس:** استخراج متن فارسی/انگلیسی، فیلدهای هدر و جدول اقلام از عکس، PDF اسکن‌شده یا پرینت جدول اکسل با حفظ مختصات و سطح اطمینان.
3. **سناریوی کاربرد:** پردازش عکس فاکتور دست‌نویس/چاپی یا PDF پرینت جدول انبار/فروش و تبدیل به فیلدهای ساختاریافته.
4. **نقش‌های مجاز:** سیستم Worker پس از `document:upload` / درخواست کاربر با `document:review_ocr`.
5. **پیش‌نیازهای داده‌ای:** `document_version_id` دارای صفحات معتبر در `document_pages` و سهمیه `OCR_PAGES`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `extraction_model_versions`, `extraction_jobs`, `extraction_attempts`, `ocr_page_results`, `extracted_fields`, `extracted_tables`, `extracted_table_rows`, `extracted_table_cells`, `usage_records`.
7. **فیلدهای ورودی:** `document_id`, `document_version_id`, `hint_document_type` (اختیاری), `model_version_id` (اختیاری).
8. **پارامترهای قابل تنظیم:** `ocr_provider_active`, `confidence_review_threshold` (`0.85`).
9. **قوانین اعتبارسنجی:** هر فیلد با `raw_value` دقیق طبق سند ثبت می‌شود؛ فیلد ناخوانا `NULL` می‌ماند (هرگز حدس زده نمی‌شود).
10. **فرمول‌های محاسباتی:** `overall_confidence = AVG(confidence of key header fields & table cells)`؛ ثبت مصرف `quantity_used = page_count` در `usage_records`.
11. **الگوریتم اجرا:**
    - گام ۱: تغییر وضعیت سند به `Processing` و درج صف `extraction_jobs (QUEUED -> RUNNING)`.
    - گام ۲: ایجاد `extraction_attempts (attempt_number = N)`.
    - گام ۳: اجرای OCR فارسی+انگلیسی در سرویس Python روی هر صفحه و ذخیره `ocr_page_results`.
    - گام ۴: استخراج فیلدهای هدر (`invoice_no`, `issue_date`, `seller_name`, `buyer_name`, `subtotal`, `discount`, `tax`, `total_amount`, `currency_hint`) همراه با `bbox_x/y/w/h` و `confidence`.
    - گام ۵: تشخیص ساختار جدول و ثبت سطرها (`HEADER`, `LINE_ITEM`, `SUBTOTAL`, `SUMMARY`) و سلول‌ها در `extracted_table_*`.
    - گام ۶: انتقال به `DOC-MATH-005` و تنظیم وضعیت سند به `Needs Review`.
12. **شرایط خطا:** `OCR_ENGINE_TIMEOUT` (۳ بار Retry)، `NO_TEXT_DETECTED`, `OCR_QUOTA_EXCEEDED`.
13. **هشدارهای احتمالی:** `LOW_CONFIDENCE_FIELDS` (لیست فیلدهای `< 0.85`), `UNRECOGNIZED_TABLE_COLUMNS`.
14. **ساختار خروجی JSON:** شامل `attempt_id`, `overall_confidence`, آرایه `fields` (با `raw_value`, `bbox`, `confidence`) و `tables`.
15. **قالب PDF:** ندارد (نمایش تعاملی تصویر + کادرهای `bbox` در UI).
16. **قالب Excel:** خروجی موقت جدول استخراجی پیش از تایید (فقط برای بازبینی).
17. **شواهد:** لینک مستقیم هر سلول و فیلد به `document_page_id` و مختصات `bbox_*`.
18. **تست دقت:** در اجرای Retry با مدل جدید، `attempt_number = 2` ساخته شود بدون حذف `attempt_number = 1`.
19. **معیارهای پذیرش:** `AT-DOC-OCR-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۴. `DOC-CLASS-004` — تشخیص خودکار نوع سند، جهت مالی و زبان
1. **شناسه یکتای سرویس:** `DOC-CLASS-004` (`P0`)
2. **هدف سرویس:** تشخیص نوع سند ورودی (`SALES_INVOICE`, `PURCHASE_INVOICE`, `PAYMENT_RECEIPT`, `CHEQUE`, `BANK_STATEMENT`, `INVENTORY_REPORT`, `DEBT_LIST`, `PERSONAL_RECEIPT`) و زبان غالب (`fa`/`en`/`fa+en`).
3. **سناریوی کاربرد:** کاربر ۵۰ فایل مختلط شامل فاکتور خرید، رسید کارتخوان و برگ چک را یکجا آپلود کرده و نام‌گذاری نکرده است.
4. **نقش‌های مجاز:** `document:upload`, `document:review_ocr`.
5. **پیش‌نیازهای داده‌ای:** `ocr_page_results.raw_text` صفحه اول (یا هدر اکسل).
6. **جدول‌های مبدأ و مقصد دیتابیس:** `document_types`, `documents`, `extraction_attempts`, `organizations` (تطبیق نام سازمان برای تشخیص فروش vs خرید).
7. **فیلدهای ورودی:** `extraction_attempt_id`, `raw_text`, `organization_name_variants[]`.
8. **پارامترهای قابل تنظیم:** `classification_min_confidence` (`0.75`).
9. **قوانین اعتبارسنجی:** تطبیق نام سازمان جاری با بخش «فروشنده» ← `SALES_INVOICE`؛ با بخش «خریدار» ← `PURCHASE_INVOICE`؛ در صورت ابهام ← `UNKNOWN` + بازبینی انسانی.
10. **فرمول‌های محاسباتی:** امتیاز وزنی کلیدواژه‌ها + تطبیق موقعیت نام سازمان (`trigram similarity`).
11. **الگوریتم اجرا:** بررسی الگوهای کلیدی (شناسه صیاد ۱۶ رقمی = `CHEQUE`؛ پوز/پیگیری بانکی = `PAYMENT_RECEIPT`؛ ستون بدهکار/بستانکار مانده = `BANK_STATEMENT`؛ فروشنده/خریدار و جدول اقلام = `INVOICE`) و ثبت در `detected_document_type_id`.
12. **شرایط خطا:** `CLASSIFICATION_ENGINE_ERROR`.
13. **هشدارهای احتمالی:** `AMBIGUOUS_INVOICE_DIRECTION` (وقتی هر دو نام فروشنده و خریدار ناخواناست).
14. **ساختار خروجی JSON:** `{ "detected_document_type": "PURCHASE_INVOICE", "confidence": 0.92, "detected_language": "fa" }`.
15. **قالب PDF / 16. Excel:** ندارد.
17. **شواهد:** متن خام صفحه اول در `ocr_page_results`.
18. **تست دقت:** فاکتور با نام سازمان جاری در بخش «خریدار» باید حتماً `PURCHASE_INVOICE` تشخیص داده شود نه `SALE`.
19. **معیارهای پذیرش:** `AT-DOC-CLASS-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۵. `DOC-MATH-005` — کنترل ریاضی، تاریخ شمسی و واحد پول اسناد
1. **شناسه یکتای سرویس:** `DOC-MATH-005` (`P0`)
2. **هدف سرویس:** تبدیل متن خام ارقام فارسی/عربی به اعداد استاندارد، تشخیص/تایید ریال یا تومان، اعتبارسنجی تاریخ شمسی و راستی‌آزمایی حسابی کل سند.
3. **سناریوی کاربرد:** در فاکتور اسکن‌شده جمع سطرها با جمع کل پایین فاکتور ۲,۰۰۰,۰۰۰ ریال اختلاف دارد یا مشخص نیست ارقام به ریال است یا تومان.
4. **نقش‌های مجاز:** موتور خودکار + `document:review_ocr`.
5. **پیش‌نیازهای داده‌ای:** `extracted_fields` و `extracted_table_rows` برای یک `extraction_attempt_id`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `extraction_attempts`, `extracted_fields`, `extracted_table_rows`, `extracted_table_cells`, `processing_warnings`, `currencies`, `exchange_rates`.
7. **فیلدهای ورودی:** `extraction_attempt_id`, `explicit_currency_override` (در بازبینی).
8. **پارامترهای قابل تنظیم:** `rounding_tolerance_irr` (پیش‌فرض `1` ریال)، `vat_standard_rate` (`0.10`).
9. **قوانین اعتبارسنجی:** `VR-MATH-01` تا `VR-MATH-05`، `VR-DATE-01/02/04`، `VR-CURR-01/02/03`.
10. **فرمول‌های محاسباتی:** `CF-INV-01`؛ مقایسه `computed_total_irr` با `ocr_extracted_total_irr`.
11. **الگوریتم اجرا:**
    - گام ۱: تبدیل ارقام فارسی/عربی (`۱۲۳` / `١٢٣`) به ASCII و حذف جداکننده هزارگان.
    - گام ۲: جستجوی واحد پول («ریال» / «تومان»)؛ در نبود قرینه قطعی ثبت هشدار `CURRENCY_UNIT_AMBIGUOUS` (هرگز تبدیل ضمنی ۱۰ برابری نمی‌شود).
    - گام ۳: پارس و اعتبارسنجی تاریخ شمسی به میلادی (`VR-DATE-01`).
    - گام ۴: برای هر ردیف `LINE_ITEM` کنترل `qty * unit_price - discount + tax == line_net` و ذخیره `math_valid`.
    - گام ۵: کنترل جمع کل ردیف‌ها با فیلد `total_amount`؛ فقط در صورت تراز کامل کل سند، `math_validation_passed = true` تنظیم می‌شود.
12. **شرایط خطا:** `INVALID_JALALI_DATE`, `NON_NUMERIC_AMOUNT`.
13. **هشدارهای احتمالی:** `LINE_MATH_MISMATCH`, `HEADER_TOTAL_MISMATCH`, `CURRENCY_UNIT_AMBIGUOUS`, `ZERO_PRICE_NEEDS_PROMO_CHECK`.
14. **ساختار خروجی JSON:** `{ "math_validation_passed": false, "currency_detected": "UNKNOWN", "line_errors": [{"row": 3, "expected": 15000000, "extracted": 13000000}], "header_diff_irr": 2000000 }`.
15. **قالب PDF / 16. Excel:** ندارد.
17. **شواهد:** مقایسه `raw_value` در برابر `normalized_value` در `extracted_fields` و `extracted_table_cells`.
18. **تست دقت:** ردیف `10 * 1,200,000 - 600,000 + 1,140,000 = 12,540,000` اگر OCR `12,500,000` بخواند باید حتماً `math_valid = false` و `math_validation_passed = false` شود.
19. **معیارهای پذیرش:** `AT-DOC-MATH-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۶. `DOC-ENTITY-006` — تطبیق و یکتاسازی طرف‌حساب و کالا
1. **شناسه یکتای سرویس:** `DOC-ENTITY-006` (`P0`)
2. **هدف سرویس:** اتصال نام مشتری/تأمین‌کننده و شرح کالای روی سند به رکورد یکتای `contacts` و `products` در سازمان و جلوگیری از ایجاد رکورد تکراری.
3. **سناریوی کاربرد:** روی یک فاکتور نوشته شده «هایپر مارکت پارسیان» و در سیستم قبلاً «فروشگاه زنجیره‌ای پارسیان» با شناسه ملی یکسان ثبت شده است.
4. **نقش‌های مجاز:** `document:review_ocr`, `invoice:draft`.
5. **پیش‌نیازهای داده‌ای:** `source_raw_name` و شناسه‌های اختیاری (موبایل، کد ملی، بارکد، ایران‌کد).
6. **جدول‌های مبدأ و مقصد دیتابیس:** `contacts`, `contact_identifiers`, `products`, `product_identifiers`, `external_entity_mappings`, `entity_match_candidates`, `entity_merge_history`.
7. **فیلدهای ورودی:** `entity_domain` (`CONTACT` | `PRODUCT`), `raw_name`, `identifiers[]` (`NATIONAL_ID`, `BARCODE`, `MOBILE`, `EXTERNAL_ID`).
8. **پارامترهای قابل تنظیم:** `auto_exact_id_match` (`true` فقط برای شناسه یکتا/کد خارجی)، `fuzzy_candidate_threshold` (`0.55`).
9. **قوانین اعتبارسنجی:** `VR-ENT-02` (عدم ادغام خودکار با شباهت اسم تنها؛ رکوردهای `MERGED` به `merged_into_contact_id` هدایت می‌شوند).
10. **فرمول‌های محاسباتی:** `match_score` در `[0..1]`: تطبیق قطعی شناسه ملی/بارکد/کد خارجی = `1.0000`؛ نرمال‌سازی حروف فارسی (`ی/ي`, `ک/ك`, نیم‌فاصله، حذف پیشوندهای «فروشگاه/شرکت») + `PostgreSQL pg_trgm similarity`.
11. **الگوریتم اجرا:**
    - گام ۱: جستجوی Exact در `external_entity_mappings` ← سپس `contact_identifiers`/`product_identifiers`.
    - گام ۲: در نبود تطبیق شناسه، جستجوی `pg_trgm` روی `canonical_name` و بازگرداندن ۳ کاندید برتر بالای `0.55` به جدول `entity_match_candidates (review_status = 'PENDING')`.
    - گام ۳: تایید کاربر (`CONFIRMED_MATCH` یا `CONFIRMED_NEW`) و در صورت درخواست ادغام دو رکورد قدیمی، ثبت تغییرناپذیر در `entity_merge_history`.
12. **شرایط خطا:** `MERGED_ENTITY_CONFLICT`, `DUPLICATE_IDENTIFIER_VIOLATION`.
13. **هشدارهای احتمالی:** `POTENTIAL_DUPLICATE_CONTACT`, `UNMATCHED_NEW_PRODUCT`.
14. **ساختار خروجی JSON:** `{ "resolution_status": "CANDIDATE_FOUND", "candidates": [{"entity_id": "uuid", "canonical_name": "فروشگاه زنجیره‌ای پارسیان", "score": 0.84, "method": "FUZZY_NAME"}] }`.
15. **قالب PDF / 16. Excel:** ندارد.
16. **شواهد:** رکورد `entity_match_candidates` و `entity_merge_history`.
17. **تست دقت:** «فروشگاه پارس» و «فروشگاه پارسیان» با تشابه `0.78` نباید خودکار یکی شوند و باید `PENDING` بمانند.
18. **معیارهای پذیرش:** `AT-DOC-ENTITY-01..03`.
19. **نسخه الگوریتم:** `1.0.0`

---

## ۷. `DOC-REVIEW-007` — بازبینی انسانی و ثبت اصلاحات OCR
1. **شناسه یکتای سرویس:** `DOC-REVIEW-007` (`P0`)
2. **هدف سرویس:** دریافت اصلاحات کاربر روی فیلدها و جدول‌های استخراج‌شده، بازاجرای کنترل ریاضی و انتقال سند به وضعیت `Verified`.
3. **سناریوی کاربرد:** حسابدار کادرهای زرد/قرمز کنار تصویر فاکتور را اصلاح می‌کند (مثلاً یک صفر جاافتاده یا انتخاب واحد «کارتن») و دکمه «تایید بازبینی» را می‌زند.
4. **نقش‌های مجاز:** دارندگان `document:review_ocr` (`OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `INVENTORY_MANAGER`, `PERSONAL_USER`).
5. **پیش‌نیازهای داده‌ای:** سند در وضعیت `Needs Review` با حداقل یک `extraction_attempts`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `documents`, `extraction_attempts`, `extracted_fields`, `extracted_table_rows`, `extracted_table_cells`, `extraction_reviews`, `extraction_corrections`, `audit_logs`.
7. **فیلدهای ورودی:** `document_id`, `extraction_attempt_id`, `field_edits[]`, `cell_edits[]`, `review_outcome` (`APPROVED` | `NEEDS_CORRECTION` | `REJECTED`), `review_notes`.
8. **پارامترهای قابل تنظیم:** الزام یادداشت هنگام `REJECTED`.
9. **قوانین اعتبارسنجی:** پیش از `APPROVED` تمام فیلدهای الزامی (تاریخ معتبر، واحد پول، جمع تراز ریاضی `VR-MATH-01/02`) باید `true` شوند.
10. **فرمول‌های محاسباتی:** بازمحاسبه `CF-INV-01` پس از هر ویرایش سلول.
11. **الگوریتم اجرا:** ثبت `value_before` و `value_after` هر فیلد/سلول تغییرداده‌شده در `extraction_corrections` ← بروزرسانی `review_status = 'EDITED'/'ACCEPTED'` ← بازاجرای `DOC-MATH-005` ← ثبت `extraction_reviews` ← ارتقای `documents.lifecycle_status` به `Verified` (یا `Rejected`).
12. **شرایط خطا:** `CANNOT_APPROVE_UNBALANCED_MATH`, `INVALID_LIFECYCLE_STATE`, `CONCURRENT_MODIFICATION`.
13. **هشدارهای احتمالی:** `PRICE_OUTLIER_VS_CATALOG` (اختلاف فاحش قیمت با آخرین خرید/فروش).
14. **ساختار خروجی JSON:** `{ "document_id": "uuid", "new_lifecycle_status": "Verified", "corrections_logged": 2, "math_validation_passed": true }`.
15. **قالب PDF / 16. Excel:** ندارد.
16. **شواهد:** لاگ‌های `extraction_corrections` و `extraction_reviews`.
17. **تست دقت:** تغییر عدد از `12,000,000` به `120,000,000` باید در `extraction_corrections` ثبت و `math_validation_passed` فوراً بازمحاسبه شود.
18. **معیارهای پذیرش:** `AT-DOC-REVIEW-01..03`.
19. **نسخه الگوریتم:** `1.0.0`

---

## ۸. `DOC-POST-008` — تایید نهایی و ثبت قطعی سند مالی
1. **شناسه یکتای سرویس:** `DOC-POST-008` (`P0`)
2. **هدف سرویس:** انتقال کنترل‌شده فاکتور، دریافت/پرداخت یا تعدیل از `Verified` به `Posted` پس از عبور از قفل دوره مالی و دروازه تایید دوامضایی.
3. **سناریوی کاربرد:** حسابدار ارشد فاکتور تاییدشده را برای ثبت قطعی ارسال می‌کند؛ چون مبلغ بالای ۵۰۰ میلیون ریال است سیستم درخواست تایید مدیر مالی را می‌سازد.
4. **نقش‌های مجاز:** `invoice:post` / `payment:post` / `inventory:post_adjustment` (`OWNER`, `CFO`, `SENIOR_ACCOUNTANT` تا سقف، `PERSONAL_USER`).
5. **پیش‌نیازهای داده‌ای:** رکورد مالی در وضعیت `Verified`، دوره مالی `OPEN` (یا `SOFT_LOCKED` برای CFO)، `contact_id` و `product_id` غیرمعلق.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `invoices`, `payments`, `inventory_adjustments`, `fiscal_periods`, `organization_settings`, `approval_requests`, `documents`, `audit_logs`, `notifications`.
7. **فیلدهای ورودی:** `target_entity_type`, `target_entity_id`, `idempotency_key`, `approval_decision` (در گام تایید دوامضایی).
8. **پارامترهای قابل تنظیم:** `organization_settings.require_dual_approval_above_irr`.
9. **قوانین اعتبارسنجی:** `VR-PER-01..03`، `VR-DUP-02/04`، `VR-ENT-02`، قانون عدم برابری `requested_by <> decided_by` در Dual Approval.
10. **فرمول‌های محاسباتی:** `requires_dual_approval = (amount_irr > require_dual_approval_above_irr) OR (!actor_has_post_permission)`.
11. **الگوریتم اجرا:** کنترل قفل دوره ← کنترل Idempotency ← اگر نیاز به تایید دوم باشد ایجاد `approval_requests (PENDING)` و ارسال اعلان ← پس از تایید، تغییر اتمیک وضعیت به `Posted` + اجرای آثار جانبی (حرکت انبار) + ثبت `audit_logs`.
12. **شرایط خطا:** `FISCAL_PERIOD_CLOSED`, `SELF_APPROVAL_FORBIDDEN`, `DUPLICATE_INVOICE_DETECTED`, `UNRESOLVED_ENTITY_CANDIDATE`.
13. **هشدارهای احتمالی:** `PERIOD_SOFT_LOCKED_CFO_OVERRIDE`.
14. **ساختار خروجی JSON:** `{ "status": "Posted" | "Awaiting Approval", "approval_request_id": "uuid|null", "posted_at_utc": "..." }`.
15. **قالب PDF / 16. Excel:** ندارد.
16. **شواهد:** رکورد `approval_requests` و `audit_logs (INVOICE_POSTED)`.
17. **تست دقت:** در تایید همزمان دو درخواست با یک `idempotency_key` تنها یک بار به `Posted` برود و حرکت انبار مضاعف ثبت نشود.
19. **معیارهای پذیرش:** `AT-DOC-POST-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۹. `DOC-LINK-009` — اتصال چندبه‌چند اسناد پشتیبان به رکوردهای مالی
1. **شناسه یکتای سرویس:** `DOC-LINK-009` (`P1`)
2. **هدف سرویس:** برقراری پیوند `M:N` بین فایل‌های اسناد (رسید، بارنامه، فاکتور، تصویر چک) و رکوردهای مالی جهت ردیابی شواهد.
3. **سناریوی کاربرد:** یک فایل PDF پنج‌برگی شامل فاکتور خرید، بارنامه حمل و رسید کارتخوان به هر سه رکورد مالی مرتبط متصل می‌شود.
4. **نقش‌های مجاز:** `document:upload`, `invoice:draft`, `payment:post`.
5. **پیش‌نیازهای داده‌ای:** وجود `document_id` و `target_entity_id` متعلق به همان `organization_id`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `documents`, `document_relations`, `audit_logs`.
7. **فیلدهای ورودی:** `document_id`, `links: [{ target_entity_type, target_entity_id, relation_role }]`.
8. **پارامترهای قابل تنظیم:** ندارد.
9. **قوانین اعتبارسنجی:** جلوگیری از لینک تکراری (`UQ(org_id, doc_id, target_type, target_id)`) و منع حذف لینک از رکورد `Posted`.
10. **فرمول‌های محاسباتی:** ندارد (عملیات رابطه‌ای).
11. **الگوریتم اجرا:** اعتبارسنجی وجود موجودیت هدف در همان سازمان ← درج در `document_relations` ← ثبت ممیزی.
12. **شرایط خطا:** `TARGET_ENTITY_NOT_FOUND`, `CANNOT_UNLINK_POSTED_PRIMARY_SOURCE`.
13. **هشدارهای احتمالی:** `LINKED_TO_NEEDS_REVIEW_DOC`.
14. **ساختار خروجی JSON:** `{ "linked_count": 3, "relations": [...] }`.
15. **قالب PDF / 16. Excel:** نمایش در بخش «اسناد پیوست» خروجی‌های گزارش‌ها.
17. **شواهد:** جدول `document_relations`.
18. **تست دقت:** لینک کردن یک `document_id` به ۱ فاکتور و ۱ پرداخت باید در شواهد هر دو گزارش ظاهر شود.
19. **معیارهای پذیرش:** `AT-DOC-LINK-01`.
20. **نسخه الگوریتم:** `1.0.0`

---

# دسته B: حساب‌های دریافتنی (`FIN-AR-*`)

## ۱۰. `FIN-AR-INV-001` — ثبت و کنترل فاکتور فروش و برگشت از فروش
1. **شناسه یکتای سرویس:** `FIN-AR-INV-001` (`P0`)
2. **هدف سرویس:** ایجاد، اعتبارسنجی و محاسبه دقیق هدر و اقلام فاکتور فروش (`SALE`) و برگشت از فروش (`SALE_RETURN`) همراه با تخفیف، اشانتیون، واحد چندگانه و اثر انبار.
3. **سناریوی کاربرد:** ثبت فاکتور فروش ۱۰ کارتن رب (معادل ۱۲۰ عدد) + ۱ کارتن اشانتیون، تخفیف پلکانی ۵٪ و مالیات ۱۰٪ برای فروشگاه زنجیره‌ای.
4. **نقش‌های مجاز:** `invoice:draft`, `invoice:verify`, `invoice:post`.
5. **پیش‌نیازهای داده‌ای:** شعبه فعال، مشتری فعال (`contacts`), کالاها با ضریب تبدیل `product_units`, دوره مالی باز.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `invoices`, `invoice_lines`, `invoice_adjustments`, `contacts`, `products`, `product_units`, `fiscal_periods`, `warehouses`, `inventory_movements`.
7. **فیلدهای ورودی:** `branch_id`, `invoice_direction` (`SALE` | `SALE_RETURN`), `invoice_number`, `issue_jalali`, `due_jalali`, `contact_id`, `source_currency_code`, `invoice_discount_irr`, `lines[]` (`product_id`, `uom_id`, `quantity`, `unit_price_irr`, `discount_amount_irr`, `discount_pct`, `tax_amount_irr`, `is_promotional_free_item`, `warehouse_id`), `idempotency_key`.
8. **پارامترهای قابل تنظیم:** `default_invoice_due_days`, `allow_negative_stock`, `qty_decimal_scale`.
9. **قوانین اعتبارسنجی:** `VR-MATH-01..04, 08`، `VR-DATE-01..03`، `VR-CURR-01..04`، `VR-UOM-01..03`، `VR-DUP-02`، `VR-INV-01`.
10. **فرمول‌های محاسباتی:** `CF-INV-01` (محاسبه سطرها، تبدیل به واحد پایه، تخفیف و جمع خالص فاکتور).
11. **الگوریتم اجرا:**
    - گام ۱: کنترل دسترسی شعبه، تاریخ در دوره باز و تبدیل ارز به `IRR`.
    - گام ۲: تبدیل هر ردیف به `base_quantity` و محاسبه قطعی جمع سطرها و مالیات؛ اعمال `discount_amount_irr` و اشانتیون (`unit_price_irr = 0`).
    - گام ۳: بررسی موجودی انبار (`SALE` ← چک موجودی کافی) و کنترل سقف اعتبار مشتری (`FIN-AR-CREDIT-001`).
    - گام ۴: ذخیره در `invoices` و `invoice_lines`؛ در صورت درخواست `Posted` ارسال به گیت `DOC-POST-008` و تولید `inventory_movements` (`SALE_OUT` یا `RETURN_IN`).
12. **شرایط خطا:** `INSUFFICIENT_STOCK_BLOCKED`, `UOM_CONVERSION_MISSING`, `DUPLICATE_INVOICE_DETECTED`, `FISCAL_PERIOD_CLOSED`.
13. **هشدارهای احتمالی:** `CREDIT_LIMIT_EXCEEDED_WARNING`, `NEGATIVE_STOCK_OCCURRED`, `SELLING_BELOW_AVG_COST`.
14. **ساختار خروجی JSON:** `{ "invoice_id": "uuid", "lifecycle_status": "Posted", "subtotal_irr": 12000000, "line_discount_total_irr": 600000, "tax_total_irr": 1140000, "net_total_irr": 12540000, "warnings": [] }`.
15. **قالب PDF:** چاپ استاندارد فاکتور فروش رسمی/داخلی RTL با نمایش ردیف اشانتیون و جمع حروفی/عددی.
16. **قالب Excel:** خروجی لیست فاکتورهای فروش به همراه شیت اقلام جزئی.
17. **شواهد:** `primary_document_id` + `document_relations` + `inventory_movements.source_record_id`.
18. **تست دقت:** تست فاکتور با ۱۰ کارتن × ۱,۲۰۰,۰۰۰ ریال + ۱ کارتن اشانتیون + ۵٪ تخفیف + ۱۰٪ مالیات ← دقیقاً `12,540,000` ریال و خروج `11` کارتن از انبار.
19. **معیارهای پذیرش:** `AT-AR-INV-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۱۱. `FIN-AR-PAY-002` — ثبت دریافت وجه از مشتری
1. **شناسه یکتای سرویس:** `FIN-AR-PAY-002` (`P0`)
2. **هدف سرویس:** ثبت دریافت‌های نقدی، کارتخوان (`POS`)، حواله بانکی، چک یا تهاتر از مشتری با کنترل کد پیگیری و جلوگیری از تکرار.
3. **سناریوی کاربرد:** مشتری ۴۰ میلیون ریال از طریق کارتخوان و ۵۰ میلیون ریال چک صیادی بابت بدهی‌های قبلی پرداخت می‌کند.
4. **نقش‌های مجاز:** `invoice:draft` (پیش‌نویس اپراتور/حسابدار), `payment:post`.
5. **پیش‌نیازهای داده‌ای:** `contact_id`, `bank_account_id` (یا صندوق), `fiscal_period` باز، مبلغ بزرگ‌تر از صفر.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `payments`, `bank_accounts`, `checks`, `check_status_history`, `contacts`, `fiscal_periods`, `documents`.
7. **فیلدهای ورودی:** `branch_id`, `payment_method`, `occurred_jalali`, `contact_id`, `bank_account_id`, `amount_irr`, `tracking_code`, `cheque_payload` (در صورت چک), `idempotency_key`.
8. **پارامترهای قابل تنظیم:** `require_dual_approval_above_irr`.
9. **قوانین اعتبارسنجی:** `amount_irr > 0`، `VR-DATE-01/02`، `VR-DUP-03/04`، `VR-PER-01/02`، اعتبارسنجی `sayad_id` (۱۶ رقم).
10. **فرمول‌های محاسباتی:** تبدیل ارز به `IRR`؛ مقدار `unallocated_amount_irr = amount_irr - SUM(allocations)`.
11. **الگوریتم اجرا:** کنترل دوره و حساب بانکی ← بررسی تکراری نبودن `tracking_code` و `idempotency_key` ← ثبت در `payments (payment_direction = 'RECEIPT_IN')` ← در روش `CHEQUE` فراخوانی `TRS-CHK-001` ← پس از `Posted` ارسال خودکار یا دستی به `FIN-AR-ALLOC-003`.
12. **شرایط خطا:** `INVALID_BANK_ACCOUNT`, `DUPLICATE_TRACKING_CODE`, `ZERO_OR_NEGATIVE_AMOUNT`.
13. **هشدارهای احتمالی:** `UNALLOCATED_ADVANCE_CREDIT` (پرداخت بدون فاکتور باز مشخص)، `CHEQUE_PENDING_CLEARANCE`.
14. **ساختار خروجی JSON:** `{ "payment_id": "uuid", "lifecycle_status": "Posted", "amount_irr": 40000000, "unallocated_irr": 40000000 }`.
15. **قالب PDF:** رسید دریافت وجه مشتری با کد پیگیری و نام دریافت‌کننده.
16. **قالب Excel:** دفتر ثبت دریافت‌های دوره.
17. **شواهد:** تصویر رسید کارتخوان/فیش واریزی در `document_relations`.
18. **تست دقت:** ثبت دریافت ۴۰,۰۰۰,۰۰۰ ریال با تبدیل از `4,000,000 IRT` باید `amount_irr = 40000000` ذخیره کند.
19. **معیارهای پذیرش:** `AT-AR-PAY-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۱۲. `FIN-AR-ALLOC-003` — تخصیص دریافت به فاکتورها (`1:1`, `M:1`, `1:M`, `FIFO`)
1. **شناسه یکتای سرویس:** `FIN-AR-ALLOC-003` (`P0`)
2. **هدف سرویس:** اتصال دقیق مبالغ دریافتی به یک یا چند فاکتور فروش باز مشتری جهت محاسبه بدون خطای مانده باز هر فاکتور.
3. **سناریوی کاربرد:** مشتری یک واریز ۹۰ میلیون ریالی انجام داده که باید ۴۰ میلیون ریال فاکتور شماره ۱ و ۳۰ میلیون ریال فاکتور شماره ۲ را کامل ببندد و ۲۰ میلیون ریال از فاکتور شماره ۳ را تسویه جزئی کند.
4. **نقش‌های مجاز:** `payment:post`, `invoice:verify` (پیشنهاد تخصیص).
5. **پیش‌نیازهای داده‌ای:** پرداخت و فاکتورهای هدف هر دو متعلق به یک `contact_id` و یک `organization_id` و در وضعیت `Posted` (یا آماده تخصیص همزمان).
6. **جدول‌های مبدأ و مقصد دیتابیس:** `payments`, `invoices`, `invoice_adjustments`, `payment_allocations`, `audit_logs`.
7. **فیلدهای ورودی:** `payment_id`, `allocation_mode` (`EXPLICIT` | `FIFO_AUTO`), `explicit_items: [{ invoice_id, allocated_amount_irr }]` (در حالت `EXPLICIT`).
8. **پارامترهای قابل تنظیم:** `accounting_policies.payment_allocation_method` (`EXPLICIT_ONLY` vs `EXPLICIT_OR_FIFO`).
9. **قوانین اعتبارسنجی:** `VR-MATH-06` (مجموع تخصیص‌های فعال <= مبلغ پرداخت و <= مانده باز هر فاکتور)، `allocated_amount_irr > 0`، همسانی `contact_id`.
10. **فرمول‌های محاسباتی:** `CF-AR-01` و `CF-AR-03`.
11. **الگوریتم اجرا:**
    - گام ۱: قفل ردیف پرداخت و فاکتورهای مشتری در تراکنش PostgreSQL (`SELECT ... FOR UPDATE`).
    - گام ۲: محاسبه `remaining_payment` و `open_balance` هر فاکتور (`net_total + adjustments - active_allocations`).
    - گام ۳: در حالت `EXPLICIT` کنترل تک‌تک مبالغ؛ در حالت `FIFO_AUTO` مرتب‌سازی فاکتورها با `(issue_date ASC, id ASC)` و تخصیص متوالی.
    - گام ۴: درج رکوردها در `payment_allocations (status = 'ACTIVE')` و ثبت لاگ.
12. **شرایط خطا:** `ALLOCATION_OVERFLOW`, `CONTACT_MISMATCH`, `FIFO_DISABLED_BY_POLICY`.
13. **هشدارهای احتمالی:** `EXCESS_PAYMENT_HELD_AS_CREDIT` (باقیمانده پرداخت به عنوان بستانکاری مشتری).
14. **ساختار خروجی JSON:** `{ "payment_id": "uuid", "allocations": [{"invoice_id": "...", "allocated_irr": 40000000, "invoice_remaining_irr": 0}], "unallocated_credit_irr": 0 }`.
15. **قالب PDF / 16. Excel:** جدول تطبیق پرداخت-فاکتور در صورتحساب مشتری.
17. **شواهد:** ردیف‌های `payment_allocations` با `allocation_method` و زمان تخصیص.
18. **تست دقت:** یک پرداخت ۹۰ میلیونی به فاکتورهای ۴۰، ۳۰ و ۵۰ میلیونی با `FIFO` باید مانده‌ها را دقیقاً به `0`، `0` و `30,000,000` برساند.
19. **معیارهای پذیرش:** `AT-AR-ALLOC-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۱۳. `FIN-AR-AGING-001` — تحلیل بدهی معوق و گزارش سنی مطالبات
1. **شناسه یکتای سرویس:** `FIN-AR-AGING-001` (`P0`)
2. **هدف سرویس:** محاسبه دقیق مانده مطالبات باز مشتریان، تفکیک بدهی جاری از معوق در سبدهای سنی استاندارد و جداسازی چک‌های وصول‌نشده.
3. **سناریوی کاربرد:** مدیرعامل یا مدیر فروش می‌پرسد: «کدام مشتریان بیش از ۳۰ روز بدهی معوق دارند و چقدر از بدهی آن‌ها چک در دست است؟»
4. **نقش‌های مجاز:** `ar:view_aging` (`OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `SALES_MANAGER`).
5. **پیش‌نیازهای داده‌ای:** وجود حداقل یک فاکتور فروش `Posted` (در نبود هیچ فاکتور، گزارش صفر با وضعیت شفاف برمی‌گردد).
6. **جدول‌های مبدأ و مقصد دیتابیس:** `invoices`, `invoice_adjustments`, `payments`, `payment_allocations`, `checks`, `contacts`, `organization_settings`, `report_definitions`, `report_data_snapshots`, `report_executions`, `report_versions`, `report_metrics`, `report_evidences`, `processing_warnings`.
7. **فیلدهای ورودی:** `as_of_date_jalali` (پیش‌فرض امروز), `branch_id` (اجباری بر اساس `branch_scope_id` اگر محدود باشد), `min_overdue_days` (پیش‌فرض `0`), `contact_id` (اختیاری), `display_currency` (`IRR` | `IRT`), `include_pending_cheques_column` (`true`).
8. **پارامترهای قابل تنظیم:** سبدهای سنی استاندارد `[0, 1-30, 31-60, 61-90, +90]` و `default_invoice_due_days` (`30`).
9. **قوانین اعتبارسنجی:** `VR-DATE-01` روی تاریخ مبنا؛ اعمال خودکار فیلتر `branch_scope_id`؛ تفکیک چک `IN_HAND`/`DEPOSITED` از وصولی قطعی.
10. **فرمول‌های محاسباتی:** `CF-AR-01` (مانده باز) و `CF-AR-02` (محاسبه `DaysPastDue` و سبد سنی).
11. **الگوریتم اجرا:**
    - گام ۱: کنترل مجوز `ar:view_aging` و ساخت Snapshot داده‌ای (`report_data_snapshots`) شامل شمارش اسناد `Posted` (`included_document_count`) و اسناد `Needs Review` (`pending_document_count`).
    - گام ۲: محاسبه مانده باز هر فاکتور فروش `Posted` تا `as_of_date` بر اساس `payment_allocations` فعال (`payments` غیراز چک پاس‌نشده).
    - گام ۳: محاسبه جمع چک‌های `IN_HAND`/`DEPOSITED` هر مشتری به عنوان ستون مجزای «چک در جریان وصول».
    - گام ۴: دسته‌بندی فاکتورهای باز در سبدهای سنی و تجمیع به ازای هر مشتری (`contact_id`).
    - گام ۵: محاسبه `confidence_level`: `HIGH` اگر `pending_document_count == 0`، در غیر این صورت `MEDIUM` یا `LOW` با ثبت `PENDING_DOCS_EXCLUDED`.
    - گام ۶: ذخیره `report_versions`، `report_metrics` و نگاشت تمام فاکتورهای باز در `report_evidences`.
12. **شرایط خطا:** `FORBIDDEN_BRANCH_SCOPE`, `INVALID_AS_OF_DATE`.
13. **هشدارهای احتمالی:** `PENDING_DOCS_EXCLUDED` (اسناد تاییدنشده)، `UNALLOCATED_CREDITS_EXIST` (بستانکاری علی‌الحساب تخصیص‌نیافته مشتری)، `BOUNCED_CHEQUES_PRESENT`.
14. **ساختار خروجی JSON:** مطابق `ErpkianReportEnvelope v1` شامل `summary_metrics` (`total_open_ar_irr`, `total_overdue_irr`, `overdue_30_plus_irr`, `pending_cheques_irr`) و `rows` به تفکیک مشتری و سبد سنی + `evidences`.
15. **قالب PDF:** جدول رتبه‌بندی مشتریان بدهکار با ستون‌های: نام مشتری، کل بدهی، جاری، ۱-۳۰، ۳۱-۶۰، ۶۱-۹۰، +۹۰ روز، چک در جریان وصول، و باکس هشدار اسناد معلق.
16. **قالب Excel:** فایل ۴ شیته استاندارد (`خلاصه`، `جزئیات سنی مشتریان و فاکتورها`، `شواهد`، `اسناد معلق`).
17. **شواهد:** لیست فاکتورهای باز + رسیدهای تخصیص‌یافته + فایل‌های `primary_document_id` در `report_evidences`.
18. **تست دقت:** سناریوی استاندارد `AT-AR-AGING-01` (۲ فاکتور معوق ۴۵ روزه و ۵ روزه + یک چک وصول‌نشده ۴۰ میلیونی + ۲ فاکتور `Needs Review` مستثنی‌شده).
19. **معیارهای پذیرش:** `AT-AR-AGING-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

## ۱۴. `FIN-AR-REMIND-001` — مدیریت پیگیری و یادآوری وصول مطالبات (`P1`)
1. **شناسه یکتای سرویس:** `FIN-AR-REMIND-001` (`P1`) | **۲. هدف:** تهیه لیست و پیش‌نویس پیام محترمانه وصول برای مشتریان دارای بدهی معوق (ارسال صرفاً با تایید انسان). | **۳. کاربرد:** ارسال گزارش هفتگی پیگیری برای مدیر فروش/حسابدار. | **۴. مجوز:** `ar:draft_reminder`. | **۵. پیش‌نیاز:** خروجی `FIN-AR-AGING-001` و شماره تماس مشتری. | **۶. جداول:** `contacts`, `contact_identifiers`, `report_versions`, `notifications`, `audit_logs`. | **۷. ورودی:** `report_version_id`, `min_overdue_days`, `tone` (`FORMAL`/`FRIENDLY`). | **۸. پارامتر:** `min_amount_irr`, `cooldown_days`. | **۹. اعتبارسنجی:** وجود شماره موبایل معتبر؛ عدم ارسال خودکار بدون کلیک تایید کاربر. | **۱۰. فرمول:** تجمیع مانده معوق فاکتورهای هر مشتری از گزارش سنی. | **۱۱. الگوریتم:** خواندن بدهکاران بالای آستانه از Snapshot تاییدشده ← تولید قالب متن فارسی با ذکر دقیق شماره و تاریخ فاکتورهای باز ← صف پیش‌نویس برای تایید ارسال. | **۱۲. خطا:** `MISSING_CONTACT_PHONE`. | **۱۳. هشدار:** `PENDING_DOCS_MAY_CHANGE_BALANCE`. | **۱۴. JSON:** لیست مشتری + متن پیش‌نویس + لینک فاکتورها. | **۱۵. PDF:** جدول پیگیری تماس وصول. | **۱۶. Excel:** لیست پیگیری با ستون یادداشت تماس. | **۱۷. شواهد:** `report_evidences` متناظر. | **۱۸. تست:** عدم درج مشتری با بدهی صفر یا صرفاً جاری. | **۱۹. پذیرش:** `AT-AR-REMIND-01`. | **۲۰. نسخه:** `1.0.0`.

## ۱۵. `FIN-AR-DEFAULT-001` — تحلیل تاخیر تکراری و ریسک نکول مشتری (`P2`)
1. **شناسه یکتای سرویس:** `FIN-AR-DEFAULT-001` (`P2`) | **۲. هدف:** امتیازدهی عینی رفتار پرداخت مشتری بر پایه تاریخچه تاخیرها و چک‌های برگشتی (بدون ادعای پیش‌بینی قطعی ورشکستگی). | **۳. کاربرد:** ارزیابی ریسک پیش از افزایش اعتبار مشتری. | **۴. مجوز:** `ar:view_aging`. | **۵. پیش‌نیاز:** حداقل ۳ فاکتور تسویه‌شده یا ۶ ماه سابقه در سیستم. | **۶. جداول:** `invoices`, `payments`, `payment_allocations`, `checks`, `check_status_history`. | **۷. ورودی:** `contact_id` (یا کل مشتریان), `lookback_days` (`180`). | **۸. پارامتر:** وزن تاخیر و وزن چک برگشتی. | **۹. اعتبارسنجی:** شفافیت «داده تاریخی ناکافی» برای مشتریان جدید. | **۱۰. فرمول:** $\text{WeightedAvgDelay} = \frac{\sum (\text{ActualSettleDate} - \text{DueDate}) \times \text{InvoiceAmount}}{\sum \text{InvoiceAmount}}$ + جریمه چک `BOUNCED`. | **۱۱. الگوریتم:** محاسبه میانگین وزنی تاخیر تسویه ← شمارش چک‌های برگشتی ۲۴ ماهه ← رتبه‌بندی `LOW_RISK`/`MEDIUM_RISK`/`HIGH_RISK`. | **۱۲. خطا:** ندارد (با کمبود سابقه وضعیت `INSUFFICIENT_HISTORY`). | **۱۳. هشدار:** `INSUFFICIENT_HISTORY_FOR_SCORING`. | **۱۴. JSON:** شاخص DSO مشتری، تعداد چک برگشتی، سطح ریسک و توضیح محدودیت. | **۱۵. PDF / ۱۶. Excel:** ماتریس ریسک مشتریان. | **۱۷. شواهد:** تاریخچه پرداخت‌ها و `check_status_history`. | **۱۸. تست:** مشتری با ۲ چک برگشتی و میانگین تاخیر ۴۰ روز باید `HIGH_RISK` شود. | **۱۹. پذیرش:** `AT-AR-DEFAULT-01`. | **۲۰. نسخه:** `1.0.0`.

## ۱۶. `FIN-AR-CREDIT-001` — پایش و کنترل سقف اعتبار مشتریان (`P1`)
1. **شناسه یکتای سرویس:** `FIN-AR-CREDIT-001` (`P1`) | **۲. هدف:** کنترل لحظه‌ای مانده بدهی باز + چک‌های پاس‌نشده مشتری در برابر `credit_limit_irr`. | **۳. کاربرد:** هشدار به فروشنده یا مدیر فروش پیش از ثبت قطعی فاکتور نسیه جدید. | **۴. مجوز:** `ar:view_aging`, `invoice:draft`. | **۵. پیش‌نیاز:** `contacts.credit_limit_irr IS NOT NULL`. | **۶. جداول:** `contacts`, `invoices`, `payment_allocations`, `checks`. | **۷. ورودی:** `contact_id`, `proposed_invoice_amount_irr` (اختیاری). | **۸. پارامتر:** `include_pending_cheques_in_exposure` (پیش‌فرض `true`), `hard_block_on_limit` (پیش‌فرض `false`، هشدار + نیاز به تایید CFO). | **۹. اعتبارسنجی:** `credit_limit_irr >= 0`. | **۱۰. فرمول:** $\text{Exposure} = \text{OpenInvoicesBalance} + \text{PendingReceivableCheques} + \text{ProposedInvoiceAmount}$؛ $\text{UtilizationPct} = \frac{\text{Exposure}}{\text{CreditLimit}} \times 100$. | **۱۱. الگوریتم:** محاسبه بدهی باز + چک‌های `IN_HAND`/`DEPOSITED` ← مقایسه با سقف ← صدور وضعیت `OK` / `NEAR_LIMIT (>=85%)` / `EXCEEDED`. | **۱۲. خطا:** ندارد (اگر سقف ست نباشد `NO_LIMIT_SET`). | **۱۳. هشدار:** `CREDIT_LIMIT_EXCEEDED`. | **۱۴. JSON:** `{ "credit_limit_irr", "current_exposure_irr", "available_credit_irr", "status" }`. | **۱۵. PDF / ۱۶. Excel:** گزارش وضعیت اعتبار مشتریان. | **۱۷. شواهد:** فاکتورهای باز و چک‌های در جریان. | **۱۸. تست:** سقف ۲۰۰M، بدهی ۱۲۰M، چک در دست ۵۰M و فاکتور جدید ۴۰M ← جمع ۲۱۰M ← `EXCEEDED` به میزان ۱۰M. | **۱۹. پذیرش:** `AT-AR-CREDIT-01`. | **۲۰. نسخه:** `1.0.0`.

## ۱۷. `FIN-AR-PROFILE-001` — تحلیل جامع وضعیت حساب و گردش مشتری (`P1`)
1. **شناسه یکتای سرویس:** `FIN-AR-PROFILE-001` (`P1`) | **۲. هدف:** تولید صورتحساب کامل (کاردکس مالی) یک مشتری شامل کل خریدها، برگشتی‌ها، دریافت‌ها، تخفیف‌ها و چک‌ها. | **۳. کاربرد:** تسویه‌حساب دوره‌ای یا رفع اختلاف با مشتری. | **۴. مجوز:** `ar:view_aging`. | **۵. پیش‌نیاز:** `contact_id` معتبر با تاریخچه. | **۶. جداول:** `contacts`, `invoices`, `invoice_adjustments`, `payments`, `payment_allocations`, `checks`. | **۷. ورودی:** `contact_id`, `from_jalali`, `to_jalali`, `display_currency`. | **۸. پارامتر:** نمایش یا عدم نمایش فاکتورهای `Needs Review` در بخش مجزا. | **۹. اعتبارسنجی:** `VR-DATE-01`، بازه معتبر. | **۱۰. فرمول:** مانده اول دوره + (فروش + بدهکار تعدیل) - (برگشت از فروش + دریافت قطعی + بستانکار تعدیل) = مانده پایان دوره. | **۱۱. الگوریتم:** محاسبه مانده تجمعی تا `from_date` ← ردیف‌چینی اسناد `Posted` به ترتیب زمان و محاسبه مانده در جریان (`Running Balance`). | **۱۲. خطا:** `CONTACT_NOT_FOUND`. | **۱۳. هشدار:** `PENDING_CHEQUES_NOT_DEDUCTED`, `PENDING_DOCS_EXCLUDED`. | **۱۴. JSON:** هدر مشخصات مشتری + مانده اول و آخر + لیست ردیف‌های کاردکس + جدول چک‌ها. | **۱۵. PDF:** صورتحساب رسمی مشتری RTL. | **۱۶. Excel:** فایل ۲ شیته صورتحساب + چک‌ها. | **۱۷. شواهد:** ارجاع تک‌تک سطرها به سند مبدأ. | **۱۸. تست:** مجموع بدهکار منهای بستانکار سطرها باید با مانده کل در `FIN-AR-AGING-001` برابر باشد. | **۱۹. پذیرش:** `AT-AR-PROFILE-01`. | **۲۰. نسخه:** `1.0.0`.

---

# دسته C: حساب‌های پرداختنی (`FIN-AP-*`)

## ۱۸. `FIN-AP-INV-001` — ثبت و کنترل فاکتور خرید و برگشت از خرید (`P0`)
1. **شناسه یکتای سرویس:** `FIN-AP-INV-001` (`P0`)
2. **هدف سرویس:** ثبت استاندارد فاکتور خرید (`PURCHASE`) و برگشت از خرید (`PURCHASE_RETURN`)، محاسبه بهای تمام‌شده هر واحد پایه و تغذیه ورود/خروج انبار.
3. **سناریوی کاربرد:** شرکت پخش ۵۰ کارتن روغن نباتی (هر کارتن ۱۲ بطری) از تأمین‌کننده می‌خرد با تخفیف ردیفی ۳٪ و کرایه حمل ۲,۰۰۰,۰۰۰ ریال.
4. **نقش‌های مجاز:** `invoice:draft`, `invoice:verify`, `invoice:post`.
5. **پیش‌نیازهای داده‌ای:** تأمین‌کننده فعال (`contacts.is_supplier = true`)، کالاها با ضریب `product_units`، انبار مقصد، دوره مالی `OPEN`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `invoices`, `invoice_lines`, `invoice_adjustments`, `contacts`, `products`, `product_units`, `warehouses`, `inventory_movements`, `fiscal_periods`.
7. **فیلدهای ورودی:** `branch_id`, `invoice_direction` (`PURCHASE` | `PURCHASE_RETURN`), `invoice_number`, `issue_jalali`, `due_jalali`, `contact_id`, `source_currency_code`, `invoice_discount_irr`, `freight_irr`, `lines[]`, `idempotency_key`.
8. **پارامترهای قابل تنظیم:** `include_freight_in_cogs` (پیش‌فرض `true`؛ سرشکن متناسب بر ارزش ردیف‌ها)، `default_invoice_due_days`.
9. **قوانین اعتبارسنجی:** `VR-MATH-01..04, 08`، `VR-DATE-01..03`، `VR-CURR-01..04`، `VR-UOM-01..03`، `VR-DUP-02` (جلوگیری از ثبت تکراری شماره فاکتور یک تأمین‌کننده).
10. **فرمول‌های محاسباتی:** `CF-INV-01`؛ بهای تمام‌شده واحد پایه $= \frac{\text{LineNetExclTax} + \text{AllocatedFreight}}{\text{BaseQty}}$.
11. **الگوریتم اجرا:** بررسی دوره و تأمین‌کننده ← تبدیل واحدها به `base_quantity` ← محاسبه تخفیف و مالیات ← سرشکن اختیاری کرایه حمل روی بهای کالا ← ثبت در `invoices` و در وضعیت `Posted` ایجاد `inventory_movements (PURCHASE_IN` یا `RETURN_OUT)` با `unit_cost_irr`.
12. **شرایط خطا:** `DUPLICATE_SUPPLIER_INVOICE`, `UOM_CONVERSION_MISSING`, `FISCAL_PERIOD_CLOSED`.
13. **هشدارهای احتمالی:** `PURCHASE_PRICE_SPIKE_OVER_20_PCT` (نوسان شدید قیمت خرید نسبت به آخرین فاکتور).
14. **ساختار خروجی JSON:** `{ "invoice_id": "uuid", "lifecycle_status": "Posted", "net_total_irr": 185000000, "inventory_movements_created": 2 }`.
15. **قالب PDF:** برگه رسید خرید و ورود کالا به انبار RTL.
16. **قالب Excel:** دفتر خرید با تفکیک بهای واحد پایه.
17. **شواهد:** فاکتور اسکن‌شده تأمین‌کننده در `documents` + `inventory_movements`.
18. **تست دقت:** خرید ۱۰ کارتن × ۶,۰۰۰,۰۰۰ ریال (تخفیف ۰، مالیات ۱۰٪ = ۶,۰۰۰,۰۰۰، کل ۶۶,۰۰۰,۰۰۰) + کرایه ۱,۲۰۰,۰۰۰ ← ورود ۱۲۰ عدد با بهای پایه $(60,000,000 + 1,200,000)/120 = 510,000$ ریال.
19. **معیارهای پذیرش:** `AT-AP-INV-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۱۹. `FIN-AP-PAY-002` — ثبت پرداخت به تأمین‌کننده و تخصیص (`P0`)
1. **شناسه یکتای سرویس:** `FIN-AP-PAY-002` (`P0`) | **۲. هدف:** ثبت پرداخت نقد/حواله/چک به تأمین‌کننده و تسویه فاکتورهای خرید باز. | **۳. کاربرد:** تسویه فاکتور خرید سررسیدشده با حواله پایا یا صدور چک صیادی. | **۴. مجوز:** `payment:post`. | **۵. پیش‌نیاز:** تأمین‌کننده، حساب بانکی، مبلغ `> 0`، دوره `OPEN`. | **۶. جداول:** `payments`, `payment_allocations`, `checks`, `bank_accounts`, `invoices`. | **۷. ورودی:** `payment_method`, `occurred_jalali`, `contact_id`, `bank_account_id`, `amount_irr`, `tracking_code`, `allocations[]` یا `FIFO_AUTO`, `idempotency_key`. | **۸. پارامتر:** `require_dual_approval_above_irr`. | **۹. اعتبارسنجی:** `VR-MATH-06/07`, `VR-DUP-03/04`, `VR-PER-01/02`. | **۱۰. فرمول:** `CF-AR-01` روی جهت `PURCHASE`. | **۱۱. الگوریتم:** قفل رکوردها ← ثبت `payments (PAYMENT_OUT)` ← ایجاد چک `PAYABLE` در صورت روش چک ← ثبت `payment_allocations` با کنترل عدم تجاوز از بدهی فاکتور ← دروازه دوامضایی بالای سقف. | **۱۲. خطا:** `ALLOCATION_OVERFLOW`, `DUPLICATE_TRACKING_CODE`. | **۱۳. هشدار:** `UNALLOCATED_SUPPLIER_ADVANCE`. | **۱۴. JSON:** `{ "payment_id", "lifecycle_status", "allocated_irr", "unallocated_irr" }`. | **۱۵. PDF:** سند پرداخت به تأمین‌کننده. | **۱۶. Excel:** دفتر پرداخت‌ها. | **۱۷. شواهد:** فیش واریزی/چک در `document_relations`. | **۱۸. تست:** پرداخت ۱۰۰M به دو فاکتور خرید ۶۰M و ۷۰M با FIFO ← مانده `0` و `30,000,000`. | **۱۹. پذیرش:** `AT-AP-PAY-01..03`. | **۲۰. نسخه:** `1.0.0`.

## ۲۰. `FIN-AP-AGING-001` — گزارش بدهی به تأمین‌کنندگان و سنی پرداختنی‌ها (`P1`)
1. **شناسه:** `FIN-AP-AGING-001` | **۲. هدف:** تحلیل سنی بدهی‌های پرداختنی به تأمین‌کنندگان در سبدهای جاری تا +۹۰ روز. | **۳. کاربرد:** کنترل بدهی‌های معوق شرکت به تأمین‌کنندگان اصلی. | **۴. مجوز:** `ar:view_aging` (یا `ap:view`). | **۵. پیش‌نیاز:** فاکتورهای خرید `Posted`. | **۶. جداول:** `invoices (PURCHASE)`, `payment_allocations`, `checks (PAYABLE)`, `report_*`. | **۷. ورودی:** `as_of_date_jalali`, `branch_id`, `display_currency`. | **۸. پارامتر:** سبدهای استاندارد سنی. | **۹. اعتبارسنجی:** `VR-DATE-01`, `branch_scope_id`. | **۱۰. فرمول:** `CF-AR-01/02` با تفکیک چک پرداختی صادرشده پاس‌نشده. | **۱۱. الگوریتم:** ساخت Snapshot ← محاسبه مانده باز خرید ← سبدبندی ← ثبت `report_versions` و شواهد. | **۱۲. خطا:** `INVALID_AS_OF_DATE`. | **۱۳. هشدار:** `PENDING_DOCS_EXCLUDED`. | **۱۴. JSON:** `ErpkianReportEnvelope v1`. | **۱۵. PDF / ۱۶. Excel:** گزارش سنی پرداختنی‌ها ۴ شیته. | **۱۷. شواهد:** `report_evidences`. | **۱۸. تست:** هم‌سنجی جمع سبدها با مانده کل خریدهای باز. | **۱۹. پذیرش:** `AT-AP-AGING-01`. | **۲۰. نسخه:** `1.0.0`.

## ۲۱. `FIN-AP-DUE-001` — تقویم سررسید پرداخت‌های پیش‌رو (`P1`)
1. **شناسه:** `FIN-AP-DUE-001` | **۲. هدف:** جدول زمان‌بندی تعهدات پرداختنی (فاکتور خرید + چک پرداختی) در ۷، ۱۴ و ۳۰ روز آینده. | **۳. کاربرد:** برنامه‌ریزی تامین نقدینگی هفته آینده. | **۴. مجوز:** `ap:view` / `report:view_cost_profit`. | **۵. پیش‌نیاز:** فاکتورهای خرید با `due_date` و چک‌های `PAYABLE`. | **۶. جداول:** `invoices`, `checks`, `payment_allocations`. | **۷. ورودی:** `horizon_days` (`7|14|30`), `from_jalali`. | **۸. پارامتر:** `include_overdue_backlog`. | **۹. اعتبارسنجی:** `VR-DATE-01`. | **۱۰. فرمول:** جمع تعهدات هر تاریخ سررسید = مانده باز فاکتورهای غیرچکی + مبلغ چک‌های پرداختی سررسیدشونده در آن روز. | **۱۱. الگوریتم:** استخراج تعهدات بدون شمارش مضاعف (اگر چک بابت فاکتور صادر شده، خود چک مبنای سررسید نقدی است نه فاکتور!). | **۱۲. خطا:** `INVALID_HORIZON`. | **۱۳. هشدار:** `INVOICES_MISSING_DUE_DATE`. | **۱۴. JSON:** تقویم روزانه/هفتگی تعهدات. | **۱۵. PDF / ۱۶. Excel:** جدول سررسید پرداخت‌ها. | **۱۷. شواهد:** شناسه چک‌ها و فاکتورها. | **۱۸. تست:** جلوگیری از شمارش مضاعف فاکتوری که بابت آن چک پرداختی ثبت شده است. | **۱۹. پذیرش:** `AT-AP-DUE-01`. | **۲۰. نسخه:** `1.0.0`.

## ۲۲. `FIN-AP-REC-001` — مغایرت‌گیری صورتحساب تأمین‌کننده (`P1`)
1. **شناسه:** `FIN-AP-REC-001` | **۲. هدف:** تطبیق فایل اکسل/PDF صورتحساب تأمین‌کننده با اسناد خرید، برگشتی و پرداخت‌های ثبت‌شده سازمان. | **۳. کاربرد:** یافتن فاکتور جاافتاده یا تخفیف لحاظ‌نشده در پایان فصل. | **۴. مجوز:** `bank:reconcile` / `invoice:verify`. | **۵. پیش‌نیاز:** فایل صورتحساب تأمین‌کننده و `contact_id`. | **۶. جداول:** `import_batches`, `invoices`, `payments`, `reconciliation_runs`, `reconciliation_matches`, `reconciliation_exceptions`. | **۷. ورودی:** `contact_id`, `statement_document_id`, `period_start`, `period_end`. | **۸. پارامتر:** `date_tolerance_days`, `amount_tolerance_irr`. | **۹. اعتبارسنجی:** کنترل کد فاکتور/شماره سند و مبلغ. | **۱۰. فرمول:** اختلاف حساب کل = مانده اعلامی تأمین‌کننده - مانده محاسباتی سیستم. | **۱۱. الگوریتم:** پارس سطرهای صورتحساب ← تطبیق بر اساس شماره سند/مبلغ/تاریخ ← ثبت `MISSING_BOOK_RECORD` و `AMOUNT_MISMATCH`. | **۱۲. خطا:** `UNPARSEABLE_STATEMENT`. | **۱۳. هشدار:** `OPEN_EXCEPTIONS_REMAIN`. | **۱۴. JSON:** خلاصه اختلاف + لیست سطرهای تطبیق‌نیافته. | **۱۵. PDF / ۱۶. Excel:** صورت مغایرت با تأمین‌کننده. | **۱۷. شواهد:** فایل تأمین‌کننده + اسناد داخلی. | **۱۸. تست:** کشف ۱ فاکتور ۲۰M ریالی موجود در فایل تأمین‌کننده ولی ثبت‌نشده در سیستم. | **۱۹. پذیرش:** `AT-AP-REC-01`. | **۲۰. نسخه:** `1.0.0`.

## ۲۳. `FIN-AP-PRIO-001` — اولویت‌بندی پرداخت به تأمین‌کنندگان (`P2`)
1. **شناسه:** `FIN-AP-PRIO-001` | **۲. هدف:** پیشنهاد ترتیب بهینه پرداخت بدهی‌ها با توجه به نقدینگی در دسترس، دیرکرد و اولویت تأمین. | **۳. کاربرد:** تصمیم‌گیری مدیر مالی وقتی موجودی بانک برای کل بدهی‌ها کافی نیست. | **۴. مجوز:** `CFO` / `OWNER`. | **۵. پیش‌نیاز:** خروجی `FIN-AP-DUE-001` + مانده حساب‌های بانکی. | **۶. جداول:** `invoices`, `checks`, `bank_transactions`, `contacts`. | **۷. ورودی:** `available_budget_irr`, `horizon_days`. | **۸. پارامتر:** وزن تاخیر، جریمه چک برگشتی، امتیاز تأمین‌کننده کلیدی. | **۹. اعتبارسنجی:** `available_budget_irr >= 0`. | **۱۰. فرمول:** امتیاز اولویت = $w_1 \cdot \text{DaysOverdue} + w_2 \cdot \text{CheckUrgency} + w_3 \cdot \text{SupplierCriticality}$. | **۱۱. الگوریتم:** مرتب‌سازی نزولی تعهدات و تخصیص پیشنهاد بودجه به عنوان **پیشنهاد مشاوره‌ای (نه دستور خودکار بانکی)**. | **۱۲. خطا:** `NEGATIVE_BUDGET`. | **۱۳. هشدار:** `PARTIAL_COVERAGE_ONLY`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** لیست اولویت‌بندی پرداخت. | **۱۷. شواهد:** فاکتورها و چک‌های مبنا. | **۱۸. تست:** چک سررسید فردا همیشه بالاتر از فاکتور نسیه بدون سررسید قرار گیرد. | **۱۹. پذیرش:** `AT-AP-PRIO-01`. | **۲۰. نسخه:** `1.0.0`.

---

# دسته D: بانک، صندوق و خزانه (`TRS-*`)

## ۲۴. `TRS-BANK-IMP-001` — ورود و استانداردسازی صورتحساب بانکی (`P0`)
1. **شناسه یکتای سرویس:** `TRS-BANK-IMP-001` (`P0`)
2. **هدف سرویس:** خواندن فایل Excel/CSV/PDF صورتحساب بانکی (ملت، ملی، سامان، صادرات، پاسارگاد و...)، تشخیص ستون‌های واریز/برداشت/پیگیری و ذخیره بدون تکرار در `bank_transactions`.
3. **سناریوی کاربرد:** حسابدار فایل گردش حساب ماهانه بانک ملت را بارگذاری می‌کند تا با رسیدهای سیستم مغایرت‌گیری شود.
4. **نقش‌های مجاز:** `bank:reconcile`, `document:upload`.
5. **پیش‌نیازهای داده‌ای:** وجود حساب بانکی فعال در `bank_accounts` و فایل صورتحساب معتبر.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `bank_accounts`, `documents`, `import_batches`, `import_rows`, `bank_transactions`.
7. **فیلدهای ورودی:** `bank_account_id`, `document_id`, `column_mapping` (یا تشخیص خودکار هدر بانک), `source_currency_code` (پیش‌فرض `IRR`), `idempotency_key`.
8. **پارامترهای قابل تنظیم:** قالب‌های نگاشت ستون بانک‌های ایران.
9. **قوانین اعتبارسنجی:** `VR-CURR-02` (عدم تبدیل ضمنی ریال/تومان)، `VR-DATE-01`, `VR-DUP-03/05`, `amount_signed_irr <> 0`.
10. **فرمول‌های محاسباتی:** کنترل تراز مانده سطر به سطر: $\text{RunningBalance}_i = \text{RunningBalance}_{i-1} + \text{Credit}_i - \text{Debit}_i$.
11. **الگوریتم اجرا:** پارس فایل در `import_batches` ← نرمال‌سازی تاریخ شمسی و اعداد فارسی ← بررسی تراز مانده در صورت وجود ستون مانده ← محاسبه `row_hash` و رد سطرهای تکراری (`DUPLICATE_SKIPPED`) ← درج سطرهای جدید در `bank_transactions (UNMATCHED)`.
12. **شرایط خطا:** `BALANCE_CONTINUITY_BROKEN`, `AMBIGUOUS_BANK_CURRENCY`, `INVALID_EXCEL_STRUCTURE`.
13. **هشدارهای احتمالی:** `DUPLICATE_ROWS_SKIPPED` (تعداد سطرهای تکراری که قبلاً وارد شده بودند).
14. **ساختار خروجی JSON:** `{ "import_batch_id": "uuid", "total_rows": 120, "imported": 95, "duplicate_skipped": 25, "invalid_rows": 0 }`.
15. **قالب PDF:** ندارد.
16. **قالب Excel:** گزارش سطرهای خطادار (`INVALID`) برای اصلاح کاربر.
17. **شواهد:** ردیف به `import_rows` و `documents` متصل است.
18. **تست دقت:** آپلود مجدد همان فایل صورتحساب باید `imported = 0` و `duplicate_skipped = 120` بدهد.
19. **معیارهای پذیرش:** `AT-TRS-IMP-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۲۵. `TRS-BANK-REC-001` — مغایرت‌گیری خودکار بانک (`P0`)
1. **شناسه یکتای سرویس:** `TRS-BANK-REC-001` (`P0`)
2. **هدف سرویس:** تطبیق هوشمند و قطعی تراکنش‌های صورتحساب بانکی با دریافت‌ها، پرداخت‌ها و چک‌ها و گزارش مغایرت‌های باز.
3. **سناریوی کاربرد:** پایان ماه، حسابدار مغایرت‌گیری بانک ملت را اجرا می‌کند و ۱ کارمزد ثبت‌نشده بانکی و ۲ واریز بدون رسید و ۳ کارتخوان تجمیعی کشف می‌شود.
4. **نقش‌های مجاز:** `bank:reconcile` (`OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`).
5. **پیش‌نیازهای داده‌ای:** `bank_account_id`، `period_start..period_end`، داده‌های `bank_transactions` و `payments`/`checks`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `bank_transactions`, `payments`, `checks`, `check_status_history`, `reconciliation_rules`, `reconciliation_runs`, `reconciliation_matches`, `reconciliation_exceptions`, `report_*`.
7. **فیلدهای ورودی:** `bank_account_id`, `period_start_jalali`, `period_end_jalali`, `rule_override` (اختیاری).
8. **پارامترهای قابل تنظیم:** `date_tolerance_days` (پیش‌فرض `2`), `amount_tolerance_irr` (پیش‌فرض `0` یا کارمزد تا سقف ۵۰,۰۰۰ ریال).
9. **قوانین اعتبارسنجی:** عدم تطبیق خودکار با امتیاز `< 1.0000` بدون تایید انسانی؛ جلوگیری از اتصال یک تراکنش بانک به دو پرداخت غیرتجمیعی با جمع نامساوی.
10. **فرمول‌های محاسباتی:** `CF-TRS-01` (گذر ۱: تطبیق قطعی؛ گذر ۲: چک صیاد؛ گذر ۳: احتمالی با امتیاز وزنی `0.70..0.99`؛ گذر ۴: تطبیق گروهی `N:1` شاپرک/POS).
11. **الگوریتم اجرا:**
    - گام ۱: ایجاد `reconciliation_runs (RUNNING)`.
    - گام ۲: اجرای گذر ۱ (`EXACT_CONFIRMED`) بر پایه کد پیگیری + مبلغ دقیق + تاریخ؛ تغییر `reconciliation_status = 'MATCHED'`.
    - گام ۳: اجرای گذر ۲ روی چک‌های `DEPOSITED`/`PAYABLE`؛ در صورت تطبیق قطعی، پیشنهاد/ثبت تغییر وضعیت چک به `CLEARED` همراه با `bank_transaction_id` در `check_status_history`.
    - گام ۴: اجرای گذر ۳ (`PROBABILISTIC_SUGGESTED`, `decision_status = 'PENDING'`) و گذر ۴ (تجمیع POS هم‌تاریخ).
    - گام ۵: ثبت باقیمانده‌های هر دو طرف در `reconciliation_exceptions` (`MISSING_BOOK_RECORD` یا `MISSING_BANK_TX`).
    - گام ۶: تکمیل اجرای گزارش و صدور هشدار در صورت وجود استثنای باز.
12. **شرایط خطا:** `NO_BANK_TRANSACTIONS_IN_PERIOD`, `INVALID_PERIOD_RANGE`.
13. **هشدارهای احتمالی:** `UNRESOLVED_RECON_EXCEPTIONS` (تعداد و جمع مبلغ مغایرت‌های باز), `PENDING_PROBABILISTIC_MATCHES`.
14. **ساختار خروجی JSON:** شامل شمارش `exact_matched`, `suggested_pending`, `missing_book_records`, `missing_bank_txs` و تفاوت جمع مانده بانک و دفتر.
15. **قالب PDF:** صورت مغایرت بانکی رسمی (مانده طبق بانک +/- اقلام باز = مانده طبق دفتر).
16. **قالب Excel:** ۴ شیته (`خلاصه مغایرت`، `تطبیق‌یافته‌ها و پیشنهادی‌ها`، `تراکنش‌های بی‌سند بانک`، `اسناد بی‌تراکنش دفتر`).
17. **شواهد:** پیوند مستقیم بین `bank_transactions.id` و `payments.id`/`checks.id` در `reconciliation_matches`.
18. **تست دقت:** ۳ تراکنش کارتخوان `10M + 15M + 25M` در سیستم با یک واریز شاپرک `50M` باید به عنوان تطبیق گروهی `3:1` با اختلاف `0` پیشنهاد شود.
19. **معیارهای پذیرش:** `AT-TRS-REC-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۲۶. `TRS-CHK-001` — مدیریت چک‌های دریافتی و پرداختی صیادی (`P0`)
1. **شناسه یکتای سرویس:** `TRS-CHK-001` (`P0`)
2. **هدف سرویس:** ثبت کامل مشخصات چک‌های دریافتی (`RECEIVABLE`) و پرداختی (`PAYABLE`) با شناسه ۱۶ رقمی صیاد و پیگیری تغییر وضعیت چرخه عمر چک.
3. **سناریوی کاربرد:** مشتری یک چک ۱۵۰ میلیون ریالی صیادی می‌دهد؛ چک ابتدا `IN_HAND`، سپس به حساب ملت `DEPOSITED`، و در تاریخ سررسید `CLEARED` یا `BOUNCED` می‌شود (یا به تأمین‌کننده `ENDORSED` یعنی خرج می‌شود).
4. **نقش‌های مجاز:** `check:manage`, `payment:post`.
5. **پیش‌نیازهای داده‌ای:** تاریخ سررسید معتبر، مبلغ `> 0`، شماره سریال و بانک، طرف حساب مرتبط.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `checks`, `check_status_history`, `payments`, `bank_transactions`, `contacts`, `documents`.
7. **فیلدهای ورودی:** `check_direction`, `sayad_id` (۱۶ رقمی اختیاری/توصیه‌شده), `serial_number`, `bank_name`, `issuer_contact_id`, `due_jalali`, `amount_irr`, `linked_payment_id`, `primary_document_id`.
8. **پارامترهای قابل تنظیم:** الزام ورود `sayad_id` در سازمان (پیش‌فرض توصیه‌شده با هشدار در نبود صیاد).
9. **قوانین اعتبارسنجی:** `VR-ENT-01` (`sayad_id ~ '^[0-9]{16}$'`)، ماشین انتقال مجاز وضعیت: `IN_HAND -> DEPOSITED | ENDORSED | CANCELLED`؛ `DEPOSITED -> CLEARED | BOUNCED`؛ تغییر به `CLEARED` در بانک متصل به `bank_transaction_id`.
10. **فرمول‌های محاسباتی:** جمع چک‌های فعال در هر وضعیت؛ در وضعیت `BOUNCED` بدهی نقدی مشتری همچنان باز و پرچم ریسک فعال می‌شود.
11. **الگوریتم اجرا:** ثبت رکورد `checks` ← ثبت تاریخچه اولیه در `check_status_history` ← در هر تغییر وضعیت کنترل ماتریس انتقال مجاز و ثبت رویداد تغییرناپذیر جدید + `audit_logs`.
12. **شرایط خطا:** `INVALID_SAYAD_ID_FORMAT`, `ILLEGAL_CHECK_STATUS_TRANSITION`, `CHECK_ALREADY_CLEARED`.
13. **هشدارهای احتمالی:** `MISSING_SAYAD_ID`, `BOUNCED_CHECK_ALERT`.
14. **ساختار خروجی JSON:** `{ "check_id", "sayad_id", "current_status", "amount_irr", "due_jalali", "history": [...] }`.
15. **قالب PDF / ۱۶. Excel:** دفتر کل چک‌های دریافتی و پرداختی به ترتیب سررسید.
17. **شواهد:** تصویر چک در `documents` + `bank_transaction_id` هنگام وصول.
18. **تست دقت:** انتقال مستقیم از `IN_HAND` به `CLEARED` بدون عبور از `DEPOSITED` (یا ثبت وصول نقدی صریح) کنترل شود؛ چک `IN_HAND` هرگز از مانده بدهی قطعی مشتری در `FIN-AR-AGING-001` کسر نشود.
19. **معیارهای پذیرش:** `AT-TRS-CHK-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۲۷. `TRS-CHK-ALERT-001` — هشدار سررسید و ریسک چک‌ها (`P1`)
1. **شناسه:** `TRS-CHK-ALERT-001` | **۲. هدف:** پایش خودکار چک‌های پرداختی و دریافتی در آستانه سررسید (`3, 7, 14` روز آینده) و چک‌های `BOUNCED`. | **۳. کاربرد:** پیشگیری از برگشت خوردن چک شرکت به علت کسری موجودی بانک. | **۴. مجوز:** `check:manage` / `ar:view_aging`. | **۵. پیش‌نیاز:** چک‌های فعال در `checks`. | **۶. جداول:** `checks`, `bank_accounts`, `notifications`, `assistant_recommendations`. | **۷. ورودی:** `window_days` (`7`), `check_direction`. | **۸. پارامتر:** بازه هشدار + `cooldown_until` ضدتکرار. | **۹. اعتبارسنجی:** کنترل `fingerprint_hash` برای جلوگیری از ارسال تکراری هشدار. | **۱۰. فرمول:** مقایسه جمع چک‌های پرداختی سررسید تا $N$ روز با موجودی تاییدشده حساب‌های بانکی. | **۱۱. الگوریتم:** استخراج چک‌های سررسید نزدیک ← مقایسه با مانده نقد ← تولید اعلان `CHEQUE_DUE` و پیشنهاد پیش‌دستانه. | **۱۲. خطا:** ندارد. | **۱۳. هشدار:** `INSUFFICIENT_BANK_FOR_PAYABLE_CHEQUES`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** لیست چک‌های پیش‌رو و شکاف نقدینگی. | **۱۷. شواهد:** شناسه چک و سند دریافت/پرداخت. | **۱۸. تست:** اگر ۲ چک پرداختی سررسید فردا `80M` و موجودی بانک `50M` باشد ← هشدار کسری `30M`. | **۱۹. پذیرش:** `AT-TRS-CHK-ALERT-01`. | **۲۰. نسخه:** `1.0.0`.

## ۲۸. `TRS-CF-ACTUAL-001` — گزارش جریان نقدی واقعی (`P1`)
1. **شناسه:** `TRS-CF-ACTUAL-001` | **۲. هدف:** گزارش ورود و خروج واقعی نقد، کارتخوان و حساب‌های بانکی در دوره انتخابی. | **۳. کاربرد:** پاسخ به «این ماه واقعاً چقدر پول وارد و خارج شده؟». | **۴. مجوز:** `bank:reconcile` / `report:view_cost_profit`. | **۵. پیش‌نیاز:** تراکنش‌های بانکی یا پرداخت‌های `Posted` غیرچکی/چک‌های `CLEARED`. | **۶. جداول:** `bank_accounts`, `bank_transactions`, `payments`, `report_*`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `bank_account_ids[]`, `source_mode` (`BANK_STATEMENT` | `POSTED_PAYMENTS`). | **۸. پارامتر:** کسر انتقال‌های بین‌حسابی داخلی (`INTERNAL_TRANSFER`) تا جمع ورودی/خروجی متورم نشود. | **۹. اعتبارسنجی:** حذف جفت `INTERNAL_TRANSFER` در جمع کل سازمان. | **۱۰. فرمول:** $\text{NetCashFlow} = \text{TotalInflows} - \text{TotalOutflows}$ (منهای انتقال‌های داخلی). | **۱۱. الگوریتم:** تجمیع بر اساس حساب، روش پرداخت و هفته/ماه شمسی. | **۱۲. خطا:** `NO_TREASURY_DATA`. | **۱۳. هشدار:** `UNRECONCILED_BANK_ROWS_EXIST`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** گزارش جریان نقدی دوره‌ای. | **۱۷. شواهد:** `bank_transactions` و `payments`. | **۱۸. تست:** انتقال ۵۰M بین بانک ملت و بانک ملی سازمان نباید ورودی/خروجی خالص را تغییر دهد (`Net = 0`). | **۱۹. پذیرش:** `AT-TRS-CF-ACT-01`. | **۲۰. نسخه:** `1.0.0`.

## ۲۹. `TRS-CF-FORECAST-001` — پیش‌بینی کوتاه‌مدت نقدینگی (`P1`)
1. **شناسه:** `TRS-CF-FORECAST-001` | **۲. هدف:** برآورد نقدینگی ۷، ۱۴ و ۳۰ روز آینده در ۳ سناریو (`محافظه‌کارانه`, `پایه`, `خوش‌بینانه`) بدون وعده قطعی. | **۳. کاربرد:** مدیریت نقدینگی شرکت پخش پیش از خریدهای عمده. | **۴. مجوز:** `OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`. | **۵. پیش‌نیاز:** مانده بانک/صندوق فعلی + چک‌ها و فاکتورهای سررسیددار. | **۶. جداول:** `bank_transactions`, `checks`, `invoices`, `payment_allocations`, `report_*`. | **۷. ورودی:** `horizon_days` (`7|14|30`). | **۸. پارامتر:** ضرایب نرخ وصول تاریخی و وزن چک‌های مشتریان پرریسک. | **۹. اعتبارسنجی:** درج صریح برچسب «برآورد سناریومحور و غیرقطعی». | **۱۰. فرمول:** `CF-TRS-02`. | **۱۱. الگوریتم:** محاسبه مانده نقد پایه ← افزودن جریان روزانه چک‌ها و سررسیدهای تاییدشده در ۳ ستون سناریو ← نمایش روزهای دارای کسری احتمالی. | **۱۲. خطا:** `MISSING_OPENING_BANK_BALANCE`. | **۱۳. هشدار:** `FORECAST_SENSITIVE_TO_UNRECONCILED_DOCS`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول پیش‌بینی ۳ سناریو. | **۱۷. شواهد:** چک‌ها و فاکتورهای تشکیل‌دهنده هر روز. | **۱۸. تست:** سناریو محافظه‌کارانه همیشه باید `<=` سناریو پایه `<=` خوش‌بینانه باشد. | **۱۹. پذیرش:** `AT-TRS-CF-FCST-01`. | **۲۰. نسخه:** `1.0.0`.

## ۳۰. `TRS-CASH-REC-001` — کنترل و مغایرت‌گیری صندوق و تنخواه (`P1`)
1. **شناسه:** `TRS-CASH-REC-001` | **۲. هدف:** تطبیق موجودی شمارش‌شده صندوق فروش یا تنخواه‌گردان با گردش دریافت و پرداخت‌های نقدی ثبت‌شده. | **۳. کاربرد:** بستن صندوق روزانه فروشگاه یا تنخواه ماهانه دفتر. | **۴. مجوز:** `bank:reconcile`, `payment:post`. | **۵. پیش‌نیاز:** حساب `CASH_REGISTER` یا `PETTY_CASH` در `bank_accounts` و مبلغ شمارش فیزیکی. | **۶. جداول:** `bank_accounts`, `payments`, `financial_adjustments`, `reconciliation_*`. | **۷. ورودی:** `cash_account_id`, `as_of_jalali`, `counted_cash_irr`. | **۸. پارامتر:** آستانه اختلاف مجاز جزئی. | **۹. اعتبارسنجی:** `counted_cash_irr >= 0`. | **۱۰. فرمول:** $\text{ExpectedCash} = \text{OpeningCash} + \text{CashReceipts} - \text{CashPayments}$؛ $\text{Variance} = \text{CountedCash} - \text{ExpectedCash}$. | **۱۱. الگوریتم:** محاسبه مانده انتظاری تا لحظه بستن صندوق ← مقایسه با شمارش فیزیکی ← در صورت اختلاف ایجاد `reconciliation_exceptions` و پیشنهاد ثبت `financial_adjustments`. | **۱۲. خطا:** `INVALID_ACCOUNT_KIND`. | **۱۳. هشدار:** `CASH_SHORTAGE_DETECTED` / `CASH_SURPLUS_DETECTED`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** صورتجلسه بستن صندوق. | **۱۷. شواهد:** فهرست رسیدهای نقدی دوره. | **۱۸. تست:** مانده اول ۵M + دریافت نقد ۱۲M - هزینه ۴M = ۱۳M؛ شمارش ۱۲.۸M ← کسری ۲۰۰,۰۰۰ ریال. | **۱۹. پذیرش:** `AT-TRS-CASH-01`. | **۲۰. نسخه:** `1.0.0`.

---

# دسته E: کالا و انبار (`INV-*`)

## ۳۱. `INV-MASTER-001` — مدیریت کالا و واحدهای سنجش چندگانه (`P0`)
1. **شناسه:** `INV-MASTER-001` (`P0`) | **۲. هدف:** تعریف استاندارد کالاها، بارکد/ایران‌کد و ضرایب تبدیل بین واحد خرید، واحد فروش و واحد پایه. | **۳. کاربرد:** کالای «آب معدنی ۱.۵ لیتری» که به «پک ۶ تایی» یا «پالت» خریداری و به «بطری» یا «پک» فروخته می‌شود. | **۴. مجوز:** `inventory:move` (یا ادمین کالا). | **۵. پیش‌نیاز:** `base_uom_id` معتبر. | **۶. جداول:** `product_categories`, `products`, `product_identifiers`, `product_units`, `units_of_measure`, `unit_conversions`. | **۷. ورودی:** `sku`, `canonical_name`, `base_uom_id`, `secondary_units: [{ uom_id, conversion_to_base, default_purchase_price_irr, default_sale_price_irr }]`, `identifiers[]`. | **۸. پارامتر:** `reorder_point_base_qty`, `track_expiry`. | **۹. اعتبارسنجی:** `VR-UOM-01/03` (قفل `base_uom_id` پس از اولین حرکت)، یکتایی `sku` و `BARCODE` در سازمان. | **۱۰. فرمول:** `1 secondary_unit = conversion_to_base * base_unit`. | **۱۱. الگوریتم:** کنترل یکتایی SKU و بارکد ← ذخیره `products` ← ثبت ضرایب دقیق در `product_units`. | **۱۲. خطا:** `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `BASE_UOM_IMMUTABLE`. | **۱۳. هشدار:** `MISSING_DEFAULT_PURCHASE_PRICE`. | **۱۴. JSON:** آبجکت کامل کالا + ضرایب تبدیل. | **۱۵. PDF / ۱۶. Excel:** فهرست کاتالوگ کالا و نرخ تبدیل واحدها. | **۱۷. شواهد:** `product_identifiers`. | **۱۸. تست:** تبدیل ۱ کارتن ۲۴تایی + ۲.۵ کارتن ← `60` عدد پایه. | **۱۹. پذیرش:** `AT-INV-MST-01..03`. | **۲۰. نسخه:** `1.0.0`.

## ۳۲. `INV-MOV-001` — ثبت ورود، خروج و انتقال بین انبارها (`P0`)
1. **شناسه:** `INV-MOV-001` (`P0`)
2. **هدف:** ثبت تغییرناپذیر تمام حرکات فیزیکی انبار (`PURCHASE_IN`, `SALE_OUT`, `RETURN_IN`, `RETURN_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT_*`) با کنترل موجودی منفی و انتقال اتمیک.
3. **سناریوی کاربرد:** انتقال ۲۰ کارتن روغن از انبار مرکزی به انبار خودرو پخش ۱ یا خروج کالا هنگام `Posted` شدن فاکتور فروش.
4. **نقش‌های مجاز:** `inventory:move`, `invoice:post`.
5. **پیش‌نیازهای داده‌ای:** `warehouse_id`, `product_id`, `source_uom_id` با ضریب تبدیل معتبر، دوره مالی `OPEN`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `inventory_movements`, `warehouses`, `products`, `product_units`, `organization_settings`, `fiscal_periods`.
7. **فیلدهای ورودی:** `warehouse_id`, `destination_warehouse_id` (در انتقال), `product_id`, `movement_type`, `source_uom_id`, `source_qty`, `occurred_jalali`, `source_record_type`, `source_record_id`, `idempotency_key`.
8. **پارامترهای قابل تنظیم:** `organization_settings.allow_negative_stock`, `qty_decimal_scale`.
9. **قوانین اعتبارسنجی:** `VR-UOM-01/02`، `VR-INV-01/02/03`، `VR-PER-01/02`، `VR-DUP-04`.
10. **فرمول‌های محاسباتی:** `base_qty = ROUND(source_qty * conversion_to_base, qty_decimal_scale)` با علامت `+` برای ورود و `-` برای خروج.
11. **الگوریتم اجرا:** قفل ردیف موجودی کالا-انبار ← محاسبه موجودی لحظه‌ای ← بررسی سیاست موجودی منفی (`VR-INV-01`) ← در انتقال ایجاد همزمان `TRANSFER_OUT` و `TRANSFER_IN` با `transfer_group_id` مشترک و محاسبه `unit_cost_irr` ← ثبت Append-only در `inventory_movements`.
12. **شرایط خطا:** `INSUFFICIENT_STOCK_BLOCKED`, `SAME_SOURCE_DEST_WAREHOUSE`, `FISCAL_PERIOD_CLOSED`.
13. **هشدارهای احتمالی:** `NEGATIVE_STOCK_OCCURRED`, `BELOW_REORDER_POINT`.
14. **ساختار خروجی JSON:** `{ "movement_ids": ["uuid"], "base_qty_signed": -240, "new_warehouse_balance": 160, "warnings": [] }`.
15. **قالب PDF:** حواله خروج/ورود/انتقال انبار.
16. **قالب Excel:** دفتر حرکات انبار.
17. **شواهد:** `source_record_type` و `source_record_id` متصل به فاکتور یا تعدیل.
18. **تست دقت:** انتقال ۱۵ کارتن (ضریب ۱۲) ← `TRANSFER_OUT = -180` در انبار مبدأ و `TRANSFER_IN = +180` در مقصد با مجموع تغییر کل سازمان `0`.
19. **معیارهای پذیرش:** `AT-INV-MOV-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۳۳. `INV-BAL-001` — محاسبه موجودی لحظه‌ای و Snapshot انبار (`P0`)
1. **شناسه:** `INV-BAL-001` (`P0`) | **۲. هدف:** ارائه موجودی تعدادی (در واحد پایه و واحد نمایش انتخابی) و ارزش ریالی انبارها در هر تاریخ مبنا با سرعت بالا. | **۳. کاربرد:** «الان توی انبار مرکزی و انبار شرق چند کارتن رب داریم؟». | **۴. مجوز:** `inventory:move` / `ar:view_aging` (محدود به شعبه) / `report:view_cost_profit` (برای ستون ارزش ریالی!). | **۵. پیش‌نیاز:** رکوردهای `inventory_movements` یا `stock_snapshots`. | **۶. جداول:** `warehouses`, `products`, `product_units`, `stock_snapshots`, `inventory_movements`, `accounting_policies`. | **۷. ورودی:** `as_of_date_jalali`, `warehouse_id` (اختیاری), `category_id` (اختیاری), `include_valuation` (`boolean`). | **۸. پارامتر:** `allow_negative_stock`. | **۹. اعتبارسنجی:** مخفی‌سازی کامل ستون `unit_cost_irr` و `total_value_irr` برای نقش‌هایی که مجوز `report:view_cost_profit` ندارند (`INVENTORY_MANAGER` در حالت محدود و `SALES_MANAGER`). | **۱۰. فرمول:** `CF-INV-01` (آخرین Snapshot معتبر + جمع حرکات `POSTED` بعدی). | **۱۱. الگوریتم:** یافتن جدیدترین `stock_snapshots (is_canonical = true, as_of_date <= T)` ← جمع `base_qty_signed` حرکات بعد از آن تا $T$ ← تبدیل نمایشی به واحد کارتن/عدد (مثل «۱۲ کارتن و ۴ عدد»). | **۱۲. خطا:** `FORBIDDEN_BRANCH_WAREHOUSE`. | **۱۳. هشدار:** `NEGATIVE_STOCK_DETECTED`, `VALUATION_OMITTED_POLICY_UNSET`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** لیست موجودی به تفکیک انبار و کالا. | **۱۷. شواهد:** آخرین Snapshot + تعداد حرکات انباشته. | **۱۸. تست:** Snapshot `500` عدد + خرید `120` - فروش `85` = دقیقاً `535` عدد (= ۴۴ کارتن و ۷ عدد در ضریب ۱۲). | **۱۹. پذیرش:** `AT-INV-BAL-01..03`. | **۲۰. نسخه:** `1.0.0`.

## ۳۴. `INV-CARDEX-001` — کاردکس گردش ریالی و تعدادی کالا (`P1`)
1. **شناسه:** `INV-CARDEX-001` | **۲. هدف:** ردیابی تاریخچه‌دار تمام ورودی‌ها و خروجی‌های یک کالا در یک یا چند انبار. | **۳. کاربرد:** بررسی علت کاهش غیرمنتظره موجودی یک قلم کالا. | **۴. مجوز:** `inventory:move` (بدون ستون ریال برای انباردار) و `report:view_cost_profit` (با ستون ریال). | **۵. پیش‌نیاز:** `product_id` و بازه تاریخ. | **۶. جداول:** `inventory_movements`, `warehouses`, `invoices`, `inventory_adjustments`. | **۷. ورودی:** `product_id`, `warehouse_id`, `from_jalali`, `to_jalali`. | **۸. پارامتر:** واحد نمایش (پایه یا کارتن). | **۹. اعتبارسنجی:** `VR-DATE-01`. | **۱۰. فرمول:** مانده در جریان ردیف $i$ = مانده ردیف $i-1$ + `base_qty_signed`. | **۱۱. الگوریتم:** محاسبه مانده اول بازه با `INV-BAL-001` ← مرتب‌سازی حرکات به ترتیب `(occurred_at, id)` ← محاسبه مانده تجمعی. | **۱۲. خطا:** `PRODUCT_NOT_FOUND`. | **۱۳. هشدار:** `NEGATIVE_RUNNING_BALANCE_POINT`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول استاندارد کاردکس کالا. | **۱۷. شواهد:** لینک هر سطر به شماره فاکتور یا تعدیل مبدأ. | **۱۸. تست:** مانده سطر آخر کاردکس باید ۱۰۰٪ با خروجی `INV-BAL-001` در تاریخ `to_date` برابر باشد. | **۱۹. پذیرش:** `AT-INV-CDX-01`. | **۲۰. نسخه:** `1.0.0`.

## ۳۵. `INV-REC-001` — مغایرت‌گیری انبارگردانی و تعدیل موجودی (`P0`)
1. **شناسه یکتای سرویس:** `INV-REC-001` (`P0`)
2. **هدف سرویس:** مقایسه فایل/فهرست شمارش انبار یا گزارش خروجی انبار با موجودی محاسباتی سیستم، کشف کسری/اضافه و تولید پیش‌نویس سند تعدیل انبار.
3. **سناریوی کاربرد:** انباردار فایل اکسل شمارش پایان ماه انبار مرکزی را آپلود می‌کند؛ سیستم کسری ۱۵ عدد از کالای A و اضافه ۲ کارتن از کالای B را کشف و برای تایید مدیر مالی ارسال می‌کند.
4. **نقش‌های مجاز:** `inventory:reconcile` (اجرا و پیش‌نویس تعدیل), `inventory:post_adjustment` (`CFO`/`OWNER` برای ثبت قطعی).
5. **پیش‌نیازهای داده‌ای:** `warehouse_id`, `as_of_date_jalali`, فایل شمارش فیزیکی یا `stock_snapshots (is_canonical = false)`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `stock_snapshots`, `inventory_movements`, `reconciliation_runs`, `reconciliation_exceptions`, `inventory_adjustments`, `approval_requests`, `import_batches`.
7. **فیلدهای ورودی:** `warehouse_id`, `as_of_date_jalali`, `count_import_batch_id` (یا لیست شمارش), `reason_code` (`COUNT_VARIANCE`).
8. **پارامترهای قابل تنظیم:** `qty_variance_tolerance` (پیش‌فرض `0`).
9. **قوانین اعتبارسنجی:** `VR-UOM-01`, تبدیل شمارش انبار به واحد پایه پیش از مقایسه، منع ثبت تعدیل خودکار بدون تایید مدیر مالی (`inventory:post_adjustment`).
10. **فرمول‌های محاسباتی:** $\text{VarianceBaseQty} = \text{PhysicalCountBaseQty} - \text{SystemBalanceBaseQty}$ (مثبت = اضافه انبار، منفی = کسری انبار).
11. **الگوریتم اجرا:** ورود فایل شمارش به `stock_snapshots (source_type='EXTERNAL_FILE', is_canonical=false)` ← اجرای `INV-BAL-001` برای هر کالا ← ثبت `STOCK_VARIANCE` در `reconciliation_exceptions` برای موارد غیرصفر ← در صورت درخواست کاربر ایجاد `inventory_adjustments (Needs Review)` ← تایید مدیر مالی و ثبت `ADJUSTMENT_IN/OUT` در `inventory_movements`.
12. **شرایط خطا:** `UNMAPPED_PRODUCT_IN_COUNT_FILE`, `UOM_AMBIGUITY_IN_COUNT`.
13. **هشدارهای احتمالی:** `PENDING_INVOICES_AFFECT_SYSTEM_STOCK` (وجود فاکتور فروش/خرید `Needs Review` تا تاریخ شمارش).
14. **ساختار خروجی JSON:** `{ "reconciliation_run_id", "matched_sku_count", "variance_sku_count", "variances": [{"product_id", "system_qty", "physical_qty", "variance_qty"}] }`.
15. **قالب PDF:** صورتجلسه رسمی مغایرت انبارگردانی با امضای انباردار و مدیر مالی.
16. **قالب Excel:** لیست اقلام انبارگردانی با ستون سیستم، شمارش، مغایرت و علت.
17. **شواهد:** فایل شمارش آپلودی در `documents` + `reconciliation_exceptions`.
18. **تست دقت:** سیستم `120` عدد، فایل انباردار `9` کارتن (= `108` عدد) ← مغایرت دقیق `-12` عدد (`ADJUSTMENT_OUT` پس از تایید).
19. **معیارهای پذیرش:** `AT-INV-REC-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۳۶. `INV-REORDER-001` — پایش نقطه سفارش و هشدار کسری موجودی (`P1`)
1. **شناسه:** `INV-REORDER-001` | **۲. هدف:** شناسایی کالاهایی که موجودی فعلی آن‌ها از `reorder_point_base_qty` کمتر شده و تخمین روزهای باقیمانده تا اتمام بر پایه میانگین فروش ۳۰ روز اخیر. | **۳. کاربرد:** ارسال لیست خرید پیشنهادی به تدارکات. | **۴. مجوز:** `inventory:move`. | **۵. پیش‌نیاز:** تنظیم `reorder_point_base_qty`. | **۶. جداول:** `products`, `stock_snapshots`, `inventory_movements`. | **۷. ورودی:** `warehouse_id`, `lookback_days` (`30`). | **۸. پارامتر:** روزهای پوشش مطلوب (`14`). | **۹. اعتبارسنجی:** نادیده‌گرفتن کالاهای `SERVICE` یا غیرفعال. | **۱۰. فرمول:** $\text{AvgDailyOut} = \frac{\sum \text{SALE\_OUT}_{30d}}{30}$؛ $\text{DaysOfSupply} = \frac{\text{CurrentBalance}}{\text{AvgDailyOut}}$. | **۱۱. الگوریتم:** مقایسه موجودی با نقطه سفارش ← رتبه‌بندی بحرانی‌ها (`Out of Stock`, `Below Reorder`, `Low Days of Supply`). | **۱۲. خطا:** ندارد. | **۱۳. هشدار:** `NO_SALES_HISTORY_FOR_VELOCITY`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** لیست کالاهای نیازمند تامین. | **۱۷. شواهد:** موجودی و سابقه خروج ۳۰ روزه. | **۱۸. تست:** موجودی ۶۰، نقطه سفارش ۱۰۰، مصرف روزانه ۱۰ ← `DaysOfSupply = 6` و وضعیت `BELOW_REORDER`. | **۱۹. پذیرش:** `AT-INV-REO-01`. | **۲۰. نسخه:** `1.0.0`.

## ۳۷. `INV-SLOW-001` — تحلیل کالاهای کم‌گردش، راکد و پایش انقضا (`P2`)
1. **شناسه:** `INV-SLOW-001` | **۲. هدف:** شناسایی کالاهای دارای موجودی مثبت بدون فروش در ۳۰/۶۰/۹۰ روز گذشته و پایش کالاهای دارای پرچم `track_expiry` *(مدیریت دقیق شماره سری/بچ در P2 پس از افزودن جدول `inventory_batches`)*. | **۳. کاربرد:** آزادسازی نقدینگی خوابیده در انبار و جلوگیری از تاریخ‌گذشتگی. | **۴. مجوز:** `inventory:move` / `report:view_cost_profit`. | **۵. پیش‌نیاز:** حرکات فروش و موجودی فعلی. | **۶. جداول:** `products`, `inventory_movements`, `stock_snapshots`. | **۷. ورودی:** `inactive_days_threshold` (`60`), `warehouse_id`. | **۸. پارامتر:** بازه‌های رکود (`30, 60, 90+`). | **۹. اعتبارسنجی:** عدم گزارش کالای تازه‌واردشده به عنوان راکد (`first_in_date` چک شود). | **۱۰. فرمول:** $\text{DaysSinceLastSale} = \text{AsOfDate} - \text{MAX(SALE\_OUT.occurred\_at)}$. | **۱۱. الگوریتم:** فیلتر کالاهای با موجودی `> 0` و `DaysSinceLastSale >= threshold`؛ برآورد ارزش راکد در صورت دسترسی مجوز. | **۱۲. خطا:** ندارد. | **۱۳. هشدار:** `EXPIRY_BATCH_TABLE_NOT_ACTIVE_YET` (برای ردیابی سری‌ساخت). | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** گزارش کالاهای راکد و کم‌گردش. | **۱۷. شواهد:** تاریخ آخرین فروش و موجودی فعلی. | **۱۸. تست:** کالایی که ۹۵ روز پیش خریداری شده و هیچ خروجی نداشته راکد محسوب می‌شود، اما کالای خریداری‌شده ۱۰ روز پیش خیر. | **۱۹. پذیرش:** `AT-INV-SLW-01`. | **۲۰. نسخه:** `1.0.0`.

---

# دسته F: فروش، خرید و یکپارچه‌سازی (`SLS-*`, `PUR-*`, `INT-*`)

## ۳۸. `SLS-RPT-001` — گزارش فروش دوره‌ای و مقایسه‌گر زمانی (`P0`)
1. **شناسه یکتای سرویس:** `SLS-RPT-001` (`P0`)
2. **هدف سرویس:** محاسبه دقیق فروش ناخالص، تخفیف‌ها، برگشت از فروش، مالیات و فروش خالص در دوره دلخواه همراه با مقایسه نسبت به دوره قبل.
3. **سناریوی کاربرد:** مدیرعامل می‌پرسد: «فروش خالص آبان ۱۴۰۵ چقدر بوده و نسبت به مهر چقدر تغییر کرده است؟»
4. **نقش‌های مجاز:** `ar:view_aging`, `report:export` (`OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `SALES_MANAGER` محدود به شعبه).
5. **پیش‌نیازهای داده‌ای:** بازه تاریخ معتبر؛ وجود یا عدم وجود فاکتورهای `Posted` (`SALE`, `SALE_RETURN`).
6. **جدول‌های مبدأ و مقصد دیتابیس:** `invoices`, `invoice_lines`, `invoice_adjustments`, `report_data_snapshots`, `report_executions`, `report_versions`, `report_metrics`, `report_evidences`.
7. **فیلدهای ورودی:** `from_jalali`, `to_jalali`, `compare_with_previous_period` (`boolean`), `branch_id`, `display_currency`.
8. **پارامترهای قابل تنظیم:** شمول یا عدم شمول مالیات در نمایش (مبنای تحلیل فروش خالص همیشه بدون ارزش افزوده است).
9. **قوانین اعتبارسنجی:** `VR-DATE-01`، فیلتر خودکار `branch_scope_id`، جلوگیری از تقسیم بر صفر در محاسبه درصد رشد.
10. **فرمول‌های محاسباتی:** `CF-PRF-01` (`NetSales = GrossSales - TotalDiscounts - SalesReturnsNet`)؛ $\text{GrowthPct} = \frac{\text{NetSales}_t - \text{NetSales}_{t-1}}{\text{NetSales}_{t-1}} \times 100$ اگر $\text{NetSales}_{t-1} > 0$.
11. **الگوریتم اجرا:** ساخت Snapshot برای هر دو بازه ← محاسبه جمع ردیف‌های `SALE` و `SALE_RETURN` `Posted` ← شمارش فاکتورهای `Needs Review` مستثنی‌شده ← ذخیره نسخه گزارش و شواهد.
12. **شرایط خطا:** `INVALID_DATE_RANGE`, `FORBIDDEN_BRANCH_SCOPE`.
13. **هشدارهای احتمالی:** `PENDING_DOCS_EXCLUDED`, `PREVIOUS_PERIOD_ZERO_SALES`.
14. **ساختار خروجی JSON:** `{ "summary_metrics": ["gross_sales_irr", "total_discounts_irr", "sales_returns_irr", "net_sales_irr", "tax_total_irr", "growth_pct"], "rows": [...], "evidences": [...] }`.
15. **قالب PDF:** گزارش فروش دوره‌ای با جدول مقایسه دو دوره و نمودار روند روزانه/هفتگی.
16. **قالب Excel:** فایل ۴ شیته (`خلاصه`، `فهرست فاکتورها`، `شواهد`، `اسناد معلق`).
17. **شواهد:** شناسه تمام فاکتورهای `SALE` و `SALE_RETURN` لحاظ‌شده در `report_evidences`.
18. **تست دقت:** فروش ناخالص `200M`، تخفیف `15M`، برگشت `25M` ← فروش خالص `160M` ریال.
19. **معیارهای پذیرش:** `AT-SLS-RPT-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۳۹. `SLS-BREAK-001` — تحلیل فروش به تفکیک کالا، مشتری، شعبه و ویزیتور (`P1`)
1. **شناسه:** `SLS-BREAK-001` | **۲. هدف:** تفکیک و رتبه‌بندی فروش خالص بر اساس کالا، دسته کالا، مشتری، شعبه و ویزیتور (`SALES_REP`). | **۳. کاربرد:** ارزیابی عملکرد تیم فروش و مناطق پخش. | **۴. مجوز:** `ar:view_aging`. | **۵. پیش‌نیاز:** فاکتورهای فروش `Posted`. | **۶. جداول:** `invoices`, `invoice_lines`, `products`, `product_categories`, `contacts`, `contact_roles`, `branches`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `group_by` (`PRODUCT` | `CATEGORY` | `CUSTOMER` | `BRANCH` | `SALES_REP`), `top_n`. | **۸. پارامتر:** `include_share_pct`. | **۹. اعتبارسنجی:** مجموع سطرهای تفکیک‌شده باید ۱۰۰٪ برابر `net_sales` در `SLS-RPT-001` باشد (به‌جز اختلاف‌های رندینگ در تفکیک تخفیف پای فاکتور که به نسبت سرشکن می‌شود). | **۱۰. فرمول:** سهم درصد = $\frac{\text{GroupNetSales}}{\text{TotalNetSales}} \times 100$. | **۱۱. الگوریتم:** گروه‌بندی SQL با سرشکن دقیق `invoice_discount_irr` و `SALE_RETURN` ← مرتب‌سازی نزولی. | **۱۲. خطا:** `INVALID_GROUP_BY`. | **۱۳. هشدار:** `UNASSIGNED_SALES_REP_DOCS`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول رتبه‌بندی با سهم درصدی و تعداد فاکتور. | **۱۷. شواهد:** `report_evidences`. | **۱۸. تست:** جمع فروش شعب غرب و شرق دقیقاً برابر فروش کل سازمان است. | **۱۹. پذیرش:** `AT-SLS-BRK-01`. | **۲۰. نسخه:** `1.0.0`.

## ۴۰. `SLS-RET-001` — تحلیل برگشت از فروش، تخفیف‌ها و اشانتیون (`P1`)
1. **شناسه:** `SLS-RET-001` | **۲. هدف:** ردیابی نرخ مرجوعی، میزان تخفیف‌های ردیفی/پلکانی/پای‌فاکتور و ارزش تمام‌شده کالاهای اشانتیون (`is_promotional_free_item`). | **۳. کاربرد:** کنترل سیاست‌های تخفیف و جلوگیری از اشانتیون بیش از حد در پخش. | **۴. مجوز:** `ar:view_aging` (مقیاس ریال اشانتیون نیازمند `report:view_cost_profit`). | **۵. پیش‌نیاز:** فاکتورهای فروش و برگشتی و ردیف‌های اشانتیون. | **۶. جداول:** `invoices`, `invoice_lines`, `inventory_movements`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `branch_id`. | **۸. پارامتر:** آستانه هشدار نرخ مرجوعی (مثلاً `5%`). | **۹. اعتبارسنجی:** تفکیک اشانتیون (`unit_price = 0, is_promotional_free_item = true`). | **۱۰. فرمول:** $\text{ReturnRatePct} = \frac{\text{SalesReturnsNet}}{\text{GrossSales} - \text{Discounts}} \times 100$؛ $\text{PromoGiveawayRatio} = \frac{\text{PromoQtyBase}}{\text{PaidSoldQtyBase}} \times 100$. | **۱۱. الگوریتم:** محاسبه نرخ مرجوعی به تفکیک مشتری/کالا + تجمیع ارزش فروش ازدست‌رفته و بهای تمام‌شده اشانتیون‌ها. | **۱۲. خطا:** ندارد. | **۱۳. هشدار:** `HIGH_RETURN_RATE_CUSTOMER`, `PROMO_WITHOUT_COST`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** گزارش مرجوعی، تخفیف‌ها و اشانتیون. | **۱۷. شواهد:** فاکتورهای `SALE_RETURN` و ردیف‌های `is_promotional_free_item = true`. | **۱۸. تست:** ۱۰ کارتن فروش + ۱ کارتن اشانتیون ← نسبت اشانتیون تعدادی `10.00%`. | **۱۹. پذیرش:** `AT-SLS-RET-01`. | **۲۰. نسخه:** `1.0.0`.

## ۴۱. `PUR-RPT-001` — گزارش خرید دوره‌ای و تمرکز تأمین‌کنندگان (`P1`)
1. **شناسه:** `PUR-RPT-001` | **۲. هدف:** خلاصه خرید خالص، برگشت از خرید و سهم هر تأمین‌کننده در دوره انتخابی. | **۳. کاربرد:** بررسی وابستگی به تأمین‌کنندگان و حجم خرید فصلی. | **۴. مجوز:** `report:view_cost_profit`, `invoice:verify`. | **۵. پیش‌نیاز:** فاکتورهای خرید `Posted`. | **۶. جداول:** `invoices (PURCHASE, PURCHASE_RETURN)`, `invoice_lines`, `contacts`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `branch_id`. | **۸. پارامتر:** `top_n`. | **۹. اعتبارسنجی:** `VR-DATE-01`. | **۱۰. فرمول:** $\text{NetPurchases} = \text{GrossPurchases} - \text{PurchaseDiscounts} - \text{PurchaseReturns}$. | **۱۱. الگوریتم:** تجمیع بر اساس تأمین‌کننده و دسته‌بندی کالا. | **۱۲. خطا:** `INVALID_DATE_RANGE`. | **۱۳. هشدار:** `PENDING_DOCS_EXCLUDED`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول خرید و سهم تأمین‌کنندگان. | **۱۷. شواهد:** فاکتورهای خرید. | **۱۸. تست:** کسر صحیح `PURCHASE_RETURN` از جمع خرید تأمین‌کننده. | **۱۹. پذیرش:** `AT-PUR-RPT-01`. | **۲۰. نسخه:** `1.0.0`.

## ۴۲. `PUR-PRICE-001` — مقایسه نوسان قیمت خرید کالا (`P1`)
1. **شناسه:** `PUR-PRICE-001` | **۲. هدف:** مقایسه قیمت خرید هر کالا در واحد پایه یکسان در طول زمان و بین تأمین‌کنندگان مختلف. | **۳. کاربرد:** کشف اینکه آیا تأمین‌کننده جدید کالای X را گران‌تر فروخته یا خیر. | **۴. مجوز:** `report:view_cost_profit`. | **۵. پیش‌نیاز:** حداقل ۲ ردیف خرید `Posted` برای کالا. | **۶. جداول:** `invoice_lines`, `invoices`, `products`, `product_units`, `contacts`. | **۷. ورودی:** `product_id` (یا کل کالاها با آستانه نوسان), `from_jalali`, `to_jalali`. | **۸. پارامتر:** `spike_alert_pct` (`10%`). | **۹. اعتبارسنجی:** تبدیل حتمی قیمت خرید واحد سند به **قیمت واحد پایه** پیش از مقایسه (`unit_price_irr / conversion_to_base`). | **۱۰. فرمول:** $\text{BaseUnitPurchasePrice} = \frac{\text{LineNetExclTax}}{\text{BaseQty}}$؛ $\text{PriceChangePct} = \frac{P_t - P_{t-1}}{P_{t-1}} \times 100$. | **۱۱. الگوریتم:** نرمال‌سازی قیمت تمام خریدها به واحد پایه ← مرتب‌سازی زمانی ← محاسبه درصد تغییر و کمترین/بیشترین قیمت. | **۱۲. خطا:** `PRODUCT_NOT_FOUND`. | **۱۳. هشدار:** `SINGLE_PURCHASE_ONLY` (نبود سابقه مقایسه). | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول تاریخچه قیمت خرید در واحد پایه. | **۱۷. شواهد:** ردیف فاکتورهای خرید. | **۱۸. تست:** خرید ۱ کارتن ۱۲تایی به ۶,۰۰۰,۰۰۰ ریال و خرید بعدی ۱ بسته ۶تایی به ۳,۶۰۰,۰۰۰ ریال ← مقایسه واحد پایه `500,000` در برابر `600,000` (`+20%`). | **۱۹. پذیرش:** `AT-PUR-PRC-01`. | **۲۰. نسخه:** `1.0.0`.

## ۴۳. `SLS-TREND-001` — پرفروش‌ها و شناسایی افت فروش مشتریان (`P2`)
1. **شناسه:** `SLS-TREND-001` | **۲. هدف:** مقایسه سبد خرید مشتریان و رتبه‌بندی کالاهای پرفروش بین دوره جاری و میانگین دوره‌های قبل برای کشف ریزش مشتری. | **۳. کاربرد:** شناسایی مشتریانی که خریدشان بیش از ۴۰٪ افت کرده است. | **۴. مجوز:** `ar:view_aging`. | **۵. پیش‌نیاز:** حداقل ۲ ماه داده فروش `Posted`. | **۶. جداول:** `invoices`, `invoice_lines`, `contacts`, `products`. | **۷. ورودی:** `current_from..to`, `baseline_from..to`, `drop_threshold_pct` (`30%`). | **۸. پارامتر:** `min_baseline_sales_irr`. | **۹. اعتبارسنجی:** حذف مشتریان با پایه خرید زیر حداقل جهت جلوگیری از نویز. | **۱۰. فرمول:** $\text{DropPct} = \frac{\text{CurrentSales} - \text{BaselineAvgSales}}{\text{BaselineAvgSales}} \times 100$. | **۱۱. الگوریتم:** مقایسه خرید هر مشتری با بازه مبنا و رتبه‌بندی بیشترین ریزش‌ها و پرفروش‌ترین کالاها. | **۱۲. خطا:** `INSUFFICIENT_BASELINE_DATA`. | **۱۳. هشدار:** `PARTIAL_PERIOD_COMPARISON`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** فهرست مشتریان در خطر ریزش + Top 20 کالا. | **۱۷. شواهد:** فاکتورهای دو بازه. | **۱۸. تست:** مشتری با میانگین خرید `100M` که این ماه `20M` خریده ← افت `-80%`. | **۱۹. پذیرش:** `AT-SLS-TRD-01`. | **۲۰. نسخه:** `1.0.0`.

## ۴۴. `INT-SYNC-001` — ورود و همگام‌سازی یک‌طرفه هلو، سپیدار، راهکاران و اکسل (`P0`)
1. **شناسه یکتای سرویس:** `INT-SYNC-001` (`P0`)
2. **هدف سرویس:** ورود امن و بدون تکرار فایل‌های خروجی اکسل/CSV یا بسته‌های `Windows Agent` یک‌طرفه از نرم‌افزارهای هلو، سپیدار و راهکاران به مدل استاندارد Erpkian.
3. **سناریوی کاربرد:** شرکت پخش فایل خروجی فروش ماهانه «سپیدار» (۱۰۰ ردیف) را وارد می‌کند؛ ۹۵ ردیف سالم به صورت `Verified`/`Needs Review` وارد و ۵ ردیف خراب گزارش می‌شوند، و در آپلود مجدد ۹۹ ردیف تکراری رد و ۱ ردیف جدید وارد می‌شود.
4. **نقش‌های مجاز:** `org:manage_rbac_sync`, `document:upload`.
5. **پیش‌نیازهای داده‌ای:** اتصال فعال (`integration_connections`) یا فایل اکسل/CSV و نگاشت ستون‌ها.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `source_systems`, `integration_connections`, `external_entity_mappings`, `sync_jobs`, `sync_cursors`, `sync_errors`, `import_batches`, `import_rows`, `entity_match_candidates`, `invoices`, `payments`, `contacts`, `products`.
7. **فیلدهای ورودی:** `source_system_code` (`HOLOO` | `SEPIDAR` | `RAHKARAN` | `EXCEL`), `entity_domain`, `file_document_id` (یا Agent payload), `column_mapping_template_name`, `idempotency_key`.
8. **پارامترهای قابل تنظیم:** `read_only = true` (قفل اجباری در نسخه اول)، قالب پیش‌فرض ستون‌های هلو و سپیدار.
9. **قوانین اعتبارسنجی:** `VR-DUP-05` (`external_id` و `row_hash`)، `VR-CURR-02` (اجبار تشخیص واحد ریال/تومان فایل اکسل پیش از ورود)، `VR-DATE-01`, `VR-MATH-01/02`.
10. **فرمول‌های محاسباتی:** کنترل مجموع ستون‌ها و محاسبه شمارش `total_rows = imported + duplicate_skipped + invalid_rows`.
11. **الگوریتم اجرا:**
    - گام ۱: کنترل `read_only = true` (مسدودسازی هرگونه دستور `PUSH`).
    - گام ۲: ایجاد `import_batches` یا `sync_jobs` و استخراج تک‌تک سطرها در `import_rows` با محاسبه `row_hash`.
    - گام ۳: بررسی `external_entity_mappings` با کلید `(org_id, source_system_id, entity_domain, external_id)`؛ سطرهای تکراری با وضعیت `DUPLICATE_SKIPPED` رد می‌شوند.
    - گام ۴: تطبیق مشتری/کالای سطرها؛ موارد جدید به `entity_match_candidates` یا ثبت موقت هدایت می‌شوند.
    - گام ۵: جداسازی سطرهای خطادار در `import_rows (INVALID)` / `sync_errors` بدون متوقف کردن سطرهای سالم و ذخیره رکوردهای سالم در جداول مالی با `source_system` و `source_external_id`.
12. **شرایط خطا:** `WRITE_BACK_FORBIDDEN_IN_V1`, `AMBIGUOUS_SOURCE_CURRENCY`, `INVALID_COLUMN_MAPPING`.
13. **هشدارهای احتمالی:** `PARTIAL_IMPORT_WITH_ERRORS`, `UNMAPPED_ENTITIES_NEED_REVIEW`.
14. **ساختار خروجی JSON:** `{ "import_batch_id", "total_rows": 100, "imported_count": 95, "duplicate_skipped_count": 0, "invalid_count": 5, "errors": [...] }`.
15. **قالب PDF:** ندارد.
16. **قالب Excel:** فایل خروجی خطاهای سطری (با ستون شماره سطر و علت خطا برای اصلاح در فایل مبدأ).
17. **شواهد:** `import_rows.raw_row_json` و `external_entity_mappings.external_id`.
18. **تست دقت:** تست دو مرحله‌ای (۱۰۰ ردیف اول ← ۹۵ وارد و ۵ خطا؛ سپس آپلود فایل اصلاح‌شده با همان ۹۹ ردیف تکراری + ۱ جدید ← دقیقا `1` وارد و `99` تکراری رد).
19. **معیارهای پذیرش:** `AT-INT-SYNC-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

# دسته G: سودآوری و بهای تمام‌شده (`PRF-*`)

## ۴۵. `PRF-COGS-001` — محاسبه بهای تمام‌شده کالای فروش‌رفته (`P0`)
1. **شناسه یکتای سرویس:** `PRF-COGS-001` (`P0`)
2. **هدف سرویس:** محاسبه قطعی بهای تمام‌شده تک‌تک خروج‌های کالا (`SALE_OUT`، اشانتیون، ضایعات) بر پایه روش انتخابی سازمان (`WEIGHTED_AVERAGE` یا `FIFO`).
3. **سناریوی کاربرد:** کالایی یک بار با فی ۵۰,۰۰۰ ریال و بار دوم با فی ۶۰,۰۰۰ ریال خریداری شده و اکنون ۸۰ عدد آن فروخته می‌شود.
4. **نقش‌های مجاز:** سیستم موتور پردازش + `report:view_cost_profit` (`OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`).
5. **پیش‌نیازهای داده‌ای:** سیاست مشخص در `accounting_policies.inventory_valuation_method` (`WEIGHTED_AVERAGE` یا `FIFO` — در `UNSPECIFIED` متوقف می‌شود)، حرکات `inventory_movements`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `accounting_policies`, `inventory_movements`, `stock_snapshots`, `processing_jobs`, `processing_errors`, `processing_warnings`.
7. **فیلدهای ورودی:** `from_jalali`, `to_jalali`, `product_ids[]` (اختیاری), `warehouse_id` (اختیاری), `recalculate_from_snapshot` (`boolean`).
8. **پارامترهای قابل تنظیم:** `accounting_policies.inventory_valuation_method`, `allow_negative_stock`.
9. **قوانین اعتبارسنجی:** توقف قطعی با `VALUATION_POLICY_UNSET` اگر سیاست `UNSPECIFIED` باشد؛ تفکیک مقادیر دارای موجودی منفی بدون لایه خرید (`COST_UNRESOLVED_NEGATIVE_STOCK`).
10. **فرمول‌های محاسباتی:** `CF-COST-01` (میانگین موزون متحرک) و `CF-COST-02` (`FIFO`).
11. **الگوریتم اجرا:** خواندن سیاست سازمان ← بارگذاری آخرین Snapshot معتبر + تمام حرکات `POSTED` به ترتیب زمانی `(occurred_at ASC, id ASC)` ← پیمایش دفترکل حرکات و بروزرسانی صف لایه‌های FIFO یا میانگین متحرک ← ثبت `unit_cost_irr` و `total_cost_irr` روی خروجی‌ها و گزارش موارد فاقد لایه خرید.
12. **شرایط خطا:** `VALUATION_POLICY_UNSET`, `FORBIDDEN_COST_ACCESS`.
13. **هشدارهای احتمالی:** `COST_UNRESOLVED_NEGATIVE_STOCK`, `ZERO_COST_OPENING_SNAPSHOT`.
14. **ساختار خروجی JSON:** `{ "valuation_method": "FIFO", "total_cogs_irr": 4000000, "unresolved_qty_base": 0, "items": [...] }`.
15. **قالب PDF / ۱۶. Excel:** جدول بهای تمام‌شده و لایه‌های مصرفی هر کالا.
17. **شواهد:** ردیف‌های `PURCHASE_IN` و `OPENING` تغذیه‌کننده لایه بها.
18. **تست دقت:** ۱۰۰ عدد @ ۵۰k + ۱۰۰ عدد @ ۶۰k و خروج ۸۰ عدد: در `FIFO` دقیقاً `4,000,000` ریال و در `WEIGHTED_AVERAGE` دقیقاً `4,400,000` ریال.
19. **معیارهای پذیرش:** `AT-PRF-COGS-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۴۶. `PRF-GM-001` — تحلیل سود ناخالص کالا و فاکتور با درصد پوشش داده (`P0`)
1. **شناسه یکتای سرویس:** `PRF-GM-001` (`P0`)
2. **هدف سرویس:** محاسبه سود ناخالص و درصد حاشیه سود هر کالا و فاکتور همراه با سنجش شفاف پوشش داده بهای خرید (`cost_coverage_pct`).
3. **سناریوی کاربرد:** مدیر مالی می‌پرسد: «سود ناخالص این ماه ما چقدر بوده و برای چه درصدی از کالاها قیمت خرید نداشتیم؟»
4. **نقش‌های مجاز:** `report:view_cost_profit` (`OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`). **ممنوع برای `SALES_MANAGER` و `INVENTORY_MANAGER`.**
5. **پیش‌نیازهای داده‌ای:** فروش `Posted` + اجرای `PRF-COGS-001`.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `invoices`, `invoice_lines`, `inventory_movements`, `accounting_policies`, `report_*`, `processing_warnings`.
7. **فیلدهای ورودی:** `from_jalali`, `to_jalali`, `group_by` (`PRODUCT` | `INVOICE` | `CATEGORY`), `branch_id`.
8. **پارامترهای قابل تنظیم:** `min_coverage_for_medium_confidence` (`80%`).
9. **قوانین اعتبارسنجی:** هرگز کالای فاقد بهای خرید با `COGS = 0` در محاسبه سود قرار نمی‌گیرد (`CF-PRF-02`).
10. **فرمول‌های محاسباتی:** `CF-PRF-01` و `CF-PRF-02` (`CostCoveragePct`).
11. **الگوریتم اجرا:** تجمیع فروش خالص هر سطر ← تطبیق با `total_cost_irr` از `PRF-COGS-001` ← جداسازی سطرهای دارای بها از فاقد بها ← محاسبه `cost_coverage_pct` ← تعیین `confidence_level` (`HIGH` در ۱۰۰٪؛ `MEDIUM` در ۸۰-۹۹.۹٪؛ `LOW` زیر ۸۰٪) ← ثبت در `report_versions` و `report_evidences`.
12. **شرایط خطا:** `VALUATION_POLICY_UNSET`, `FORBIDDEN_COST_ACCESS`.
13. **هشدارهای احتمالی:** `PARTIAL_COST_DATA_COVERAGE` (فهرست کالاهای مستثنی‌شده به علت نبود فاکتور خرید).
14. **ساختار خروجی JSON:** `{ "summary_metrics": ["net_sales_total_irr", "covered_net_sales_irr", "cogs_covered_irr", "gross_profit_covered_irr", "gross_margin_pct", "cost_coverage_pct"], "excluded_missing_cost_items": [...], ... }`.
15. **قالب PDF:** گزارش سود ناخالص همراه با کادر شفاف «پوشش داده هزینه و کالاهای مستثنی‌شده».
16. **قالب Excel:** فایل ۴ شیته + شیت/جدول مجزا برای کالاهای بدون قیمت خرید.
17. **شواهد:** ردیف فاکتورهای فروش و حرکات خرید مبدأ بها.
18. **تست دقت:** فروش کل `100M` که `20M` آن فاقد بهای خرید و `80M` آن دارای بهای `60M` است ← سود ناخالص محاسبه‌شده `20M` (`25.00%` روی فروش پوشش‌داده‌شده)، `cost_coverage_pct = 80.00%` (نه سود غلط `40M`!).
19. **معیارهای پذیرش:** `AT-PRF-GM-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۴۷. `PRF-NET-001` — محاسبه حاشیه سود واقعی پس از تخفیف و اشانتیون (`P1`)
1. **شناسه:** `PRF-NET-001` | **۲. هدف:** محاسبه حاشیه سود واقعی با کسر بهای تمام‌شده کالاهای اشانتیون، تخفیف‌های پای فاکتور، برگشتی‌ها و کرایه حمل تحمیلی فروش. | **۳. کاربرد:** جلوگیری از خطای تصمیم‌گیری در کمپین‌های فروش اشانتیون‌دار پخش. | **۴. مجوز:** `report:view_cost_profit`. | **۵. پیش‌نیاز:** خروجی `PRF-GM-001` + `invoice_adjustments`. | **۶. جداول:** `invoices`, `invoice_lines`, `invoice_adjustments`, `inventory_movements`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `branch_id`. | **۸. پارامتر:** شمول کرایه حمل فروشنده. | **۹. اعتبارسنجی:** بررسی کالاهای `is_promotional_free_item = true`. | **۱۰. فرمول:** $\text{TrueMargin} = \text{NetSales} - (\text{COGS}_{\text{paid}} + \text{PromoFreeGoodsCost} + \text{UnrecoveredFreight})$. | **۱۱. الگوریتم:** محاسبه سود ناخالص ← کسر هزینه بهای اشانتیون و تخفیف‌های پای فاکتور سرشکن‌نشده. | **۱۲. خطا:** `VALUATION_POLICY_UNSET`. | **۱۳. هشدار:** `PARTIAL_COST_DATA_COVERAGE`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** مقایسه سود ناخالص ظاهری در برابر سود واقعی. | **۱۷. شواهد:** ردیف‌های اشانتیون و تعدیل فاکتور. | **۱۸. تست:** فروش ۱۰ کارتن (سود ظاهر ۱۰M) + ۲ کارتن اشانتیون (به بهای ۶M) ← سود واقعی دقیقاً `4,000,000` ریال. | **۱۹. پذیرش:** `AT-PRF-NET-01`. | **۲۰. نسخه:** `1.0.0`.

## ۴۸. `PRF-SEG-001` — تحلیل سودآوری مشتری، شعبه و ویزیتور (`P2`)
1. **شناسه:** `PRF-SEG-001` | **۲. هدف:** رتبه‌بندی مشتریان، شعب و ویزیتورها بر مبنای سود واقعی تولیدشده (نه فقط رقم فروش). | **۳. کاربرد:** شناسایی مشتریان پرفروش با تخفیف بالا و حاشیه سود نزدیک صفر. | **۴. مجوز:** `report:view_cost_profit`. | **۵. پیش‌نیاز:** `PRF-NET-001`. | **۶. جداول:** `invoices`, `invoice_lines`, `contacts`, `branches`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `segment_by`. | **۸. پارامتر:** `top_n`. | **۹. اعتبارسنجی:** شفافیت `cost_coverage_pct` در سطح هر مشتری. | **۱۰. فرمول:** تجمیع `TrueMargin` به ازای هر `contact_id`/`branch_id`. | **۱۱. الگوریتم:** گروه‌بندی فروش خالص و هزینه‌های مرتبط به ازای هر بعد. | **۱۲. خطا:** `VALUATION_POLICY_UNSET`. | **۱۳. هشدار:** `LOW_COST_COVERAGE_SEGMENT`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** رتبه‌بندی سودآوری ابعاد. | **۱۷. شواهد:** فاکتورهای هر بعد. | **۱۸. تست:** هم‌سنجی جمع سود شعب با سود کل سازمان. | **۱۹. پذیرش:** `AT-PRF-SEG-01`. | **۲۰. نسخه:** `1.0.0`.

## ۴۹. `PRF-LOSS-001` — شناسایی فروش‌های زیان‌ده و حاشیه بحرانی (`P1`)
1. **شناسه:** `PRF-LOSS-001` | **۲. هدف:** شناسایی فوری ردیف‌ها و فاکتورهایی که قیمت فروش خالص آن‌ها کمتر از بهای تمام‌شده یا زیر آستانه حاشیه سود تعریف‌شده است. | **۳. کاربرد:** جلوگیری از اشتباه تایپی فی فروش یا تخفیف مضاعف زیان‌ده. | **۴. مجوز:** `report:view_cost_profit`. | **۵. پیش‌نیاز:** `PRF-GM-001`. | **۶. جداول:** `invoices`, `invoice_lines`, `inventory_movements`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `min_margin_pct` (پیش‌فرض `0%`). | **۸. پارامتر:** آستانه حاشیه بحرانی. | **۹. اعتبارسنجی:** نادیده‌گرفتن ردیف اشانتیون مجزا در سطح سطر (ارزیابی در سطح کل فاکتور). | **۱۰. فرمول:** $\text{InvoiceMargin} < \text{min\_margin\_pct}$. | **۱۱. الگوریتم:** اسکن فاکتورهای دارای ۱۰۰٪ پوشش هزینه و استخراج فاکتورهای با سود منفی یا زیر آستانه. | **۱۲. خطا:** `VALUATION_POLICY_UNSET`. | **۱۳. هشدار:** `NEGATIVE_MARGIN_INVOICES_FOUND`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** لیست فاکتورهای زیان‌ده. | **۱۷. شواهد:** فاکتور و بهای خرید مبنا. | **۱۸. تست:** فاکتور با فروش `10M` و بهای `11M` ← زیان `-1M` (`-10%`) در خروجی لیست شود. | **۱۹. پذیرش:** `AT-PRF-LOSS-01`. | **۲۰. نسخه:** `1.0.0`.

---

# دسته H: گزارش‌های مدیریتی (`RPT-*`)

## ۵۰. `RPT-DASH-001` — داشبورد وضعیت مالی روزانه مدیران (`P0`)
1. **شناسه یکتای سرویس:** `RPT-DASH-001` (`P0`)
2. **هدف سرویس:** تجمیع سریع شاخص‌های کلیدی کسب‌وکار (فروش جاری، دریافت/پرداخت، مانده بانک و صندوق، مطالبات معوق و چک‌های پیش‌رو) با فیلتر خودکار بر پایه نقش و شعبه کاربر.
3. **سناریوی کاربرد:** مدیرعامل صبح وارد Erpkian می‌شود و وضعیت امروز، ۷ روز گذشته و ماه جاری را در یک صفحه می‌بیند.
4. **نقش‌های مجاز:** تمام نقش‌های دارای مجوز گزارش متناظر (`OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `SALES_MANAGER` محدود، `INVENTORY_MANAGER` محدود، `PERSONAL_USER`).
5. **پیش‌نیازهای داده‌ای:** شناسه سازمان و عضویت فعال.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `invoices`, `payments`, `checks`, `bank_transactions`, `inventory_movements`, `report_data_snapshots`, `assistant_recommendations`.
7. **فیلدهای ورودی:** `as_of_jalali`, `branch_id`, `display_currency`.
8. **پارامترهای قابل تنظیم:** ویجت‌های مجاز هر نقش.
9. **قوانین اعتبارسنجی:** اعمال سختگیرانه RBAC روی هر ویجت (مخفی‌سازی کامل کارت‌های نقدینگی و سود برای `SALES_MANAGER` و `INVENTORY_MANAGER`) و فیلتر `branch_scope_id`.
10. **فرمول‌های محاسباتی:** فراخوانی خروجی‌های یکسان با `SLS-RPT-001`, `FIN-AR-AGING-001`, `TRS-CHK-ALERT-001`, `TRS-CF-ACTUAL-001`.
11. **الگوریتم اجرا:** چک مجوز تک‌تک ویجت‌ها ← اجرای همزمان کوئری‌های کش‌شده/قطعی روی داده‌های `Posted` ← شمارش اسناد `Needs Review` ← نمایش برچسب اعتماد و هشدار کنار هر کارت.
12. **شرایط خطا:** `FORBIDDEN_BRANCH_SCOPE`.
13. **هشدارهای احتمالی:** `PENDING_DOCS_AFFECT_METRICS`, `UNRECONCILED_BANK_ITEMS`.
14. **ساختار خروجی JSON:** `{ "role_filtered_cards": {...}, "pending_action_counts": {"needs_review_docs": 2, "pending_approvals": 1}, "warnings": [...] }`.
15. **قالب PDF:** خلاصه یک‌صفحه‌ای وضعیت روزانه مدیران.
16. **قالب Excel:** ندارد (از `RPT-MONTHLY-001` استفاده می‌شود).
17. **شواهد:** هر کارت داشبورد لینک Drill-down به گزارش تفصیلی و `report_evidences` دارد.
18. **تست دقت:** عدد فروش ماه روی داشبورد باید دقیقاً با خروجی `SLS-RPT-001` همان لحظه برابر باشد.
19. **معیارهای پذیرش:** `AT-RPT-DASH-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

## ۵۱. `RPT-MONTHLY-001` — گزارش جامع خلاصه وضعیت ماهانه مدیریت (`P1`)
1. **شناسه:** `RPT-MONTHLY-001` | **۲. هدف:** تهیه بسته وضعیت ماه شمسی شامل فروش، خرید، سود ناخالص، مانده مطالبات و بدهی، جریان نقد و وضعیت انبار. | **۳. کاربرد:** جلسه هیئت‌مدیره پایان ماه. | **۴. مجوز:** `OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`. | **۵. پیش‌نیاز:** سال و دوره مالی مشخص. | **۶. جداول:** تجمیع `report_*` از تمام ماژول‌ها. | **۷. ورودی:** `fiscal_period_id`, `display_currency`. | **۸. پارامتر:** گنجاندن مقایسه با ماه قبل. | **۹. اعتبارسنجی:** قفل Snapshot کل ماه تا مقایسه بعدی با نسخه ۲ ممکن باشد. | **۱۰. فرمول:** ترکیب فرمول‌های استاندارد P0. | **۱۱. الگوریتم:** ایجاد Snapshot واحد روی `fiscal_period_id` ← اجرای همزمان سرویس‌های پایه ← ذخیره نسخه گزارش تجمیعی. | **۱۲. خطا:** `FISCAL_PERIOD_NOT_FOUND`. | **۱۳. هشدار:** لیست جامع اسناد معلق، مغایرت‌های باز و پوشش بهای تمام‌شده. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** بسته گزارش ماهانه جامع. | **۱۷. شواهد:** لینک به گزارش‌های زیرمجموعه و اسناد. | **۱۸. تست:** تغییر نیافتن `v1` گزارش ماهانه پس از ثبت فاکتور جدید در فردای همان روز (نسخه `v2` تولید شود). | **۱۹. پذیرش:** `AT-RPT-MTH-01`. | **۲۰. نسخه:** `1.0.0`.

## ۵۲. `RPT-PNL-001` — گزارش سود و زیان عملیاتی `Sub-ledger` (`P1`)
1. **شناسه:** `RPT-PNL-001` | **۲. هدف:** تهیه صورت سود و زیان عملیاتی بر پایه فروش خالص، بهای تمام‌شده کالای فروش‌رفته، هزینه‌های ثبت‌شده و تعدیلات مالی، با تصریح محدودیت نبود دفترکل جامع در v1. | **۳. کاربرد:** «این ماه کسب‌وکار ما سود عملیاتی داشته یا زیان؟». | **۴. مجوز:** `report:view_cost_profit`. | **۵. پیش‌نیاز:** سیاست موجودی مشخص + فروش و خرید دوره. | **۶. جداول:** `invoices`, `invoice_adjustments`, `payments` (هزینه‌های مستقیم دسته‌بندی‌شده), `financial_adjustments`, `inventory_movements`, `report_*`. | **۷. ورودی:** `from_jalali`, `to_jalali`, `branch_id`. | **۸. پارامتر:** نحوه برخورد با هزینه‌های غیرکالایی ثبت‌شده. | **۹. اعتبارسنجی:** درج الزام برچسب «سود و زیان عملیاتی Sub-ledger (فاقد استهلاک/ترازنامه رسمی)». | **۱۰. فرمول:** $\text{OperatingProfit} = \text{NetSales} - \text{COGS} - \text{PromoCost} - \text{RecordedOperatingExpenses}$. | **۱۱. الگوریتم:** محاسبه فروش و COGS ← کسر هزینه‌های ثبت‌شده ← ثبت باکس محدودیت‌ها (`Sub-ledger Scope`). | **۱۲. خطا:** `VALUATION_POLICY_UNSET`. | **۱۳. هشدار:** `SUBLEDGER_PNL_LIMITATION`, `PARTIAL_COST_DATA_COVERAGE`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** صورت سود و زیان عملیاتی چندسطحی. | **۱۷. شواهد:** تمام اسناد درآمد و هزینه دوره. | **۱۸. تست:** فروش `200M` - COGS `140M` - کرایه و هزینه ثبت‌شده `20M` = سود عملیاتی `40M`. | **۱۹. پذیرش:** `AT-RPT-PNL-01`. | **۲۰. نسخه:** `1.0.0`.

## ۵۳. `RPT-DIFF-001` — مقایسه دوره‌ای و مقایسه نسخه‌های گزارش (`P1`)
1. **شناسه:** `RPT-DIFF-001` | **۲. هدف:** مقایسه دقیق عدد به عدد بین دو نسخه (`v1` در برابر `v2`) یک گزارش یا دو دوره زمانی و فهرست‌کردن دقیق اسنادی که باعث تغییر اعداد شده‌اند. | **۳. کاربرد:** «چرا فروش یا سود آبان دیروز ۳۰۰ میلیون بود ولی امروز ۳۴۰ میلیون شد؟». | **۴. مجوز:** مجوز مشاهده گزارش هدف. | **۵. پیش‌نیاز:** حداقل دو `report_versions` یا دو `report_executions`. | **۶. جداول:** `report_versions`, `report_metrics`, `report_evidences`, `report_data_snapshots`. | **۷. ورودی:** `base_report_version_id`, `target_report_version_id`. | **۸. پارامتر:** آستانه تغییر معنی‌دار. | **۹. اعتبارسنجی:** تعلق هر دو نسخه به یک `organization_id` و یک `report_definition_id`. | **۱۰. فرمول:** $\Delta M = M_{v2} - M_{v1}$؛ یافتن اختلاف مجموعه‌ها (`Evidences(v2) \ Evidences(v1)` و برعکس). | **۱۱. الگوریتم:** مقایسه شاخص‌های `report_metrics` ← اجرای Diff روی `report_evidences` برای یافتن دقیق فاکتورها یا پرداخت‌های جدیدی که بین `v1` و `v2` تایید/ابطال شده‌اند. | **۱۲. خطا:** `INCOMPATIBLE_REPORT_VERSIONS`. | **۱۳. هشدار:** `FORMULA_VERSION_CHANGED`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول مغایرت `v1` vs `v2` + لیست اسناد اضافه‌شده/ابطال‌شده. | **۱۷. شواهد:** مقایسه دو `report_data_snapshots`. | **۱۸. تست:** پس از `Posted` کردن ۲ فاکتور `Needs Review` جاافتاده، `RPT-DIFF-001` دقیقاً همان ۲ فاکتور را به عنوان عامل تغییر معرفی کند. | **۱۹. پذیرش:** `AT-RPT-DIF-01`. | **۲۰. نسخه:** `1.0.0`.

## ۵۴. `RPT-EXPORT-001` — تولید بسته خروجی رسمی PDF، Excel، CSV و JSON (`P0`)
1. **شناسه یکتای سرویس:** `RPT-EXPORT-001` (`P0`)
2. **هدف سرویس:** رندر استاندارد، قابل حسابرسی و باکیفیت فارسی RTL فایل‌های خروجی از یک `report_version_id` قفل‌شده و ذخیره در S3.
3. **سناریوی کاربرد:** حسابدار یا مدیرعامل نسخه `Excel 4 شیته` و `PDF رسمی` گزارش سنی مطالبات را برای جلسه هیئت‌مدیره دانلود می‌کند.
4. **نقش‌های مجاز:** `report:export` (مشروط به داشتن مجوز خواندن گزارش مبدأ).
5. **پیش‌نیازهای داده‌ای:** وجود `report_version_id` تکمیل‌شده.
6. **جدول‌های مبدأ و مقصد دیتابیس:** `report_versions`, `report_metrics`, `report_evidences`, `report_data_snapshots`, `report_outputs`, `document_storage_objects`, `document_access_logs`.
7. **فیلدهای ورودی:** `report_version_id`, `output_format` (`PDF` | `EXCEL` | `CSV` | `JSON`).
8. **پارامترهای قابل تنظیم:** زبان/تقویم (`JALALI`)، ارز نمایشی (`IRR`/`IRT`).
9. **قوانین اعتبارسنجی:** انطباق ۱۰۰٪ اعداد رندرشده با `report_metrics`، الزام چاپ کادر هشدار در صورت وجود `processing_warnings`.
10. **فرمول‌های محاسباتی:** در شیت‌های Excel استفاده از فرمول‌های واقعی `SUM` متناظر با داده‌های شیت ۲.
11. **الگوریتم اجرا:** خواندن نسخه گزارش ← ساخت فایل طبق قرارداد `09-output-contracts.md` ← ذخیره در S3 با کلید `<org_id>/reports/...` ← ثبت در `report_outputs` ← صدور Pre-signed URL کوتاه‌عمر (۲ دقیقه) + ثبت در `document_access_logs`.
12. **شرایط خطا:** `REPORT_VERSION_NOT_FOUND`, `EXPORT_RENDER_FAILED`.
13. **هشدارهای احتمالی:** چاپ هشدار `LOW_CONFIDENCE_REPORT` روی جلد PDF.
14. **ساختار خروجی JSON:** `{ "report_output_id", "output_format", "presigned_download_url", "expires_in_seconds": 120, "snapshot_hash" }`.
15. **قالب PDF / ۱۶. Excel:** مطابق دقیق بخش ۲ و ۳ سند `09-output-contracts.md`.
17. **شواهد:** درج `snapshot_hash` در پاورقی PDF و شیت `شواهد` در Excel.
18. **تست دقت:** خروجی Excel و PDF باید عدد دقیق یکسانی با JSON داشته باشند و در CSV با BOM فارسی کاراکترها خوانا باشند.
19. **معیارهای پذیرش:** `AT-RPT-EXP-01..03`.
20. **نسخه الگوریتم:** `1.0.0`

---

# دسته I: مالیات و حسابداری تخصصی (`TAX-*`)

> **تضمین انطباق:** خدمات این بخش به صورت صریح به سه لایه **آماده‌سازی (`TAX-PREP-*`)**، **اعتبارسنجی (`TAX-VAL-*`)** و **ارسال رسمی قفل‌شده (`TAX-SUB-*`)** تفکیک شده‌اند.

### I-1. تحلیل و آماده‌سازی (`Analysis & Preparation`)

## ۵۵. `TAX-PREP-VAT-001` — محاسبه و تحلیل پیش‌نویس ارزش افزوده (`P1`)
1. **شناسه:** `TAX-PREP-VAT-001` | **۲. هدف:** محاسبه پیش‌نویس مالیات ارزش افزوده فروش (بدهکاری) در برابر اعتبار مالیاتی خریدهای معتبر در یک فصل شمسی. | **۳. کاربرد:** برآورد نقدینگی موردنیاز برای تسویه ارزش افزوده پایان فصل. | **۴. مجوز:** `tax:prepare_validate`. | **۵. پیش‌نیاز:** فاکتورهای خرید و فروش `Posted` در فصل. | **۶. جداول:** `invoices`, `invoice_lines`, `contacts`, `contact_identifiers`, `report_*`. | **۷. ورودی:** `fiscal_year_id`, `season` (`SPRING|SUMMER|AUTUMN|WINTER`). | **۸. پارامتر:** نرخ مصوب مالیات (`10%`). | **۹. اعتبارسنجی:** برچسب اجباری «پیش‌نویس تحلیلی غیررسمی»؛ فاکتور خرید فاقد کد اقتصادی معتبر در ستون «اعتبار نیازمند تکمیل مدرک» تفکیک شود. | **۱۰. فرمول:** `CF-TAX` ($\text{NetVATDraft} = \text{OutputVAT} - \text{InputVAT}_{\text{eligible}}$). | **۱۱. الگوریتم:** تجمیع مالیات فروش و برگشت فروش ← تجمیع مالیات خرید دارای مدارک کامل و خرید ناقص به تفکیک ← تولید پیش‌نویس گزارش. | **۱۲. خطا:** `INVALID_SEASON`. | **۱۳. هشدار:** `NON_OFFICIAL_TAX_DRAFT`, `PURCHASES_MISSING_TAX_ID`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** کارپوشه پیش‌نویس ارزش افزوده. | **۱۷. شواهد:** فهرست فاکتورهای مشمول. | **۱۸. تست:** مالیات فروش `50M` - مالیات خرید معتبر `32M` = خالص پیش‌نویس `18M` (خرید `5M` بدون شناسه اقتصادی جداگانه هشدار داده شود). | **۱۹. پذیرش:** `AT-TAX-VAT-01`. | **۲۰. نسخه:** `1.0.0`.

## ۵۶. `TAX-PREP-EXEMPT-001` — تفکیک اقلام مشمول، معاف و نامشخص مالیاتی (`P1`)
1. **شناسه:** `TAX-PREP-EXEMPT-001` | **۲. هدف:** دسته‌بندی ردیف‌های فاکتور به سه گروه «مشمول استاندارد»، «معاف (مالیات صفر)» و «دارای نرخ نامشخص/غیرمعمول». | **۳. کاربرد:** پالایش کالاهای غذایی معاف از اقلام مشمول پیش از تنظیم اظهارنامه. | **۴. مجوز:** `tax:prepare_validate`. | **۵. پیش‌نیاز:** ردیف فاکتورهای `Posted` فصل. | **۶. جداول:** `invoice_lines`, `invoices`, `products`. | **۷. ورودی:** `from_jalali`, `to_jalali`. | **۸. پارامتر:** نرخ استاندارد مورد انتظار (`10%`). | **۹. اعتبارسنجی:** بررسی انطباق `tax_amount_irr / taxable_base`. | **۱۰. فرمول:** $\text{EffectiveRate} = \frac{\text{tax\_amount\_irr}}{\text{line\_gross} - \text{discount}}$. | **۱۱. الگوریتم:** طبقه‌بندی تک‌تک سطرها و فهرست‌کردن سطرهای دارای نرخ غیرمتعارف (نه `0%` و نه `10%`). | **۱۲. خطا:** ندارد. | **۱۳. هشدار:** `ANOMALOUS_TAX_RATE_ROWS`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول تفکیک اقلام مالیاتی. | **۱۷. شواهد:** ردیف فاکتورها. | **۱۸. تست:** ردیف معاف (`0`) و استاندارد (`10%`) و ردیف خطا (`7%`) هر سه دقیق تفکیک شوند. | **۱۹. پذیرش:** `AT-TAX-EXM-01`. | **۲۰. نسخه:** `1.0.0`.

## ۵۷. `TAX-PREP-READY-001` — چک‌لیست آمادگی و نقص مدارک مالیاتی فصل (`P1`)
1. **شناسه:** `TAX-PREP-READY-001` | **۲. هدف:** حسابرسی پیشینی فایل‌ها و اطلاعات طرفین برای کشف موانع قانونی گزارش فصلی و ارزش افزوده. | **۳. کاربرد:** ۲ هفته مانده به پایان فصل حسابدار این سرویس را اجرا می‌کند. | **۴. مجوز:** `tax:prepare_validate`. | **۵. پیش‌نیاز:** داده‌های فصل. | **۶. جداول:** `invoices`, `contacts`, `contact_identifiers`, `contact_addresses`, `documents`. | **۷. ورودی:** `fiscal_year_id`, `season`. | **۸. پارامتر:** چک اجباری کد ملی/اقتصادی/کدپستی. | **۹. اعتبارسنجی:** `VR-ENT-01`. | **۱۰. فرمول:** درصد آمادگی مدارک = $\frac{\text{CompleteInvoicesCount}}{\text{TotalPostedInvoicesCount}} \times 100$. | **۱۱. الگوریتم:** چک تک‌تک فاکتورها از نظر وجود شناسه طرف حساب، کد پستی، سند تصویری پیوست و نبود سند `Needs Review`. | **۱۲. خطا:** ندارد. | **۱۳. هشدار:** `MISSING_COUNTERPARTY_TAX_ID`, `UNPOSTED_DOCS_IN_SEASON`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** چک‌لیست نواقص مالیاتی با دکمه اقدام مستقیم. | **۱۷. شواهد:** فاکتورهای ناقص. | **۱۸. تست:** از ۱۰ فاکتور، ۲ مورد بدون شناسه ملی خریدار ← امتیاز آمادگی `80.00%` و لیست دقیق ۲ مورد. | **۱۹. پذیرش:** `AT-TAX-RDY-01`. | **۲۰. نسخه:** `1.0.0`.

## ۵۸. `TAX-PREP-PAYROLL-001` — آماده‌سازی خلاصه حقوق و بیمه از فایل اکسل (`P2`)
1. **شناسه:** `TAX-PREP-PAYROLL-001` | **۲. هدف:** خواندن، کنترل جمع ردیفی و استانداردسازی فایل اکسل خروجی حقوق و بیمه (چون سیستم محاسبه حقوق و دستمزد در v1 وجود ندارد). | **۳. کاربرد:** ورود خلاصه هزینه حقوق ماهانه به گزارش مدیریت. | **۴. مجوز:** `tax:prepare_validate`, `report:view_cost_profit`. | **۵. پیش‌نیاز:** فایل اکسل لیست حقوق آپلودشده توسط کاربر. | **۶. جداول:** `import_batches`, `import_rows`, `documents`, `report_*`. | **۷. ورودی:** `document_id`, `fiscal_period_id`. | **۸. پارامتر:** نگاشت ستون‌ها (ناخالص، بیمه سهم کارمند/کارفرما، مالیات، خالص پرداختی). | **۹. اعتبارسنجی:** کنترل جمع عمودی و افقی `NetPay = Gross - EmployeeInsurance - PayrollTax - Deductions`. | **۱۰. فرمول:** تراز خط به خط جدول اکسل واردشده. | **۱۱. الگوریتم:** پارس اکسل ← کنترل ریاضی بدون اجرای محاسبه بیمه/مالیات مستقل ← صدور خلاصه قابل درج در هزینه عملیاتی. | **۱۲. خطا:** `PAYROLL_SHEET_MATH_ERROR`. | **۱۳. هشدار:** `EXTERNAL_PAYROLL_IMPORT_ONLY`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** خلاصه هزینه حقوق و کسورات قانونی. | **۱۷. شواهد:** فایل اکسل اصلی در `documents`. | **۱۸. تست:** تشخیص سطر با اختلاف ۱۰,۰۰۰ ریال بین ناخالص منهای کسورات و خالص پرداختی. | **۱۹. پذیرش:** `AT-TAX-PAY-01`. | **۲۰. نسخه:** `1.0.0`.

### I-2. اعتبارسنجی (`Validation`)

## ۵۹. `TAX-VAL-INVOICE-001` — اعتبارسنجی شناسه‌ها و فرمت مالیاتی فاکتور (`P2`)
1. **شناسه:** `TAX-VAL-INVOICE-001` | **۲. هدف:** بررسی فنی فاکتورها از نظر صحت الگوریتمی کد ملی (رقم کنترل)، شناسه ملی ۱۱ رقمی، کد پستی، شناسه کالای مالیاتی (`TAX_ITEM_ID`) و تراز مالیاتی سطرها. | **۳. کاربرد:** پیش‌اعتبارسنجی فایل‌ها پیش از آماده‌سازی صورتحساب الکترونیکی در نرم‌افزار مودیان مشتری. | **۴. مجوز:** `tax:prepare_validate`. | **۵. پیش‌نیاز:** فاکتورها + جدول شناسه‌ها. | **۶. جداول:** `invoices`, `invoice_lines`, `contact_identifiers`, `product_identifiers`. | **۷. ورودی:** `invoice_ids[]` یا بازه تاریخ. | **۸. پارامتر:** سخت‌گیری کد پستی و کد کالا. | **۹. اعتبارسنجی:** `VR-ENT-01`, تراز ریاضی مالیاتی. | **۱۰. فرمول:** الگوریتم استاندارد رقم کنترل کد ملی ایران (`Weighted Sum mod 11`). | **۱۱. الگوریتم:** بررسی کلیه شناسه‌های طرفین و کالاها و صدور گزارش خطای دقیق سطر به سطر. | **۱۲. خطا:** ندارد (خروجی لیست خطاهای انطباق است). | **۱۳. هشدار:** `INVALID_NATIONAL_ID_CHECK_DIGIT`, `MISSING_TAX_ITEM_ID`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** گزارش خطاهای اعتبارسنجی مالیاتی. | **۱۷. شواهد:** `invoices` و `contact_identifiers`. | **۱۸. تست:** کد ملی ساختگی با رقم کنترل غلط `1234567890` رد و کد ملی معتبر از آزمون الگوریتم عبور کند. | **۱۹. پذیرش:** `AT-TAX-VAL-01`. | **۲۰. نسخه:** `1.0.0`.

## ۶۰. `TAX-VAL-SEASONAL-001` — کنترل تراز گزارش معاملات فصلی ۱۶۹ (`P2`)
1. **شناسه:** `TAX-VAL-SEASONAL-001` | **۲. هدف:** تجمیع خرید و فروش فصل به ازای هر طرف حساب، مقایسه با نصاب معاملات کوچک و تطبیق با برگشتی‌ها جهت آماده‌سازی فایل ۱۶۹. | **۳. کاربرد:** رفع مغایرت جمع خرید و فروش با فاکتورهای ثبت‌شده پیش از ارسال در درگاه سازمان امور مالیاتی توسط حسابدار. | **۴. مجوز:** `tax:prepare_validate`. | **۵. پیش‌نیاز:** فاکتورهای `Posted` فصل. | **۶. جداول:** `invoices`, `contacts`, `contact_identifiers`, `report_*`. | **۷. ورودی:** `fiscal_year_id`, `season`, `small_transaction_threshold_irr`. | **۸. پارامتر:** نصاب سالانه معاملات فصلی. | **۹. اعتبارسنجی:** هشدار برای طرف‌حساب‌های بالای نصاب که فاقد شناسه ملی/اقتصادی هستند. | **۱۰. فرمول:** جمع خالص معامله هر طرف حساب = `SUM(Gross - Discount) - SUM(Returns)`. | **۱۱. الگوریتم:** گروه‌بندی بر اساس `contact_id`، تفکیک بالای نصاب از تجمیعی زیر نصاب، و تطبیق جمع کل با `SLS-RPT-001` / `PUR-RPT-001`. | **۱۲. خطا:** `SEASON_INCOMPLETE`. | **۱۳. هشدار:** `ABOVE_THRESHOLD_MISSING_TIN`. | **۱۴. JSON / ۱۵. PDF / ۱۶. Excel:** جدول پیش‌نویس تجمیعی معاملات فصلی ۱۶۹. | **۱۷. شواهد:** فاکتورهای هر طرف حساب. | **۱۸. تست:** تجمیع دقیق خرید/فروش هر کد ملی بدون جاانداختن فاکتور برگشتی. | **۱۹. پذیرش:** `AT-TAX-SEA-01`. | **۲۰. نسخه:** `1.0.0`.

### I-3. ارسال رسمی (`Official Submission — Locked in v1`)

## ۶۱. `TAX-SUB-MOADIAN-001` — ارسال رسمی صورتحساب به سامانه مودیان (`P3 — LOCKED`)
1. **شناسه:** `TAX-SUB-MOADIAN-001` (`P3`) | **۲. هدف:** ارسال رسمی صورتحساب الکترونیکی امضاشده به سامانه مودیان (خارج از محدوده نسخه اول). | **۳. کاربرد:** فاز آتی پس از اخذ مجوز و تنظیم کلید امضای دیجیتال سازمان. | **۴. مجوز:** `OWNER` + `CFO` (نیازمند مجوز جدید `tax:submit_official` در فاز ۳). | **۵. پیش‌نیاز:** گواهی امضای دیجیتال (PKCS#12 / CSR)، شناسه یکتای حافظه مالیاتی سازمان، اتصال تاییدشده API مودیان. | **۶. جداول:** نیازمند جداول آتی `tax_transmission_logs` و کلید KMS (در v1 وجود ندارد). | **۷. ورودی:** `invoice_id` معتبر + تایید دوامضایی. | **۸-۱۰. پارامتر/اعتبارسنجی/فرمول:** امضای JWS/JSON مطابق آخرین مستند فنی RC مودیان. | **۱۱. الگوریتم در v1:** **مسدودسازی سخت (`501 FEATURE_LOCKED_EXTERNAL_CERT_REQUIRED`)** — هیچ ادعای ارسال یا اتصال به مودیان در v1 مجاز نیست. | **۱۲. خطا:** `FEATURE_LOCKED_IN_V1`. | **۱۳-۱۷.** نمایش راهنما به خروجی آماده‌سازی `TAX-VAL-INVOICE-001`. | **۱۸. تست:** فراخوانی API در v1 همیشه وضعیت قفل برگرداند (`AT-TAX-SUB-LOCKED`). | **۱۹. پذیرش:** `AT-TAX-SUB-LOCKED`. | **۲۰. نسخه:** `0.0.0-locked`.

## ۶۲. `TAX-SUB-RETURN-001` — ارسال رسمی اظهارنامه و گزارش فصلی (`P3 — LOCKED`)
1. **شناسه:** `TAX-SUB-RETURN-001` (`P3`) | **۲. هدف:** ثبت و ارسال نهایی اظهارنامه مالیاتی یا گزارش فصلی در درگاه قانونی (اکیداً خارج از محدوده نسخه اول). | **۳-۱۰.** نیازمند احراز هویت حقوقی درگاه دولتی و امضای قانونی حسابدار/مدیرعامل. | **۱۱. الگوریتم در v1:** **مسدودسازی سخت (`501 FEATURE_LOCKED_IN_V1`)**. | **۱۲. خطا:** `FEATURE_LOCKED_IN_V1`. | **۱۳-۱۷.** راهنمایی کاربر به دریافت خروجی کارپوشه پیش‌نویس `TAX-PREP-VAT-001` و `TAX-VAL-SEASONAL-001`. | **۱۸-۱۹. تست/پذیرش:** `AT-TAX-SUB-LOCKED` (عدم شبیه‌سازی ارسال جعلی). | **۲۰. نسخه:** `0.0.0-locked`.
