# 07 — طراحی فیزیکی PostgreSQL (`PostgreSQL Physical Design`)

این سند استانداردهای فیزیکی پیاده‌سازی مدل داده `Erpkian` روی `PostgreSQL 16+` را تعیین می‌کند تا صحت مالی، جداسازی چندسازمانی و کارایی کوئری‌ها در مقیاس بالا تضمین شوند.

---

## ۱. قرارداد نام‌گذاری (`Naming Conventions`)
* **جداول و ستون‌ها:** تماماً `snake_case` و جمع برای جداول (مانند `invoices`, `payment_allocations`).
* **کلید اصلی:** `id` از نوع `UUID`؛ برای جداول Tenant-owned، کلید اصلی یا حداقل یک کلید یکتای مرکب به شکل `(organization_id, id)` تعریف می‌شود تا کلیدهای خارجی مرکب به آن ارجاع دهند.
* **کلیدهای خارجی:** `<singular_entity>_id` (مانند `contact_id`, `fiscal_period_id`).
* **ایندکس‌ها و محدودیت‌ها:** `pk_<table>`, `uq_<table>_<cols>`, `fk_<table>_<ref>`, `ck_<table>_<rule>`, `idx_<table>_<cols>`.
* **ستون‌های مالی کاننیکال:** پسوند `_irr` برای مبالغ ریالی مبنا (مانند `net_total_irr`, `amount_irr`).
* **ستون‌های تاریخ:** `<event>_at` (`TIMESTAMPTZ`) یا `<event>_date` (`DATE`) + `<event>_jalali` (`CHAR(10)`).

---

## ۲. استراتژی کلید اصلی (`Primary Key Strategy`)
* **انتخاب استاندارد:** `UUID` نسخه **۷ (`UUIDv7`)** در لایه اپلیکیشن یا اکستنشن PostgreSQL (و در صورت نبود در نسخه Postgres، `gen_random_uuid()` به عنوان Fallback در `DEFAULT`).
* **دلیل فنی:** `UUID` برای سیستم چندسازمانی و همگام‌سازی آفلاین/Agent ویندوز از حدس‌پذیری (`ID Enumeration`) جلوگیری می‌کند؛ و نسخه `UUIDv7` به دلیل مرتب‌بودن زمانی (`Time-ordered`) مانع تکه‌تکه‌شدن (`B-Tree Page Fragmentation`) ایندکس‌های بزرگ در جداول پرتراکنی مانند `inventory_movements`, `audit_logs` و `invoice_lines` می‌شود.

---

## ۳. استراتژی کلیدهای خارجی مرکب برای جلوگیری از نشت میان‌سازمانی (`Composite Tenant-Safe Foreign Keys`)
افزودن صرف `organization_id` به جداول کافی نیست؛ اگر جدولی فقط به `contact_id` ارجاع دهد، یک باگ در Backend می‌تواند `invoice` سازمان `A` را به `contact` سازمان `B` متصل کند.

**راه‌حل سخت‌افزاری دیتابیس:**
1. هر جدول Tenant-owned علاوه بر `PRIMARY KEY (id)` دارای `UNIQUE (organization_id, id)` است (یا مستقیم `PRIMARY KEY (organization_id, id)` دارد).
2. هر رابطه بین دو جدول Tenant-owned از **کلید خارجی مرکب** استفاده می‌کند:
   ```sql
   -- نمونه Draft غیرقابل اجرا: جلوگیری فیزیکی از اتصال فاکتور سازمان A به مشتری سازمان B
   ALTER TABLE invoices
     ADD CONSTRAINT fk_invoices_contact_same_org
     FOREIGN KEY (organization_id, contact_id)
     REFERENCES contacts (organization_id, id)
     ON DELETE RESTRICT
     ON UPDATE RESTRICT;
   ```
3. **رفتار `ON DELETE` و `ON UPDATE`:**
   * برای جداول مالی، اسنادی، طرف حساب و کالا: همیشه **`ON DELETE RESTRICT`** و **`ON UPDATE RESTRICT`** (هیچ سند یا مشتری دارای فاکتور قابل حذف فیزیکی نیست).
   * برای جداول جزییات وابسته غیرمستقل پیش از تایید (مانند `role_permissions` یا پیش‌نویس `extracted_table_cells` در تست): `ON DELETE CASCADE` تنها برای جداول غیرمالی/موقت مجاز است؛ در جداول مالی و اسناد رسمی حتی `CASCADE` هم ممنوع است.

---

## ۴. ماتریس روابط کلیدی (`Relationship Cardinality & Referential Actions`)

| جدول والد | جدول فرزند | نوع رابطه | اختیاری/الزامی | `ON DELETE` | `ON UPDATE` | مالکیت Tenant |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `organizations` | `branches` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned |
| `users` | `organization_memberships` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Hybrid (`user` جهانی، `membership` سازمانی) |
| `organizations` | `fiscal_years` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned |
| `fiscal_years` | `fiscal_periods` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `contacts` | `contact_identifiers` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `products` | `product_units` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `documents` | `document_versions` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `document_versions` | `document_pages` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `documents` ↔ `invoices/payments/...` | `document_relations` | `M:N` | Optional | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `extraction_jobs` | `extraction_attempts` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `invoices` | `invoice_lines` | `1:N` | Required (≥1 برای تایید) | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `payments` ↔ `invoices` | `payment_allocations` | `M:N` | Optional/Required هنگام تسویه | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `checks` | `check_status_history` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `bank_accounts` | `bank_transactions` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `report_executions` | `report_versions` | `1:N` | Required | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `report_versions` | `report_evidences` | `1:N` | Required برای ارقام مالی | `RESTRICT` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |
| `conversations` | `conversation_contexts` | `1:1` | Required | `CASCADE` | `RESTRICT` | Tenant-Owned (`org_id` مرکب) |

---

## ۵. مدیریت دقیق مبالغ مالی (`Monetary Precision`)
* **منع مطلق `REAL` / `DOUBLE PRECISION`:** در تمام مدل داده استفاده نمی‌شوند.
* **مبالغ ریال پایه (`IRR`):** نوع **`NUMERIC(18, 0)`** (تا سقف ۹۹۹ تریلیون ریال، بدون خطای گردکردن، سازگار با اعداد صحیح ریال ایران).
* **مبالغ ارزی یا نرخ تبدیل و قیمت واحد حساس:** نوع **`NUMERIC(20, 4)`** برای `unit_price_irr` (در اقلام کم‌بهای پرشمار مثل کالاهای خرد) و **`NUMERIC(20, 8)`** برای `exchange_rates.rate` و `conversion_to_base` (`NUMERIC(18, 6)`).
* **محدودیت‌های `CHECK` نمونه:**
  * `CHECK (quantity > 0)` در `invoice_lines` (مقادیر برگشتی از طریق `invoice_direction = 'SALE_RETURN' | 'PURCHASE_RETURN'` ثبت می‌شوند، نه تعداد منفی بی‌ضابطه).
  * `CHECK (unit_price_irr >= 0 AND discount_amount_irr >= 0 AND tax_amount_irr >= 0)`
  * `CHECK (allocated_amount_irr > 0)` در `payment_allocations`
  * `CHECK (net_total_irr >= 0)` در `invoices`

---

## ۶. مدیریت زمان، Timezone و تاریخ شمسی
1. **ساعت‌های سیستمی و ثبت (`created_at`, `posted_at`, `occurred_at`):** همگی **`TIMESTAMPTZ`** ذخیره به صورت `UTC` در PostgreSQL؛ نمایش در API/UI بر اساس منطقه زمانی سازمان (`Asia/Tehran`).
2. **تاریخ اسناد مالی (`issue_date`, `due_date`, `start_date`, `end_date`):** نوع **`DATE`** (تقویم میلادی استاندارد برای محاسبه دقیق تفاضل روز `due_date - as_of_date` و بازه‌های دوره مالی).
3. **ستون متناظر شمسی (`*_jalali`):** نوع **`CHAR(10)`** با قید:
   `CHECK (issue_jalali ~ '^(13|14)[0-9]{2}/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])$')`
   که همیشه به صورت همگام در Backend تولید و اعتبارسنجی می‌شود (و هرگز بدون چک کردن کبیسه به‌عنوان تنها نوع تاریخ در محاسبات استفاده نمی‌شود).
4. **مقدار خام تاریخ روی برگه اسکن‌شده:** در `extracted_fields.raw_value` بدون تغییر نگهداری می‌شود (مثلاً `"۰۵/۸/۲۲"`).

---

## ۷. ایندکس‌گذاری، جستجو، JSONB و Partitioning
* **Composite Indexes حیاتی:**
  * `invoices`: `(organization_id, invoice_direction, lifecycle_status, issue_date DESC)` و `(organization_id, contact_id, due_date)`
  * `payment_allocations`: `(organization_id, invoice_id, status)` و `(organization_id, payment_id, status)`
  * `inventory_movements`: `(organization_id, warehouse_id, product_id, occurred_at)`
  * `checks`: `(organization_id, check_direction, current_status, due_date)`
  * `audit_logs`: `(organization_id, entity_type, entity_id, occurred_at DESC)`
* **Partial Indexes (بسیار بهینه برای صف‌های کار):**
  * `CREATE INDEX idx_docs_needs_review ON documents (organization_id, uploaded_at) WHERE lifecycle_status = 'Needs Review';`
  * `CREATE INDEX idx_bank_tx_unmatched ON bank_transactions (organization_id, bank_account_id, occurred_at) WHERE reconciliation_status = 'UNMATCHED';`
  * `CREATE INDEX idx_invoices_posted_ar ON invoices (organization_id, contact_id, due_date) WHERE lifecycle_status = 'Posted' AND invoice_direction = 'SALE';`
* **Unique Indexes ترکیبی برای Idempotency و عدم تکرار:**
  * `UNIQUE (organization_id, idempotency_key)` روی `invoices`, `payments`, `inventory_movements`, `workflow_executions`, `import_batches`
  * `UNIQUE (organization_id, sha256_hash)` روی `document_storage_objects` (یا Non-unique Index + پرچم `duplicate_of_document_id` برای فایل‌های تکراری قابل ردیابی!)
  * `UNIQUE (organization_id, source_system_id, entity_domain, external_id)` روی `external_entity_mappings`
* **استراتژی جستجوی فارسی (`Full-Text & Fuzzy Search`):**
  * فعال‌سازی اکستنشن **`pg_trgm`** (و نرمال‌سازی حروف فارسی `ي/ی` و `ك/ک` و حذف نیم‌فاصله در ستون جستجوی کمکی یا Expression Index) برای پیدا کردن سریع نام مشتریان و کالاها در `contacts.canonical_name` و `products.canonical_name` با `GIN (name gin_trgm_ops)`.
* **سیاست سخت‌گیرانه `JSONB`:**
  * استفاده **ممنوع** برای مبالغ، ردیف‌های فاکتور، موجودی یا تخصیص پرداخت.
  * استفاده **مجاز و هدفمند** فقط برای: `import_rows.raw_row_json` (ستون‌های متغیر اکسل مشتری)، `workflow_executions.checkpoint_state_json`، `audit_logs.before_state_json / after_state_json`، `subscription_plans.features_json` و `report_executions.parameters_json`.
* **استراتژی `Partitioning`:**
  * در فاز ۱ به جز جداول پرحجم زمانی نیازی به پارتیشن‌بندی پیچیده نیست؛ اما برای رشد بالای ۵۰ میلیون رکورد، جداول `audit_logs`، `inventory_movements` و `usage_records` به صورت **Range Partitioning بر اساس `occurred_at` (سالانه/فصلی)** آماده پارتیشن‌شدن هستند.

---

## ۸. مدیریت داده‌های حساس (`Sensitive Data Classification`)
* فیلدهای `users.password_hash`, `integration_connections.credential_secret_ref`, `contact_identifiers (NATIONAL_ID, IBAN)` و فایل‌های `document_storage_objects` با سطح حساسیت `CONFIDENTIAL / RESTRICTED` طبقه‌بندی می‌شوند.
* رمزهای عبور و توکن‌های API هرگز به متن ساده ذخیره نمی‌شوند؛ `credential_secret_ref` صرفاً اشاره به Vault/KMS است.
* پیش از ارسال هر متن به مدل زبانی خارجی، ستون‌های هویتی غیرضروری (`IBAN`, `password_hash`, `phone`) از کانتکست پرامپت پالایش می‌شوند.
