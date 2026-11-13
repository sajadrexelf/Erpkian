# 12 — داده‌های ساختگی و سناریوهای اعتبارسنجی مدل (`Seed Data & Model Scenarios`)

در این سند تمام **۱۸ سناریوی بخش ۱۳** با داده‌های کاملاً ساختگی (اما واقع‌گرایانه برای بازار پخش ایران) مدلسازی شده و نشان داده می‌شود در هر سناریو دقیقاً چه رکوردهایی در کدام جداول ایجاد یا به‌روزرسانی می‌شوند.

---

## شناسه سازمان‌های پایه نمونه (`Synthetic Tenants`)
* **سازمان الف (`Org-A`):** «پخش مواد غذایی آریا گستر» (`business_type: distribution_wholesale`, ارز پایه: `IRR`, نمایش پیش‌فرض: `IRT` تومان) — `org_a_id = 0193a000-...-0001`
* **سازمان ب (`Org-B`):** «فروشگاه زنجیره‌ای افق» (`business_type: retail`) — `org_b_id = 0193b000-...-0002`

---

## مدلسازی سناریوهای ۱۸گانه

### سناریو ۱: شرکت پخش با دو شعبه
* **رکوردها:**
  * `organizations`: ۱ رکورد (`Org-A`)
  * `branches`: ۲ رکورد متصل به `Org-A`: `شعبه مرکزی تهران` (`code: THR-HQ`, `is_headquarters: true`) و `شعبه اصفهان` (`code: ESF-01`, `is_headquarters: false`).
  * `warehouses`: ۲ انبار (`انبار مرکزی تهران` متصل به `THR-HQ`، `انبار اصفهان` متصل به `ESF-01`).

### سناریو ۲: یک حسابدار عضو دو سازمان با نقش متفاوت
* **رکوردها:**
  * `users`: ۱ رکورد واحد برای «خانم مریم رضایی» (`user_id = u_maryam`).
  * `organization_memberships`: ۲ رکورد:
    1. `mem_a`: `(organization_id = Org-A, user_id = u_maryam)` ← در `membership_roles` دارای نقش **`Accountant` (حسابدار)** بدون مجوز `doc:post` بالای سقف.
    2. `mem_b`: `(organization_id = Org-B, user_id = u_maryam)` ← در `membership_roles` دارای نقش **`Financial_Manager` (مدیر مالی)** با مجوز کامل تایید نهایی و قفل دوره.

### سناریو ۳: فاکتور خرید با چند ردیف کالا
* **رکوردها:**
  * `contacts`: «تولیدی روغن بهار» (`is_supplier = true`).
  * `documents`: فاکتور کاغذی اسکن‌شده (`lifecycle_status = 'Posted'`).
  * `invoices`: `invoice_direction = 'PURCHASE'`, `invoice_number = 'P-8841'`, `issue_jalali = '1405/08/10'`, `subtotal_irr = 500,000,000`, `tax_total_irr = 50,000,000`, `net_total_irr = 550,000,000`, `primary_document_id = doc_id`.
  * `invoice_lines`: ۳ ردیف متصل به `(Org-A, invoice_id)` برای ۳ کالای مختلف با `line_number = 1, 2, 3`.
  * `inventory_movements`: ۳ رکورد `PURCHASE_IN` متناظر با `source_record_type = 'INVOICE'`.

### سناریو ۴: خرید کالا در کارتن و فروش آن در عدد
* **رکوردها:**
  * `products`: «رب گوجه‌فرنگی ۸۰۰ گرمی»، `base_uom_id = uom_piece` («عدد»).
  * `product_units`: `uom_id = uom_carton` («کارتن»), `conversion_to_base = 12.000000`.
  * **خرید:** در `invoice_lines` (خرید): `uom_id = uom_carton`, `quantity = 10`, `base_quantity = 120`. در `inventory_movements`: `movement_type = 'PURCHASE_IN'`, `source_qty = 10`, `base_qty_signed = +120`.
  * **فروش:** در `invoice_lines` (فروش): `uom_id = uom_piece`, `quantity = 30`, `base_quantity = 30`. در `inventory_movements`: `movement_type = 'SALE_OUT'`, `source_qty = 30`, `base_qty_signed = -30`.
  * **بازسازی موجودی:** `SUM(base_qty_signed) = +90 عدد` ← نمایش ترکیبی `۷ کارتن و ۶ عدد`.

### سناریو ۵: یک دریافت که بین سه فاکتور تخصیص یافته است (`1 Payment -> 3 Invoices`)
* **رکوردها:**
  * `invoices` (فروش به سوپرمارکت پارسیان): `Inv-1` (`40,000,000 IRR`)، `Inv-2` (`30,000,000 IRR`)، `Inv-3` (`50,000,000 IRR`).
  * `payments`: `Pay-101` (`payment_direction = 'RECEIPT_IN'`, `amount_irr = 90,000,000`).
  * `payment_allocations`: ۳ رکورد:
    1. `(Pay-101, Inv-1, allocated_amount_irr = 40,000,000, method = 'FIFO_AUTO')` ← `Inv-1` کاملاً تسویه.
    2. `(Pay-101, Inv-2, allocated_amount_irr = 30,000,000, method = 'FIFO_AUTO')` ← `Inv-2` کاملاً تسویه.
    3. `(Pay-101, Inv-3, allocated_amount_irr = 20,000,000, method = 'FIFO_AUTO')` ← مانده باز `Inv-3 = 30,000,000 IRR`.

### سناریو ۶: یک فاکتور که با چند پرداخت تسویه می‌شود (`1 Invoice -> N Payments`)
* **رکوردها:**
  * `invoices`: `Inv-205` (`net_total_irr = 100,000,000`).
  * `payments`: `Pay-201` (نقدی `35,000,000`) و `Pay-202` (حواله بانکی ۲ هفته بعد `65,000,000`).
  * `payment_allocations`: ۲ رکورد متصل به `Inv-205` که مجموع `allocated_amount_irr` برابر `100,000,000` می‌شود (`مانده = 0`).

### سناریو ۷: چک دریافتی از «در جریان» به «وصول‌شده»
* **رکوردها:**
  * `payments`: `Pay-301` (`payment_method = 'CHEQUE'`, `amount_irr = 150,000,000`).
  * `checks`: `Chk-01` (`check_direction = 'RECEIVABLE'`, `sayad_id = '9812...'`, `due_jalali = '1405/09/15'`, `current_status = 'IN_HAND'` ← پس از وصول: `'CLEARED'`, `linked_payment_id = Pay-301`).
  * `bank_transactions`: ردیف واریز `150,000,000` در تاریخ `1405/09/15`.
  * `check_status_history`: دو رکورد متوالی: (۱) `NULL -> IN_HAND` در تاریخ دریافت، (۲) `IN_HAND -> CLEARED` متصل به `bank_transaction_id`. *(تا پیش از وصول، موتور AR بدهی فاکتور را با عنوان Covered by Unmatured Cheque تفکیک می‌کند).*

### سناریو ۸: تراکنش بانکی بدون سند متناظر
* **رکوردها:**
  * `bank_transactions`: مبلغ `+25,000,000 IRR`, `counterparty_raw = 'واریز نامشخص شبا'`, `reconciliation_status = 'UNMATCHED'`.
  * `reconciliation_exceptions`: پس از اجرای `reconciliation_runs`، یک رکورد `exception_type = 'MISSING_BOOK_RECORD'`, `resolution_status = 'OPEN'` ایجاد می‌شود تا کاربر برای آن رسید دریافت ثبت یا آن را به طرف‌حساب متصل کند.

### سناریو ۹: سند چندصفحه‌ای با چند بار اجرای OCR
* **رکوردها:**
  * `documents`: `Doc-401` (`lifecycle_status = 'Needs Review'`).
  * `document_versions`: `v1` (`MERGED_PDF`, `page_count = 3`).
  * `document_pages`: ۳ رکورد (`page_number = 1, 2, 3`).
  * `extraction_jobs`: `Job-1` و `Job-2` (یا ۲ `extraction_attempts` روی یک Job: `attempt_number = 1` با `model_v1` و کیفیت ضعیف، `attempt_number = 2` با `model_v2` پس از بهبود تصویر). خروجی هر دو در `ocr_page_results` و `extracted_fields` حفظ می‌شوند.

### سناریو ۱۰: خطای OCR در فاکتور و اصلاح توسط حسابدار
* **رکوردها:**
  * `extracted_fields`: فیلد `total_amount` با `raw_value = "12,000,000"`, `normalized_value = "12000000"`, `confidence = 0.62`, `review_status = 'EDITED'`.
  * `extraction_reviews`: `review_outcome = 'APPROVED'` توسط `mem_a`.
  * `extraction_corrections`: `field_key = 'total_amount'`, `value_before = '12000000'`, `value_after = '120000000'` (یک صفر جاافتاده توسط OCR)، `correction_reason = 'تطبیق چشمی با تصویر فاکتور'`.
  * `invoices`: رکورد نهایی `Posted` با مبلغ صحیح `120,000,000` و ارجاع به `Doc-401`.

### سناریو ۱۱: دو رکورد مشابه مشتری نیازمند تطبیق
* **رکوردها:**
  * `contacts`: مشتری ثبت‌شده قبلی «فروشگاه زنجیره‌ای پارسیان» (`id = c_1`).
  * `entity_match_candidates`: هنگام ورود فاکتور با نام «هایپر پارسیان»، رکورد `source_raw_name = 'هایپر پارسیان'`, `candidate_entity_id = c_1`, `match_score = 0.8400`, `review_status = 'PENDING'` ثبت می‌شود.
  * پس از تایید حسابدار: `review_status = 'CONFIRMED_MATCH'`؛ و اگر اشتباهاً دو `contact` جدا ساخته شده بودند و ادغام شوند، رکورد قدیمی `status = 'MERGED'`, `merged_into_contact_id = c_1` و یک ردیف در `entity_merge_history` ثبت می‌شود.

### سناریو ۱۲: ورود فایل از نرم‌افزار حسابداری با شناسه خارجی
* **رکوردها:**
  * `source_systems`: `code = 'SEPIDAR'`.
  * `integration_connections`: اتصال `Org-A` به سپیدار (`transport_mode = 'FILE_TEMPLATE'`).
  * `import_batches` و `import_rows`: ردیف اکسل فاکتور با `source_external_id = 'SEP-INV-9941'`.
  * `external_entity_mappings`: `(entity_domain = 'INVOICE', external_id = 'SEP-INV-9941', internal_entity_id = inv_id, mapping_status = 'CONFIRMED')`.

### سناریو ۱۳: مغایرت موجودی بین فایل انبار و داده داخلی
* **رکوردها:**
  * `stock_snapshots`: گزارش اکسل انبار برای کالای «شکر ۱ کیلویی» عدد `500` را نشان می‌دهد، در حالی که جمع `inventory_movements` داخلی `485` است.
  * `reconciliation_runs` (`reconciliation_domain = 'INVENTORY'`) ← ایجاد `reconciliation_exceptions` با `exception_type = 'STOCK_VARIANCE'`, `variance_qty = 15`, `resolution_status = 'OPEN'`.

### سناریو ۱۴: گزارش مالی نسخه‌بندی‌شده با Snapshot ثابت
* **رکوردها:**
  * `report_data_snapshots`: `Snap-1` در `1405/08/22 10:00` با `included_document_count = 40`, `snapshot_hash = 'abc...'`.
  * `report_executions` → `report_versions (v1, is_latest = true)` → `report_metrics (total_overdue_ar_irr = 450,000,000)` → `report_evidences` (۴ فاکتور منبع).
  * اگر ساعت `14:00` فاکتور شماره ۴۱ `Posted` شود، `v1` تغییر نمی‌کند؛ اجرای مجدد `Snap-2` و `report_versions (v2, supersedes = v1)` می‌سازد.

### سناریو ۱۵: تلاش کاربر سازمان A برای خواندن اطلاعات سازمان B
* **رکوردها و رفتار:**
  * کاربر `Org-A` درخواست `GET /api/invoices/<id_in_Org_B>` می‌دهد.
  * `RLS Policy` با `app.current_organization_id = Org-A` اجازه مشاهده صفر ردیف می‌دهد ← پاسخ `404/403` + ثبت `security_events (event_type = 'CROSS_TENANT_ATTEMPT', severity = 'HIGH')`.

### سناریو ۱۶: بستن دوره مالی و تلاش برای اصلاح در دوره بسته
* **رکوردها:**
  * `fiscal_periods`: دوره «مهر ۱۴۰۵» (`status = 'CLOSED'`).
  * `period_locks`: رکورد `lock_action = 'LOCK'`, `actor = mem_cfo`.
  * تلاش ثبت فاکتور با `issue_jalali = '1405/07/15'` ← سرویس/Constraint دوره بسته را تشخیص داده و عملیات را رد می‌کند (مگر اینکه کاربر دارای مجوز دوره را طی `period_locks (REOPEN)` باز کند).

### سناریو ۱۷: ابطال یک عملیات مالی و ثبت رویداد اصلاحی
* **رکوردها:**
  * فاکتور فروش `Inv-50` (`Posted`, مبلغ `20,000,000`) اشتباه ثبت شده است.
  * تغییر وضعیت `Inv-50` ← `Reversed`؛ ثبت `Inv-50-REV` (`invoice_direction = 'SALE_RETURN'` یا رکورد معکوس متصل به `reversed_invoice_id = Inv-50`)؛ ثبت `inventory_movements` معکوس (`RETURN_IN`)؛ تغییر `payment_allocations` مرتبط به `REVERSED`؛ ثبت کامل در `audit_logs`.

### سناریو ۱۸: اجرای دوباره یک Import Batch بدون ایجاد رکوردهای تکراری
* **رکوردها:**
  * همان فایل اکسل مجدداً ارسال می‌شود.
  * کنترل سطح ۱: `import_batches.idempotency_key` یا `document_storage_objects.sha256_hash` فایل تکراری را شناسایی می‌کند.
  * کنترل سطح ۲: در صورت تغییر جزئی فایل و ارسال مجدد ۹۹ سطر تکراری + ۱ سطر جدید، ۹۹ سطر بر اساس `external_entity_mappings (external_id)` و `import_rows.row_hash` به وضعیت `DUPLICATE_SKIPPED` می‌روند و فقط ۱ سطر جدید وارد می‌شود (`records_skipped_duplicate = 99`, `records_imported = 1`).
