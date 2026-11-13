# 09 — معماری پایگاه داده، ماندگاری و اصلاحات Migration (`Database & Persistence Architecture`)

این سند معماری عملیاتی پایگاه داده `PostgreSQL 16+` را بر پایه **۱۰۹ جدول مرحله سوم** تثبیت می‌کند، نگاشت کامل ORM را مشخص می‌سازد و اصلاحات **بخش ۲۲ (ممیزی مرحله چهارم)** را بدون بازطراحی مدل ۱۰۹ جدولی مستند می‌کند.

---

## ۱. انتخاب ORM و استراتژی اتصال (`OD-01` — `PROPOSED_FOR_OWNER_APPROVAL`)

مطابق `docs/data-model/11-orm-evaluation.md` و `docs/processing/11-open-decisions.md`:
- **فناوری منتخب:** **`Drizzle ORM` + `SQL-first Versioned Migrations`** (با درایور `postgres.js` یا `node-postgres (pg)`).
- **دلیل معماری در برابر Prisma و TypeORM:**
  1. پشتیبانی طبیعی از **Composite Foreign Keys `(organization_id, id)`** در ۱۰۹ جدول بدون تغییر ساختار مدل؛
  2. سازگاری کامل با **`PgBouncer` (حالت `Transaction Pooling`)** از طریق تزریق صریح `SET LOCAL app.current_organization_id` در `TenantTransactionRunner`؛
  3. مدیریت دقیق **`FORCE ROW LEVEL SECURITY`**، **`CHECK` Constraints**، **`Partial Indexes`** و ایندکس‌های **`pg_trgm`** در فایل‌های Migration خالص SQL قابل ممیزی.

### الگوی استاندارد `TenantTransactionRunner` (`Pseudocode / Illustrative Only`)
```typescript
// Pseudocode / Illustrative Only — هرگز بدون این Runner کوئری دامنه اجرا نمی‌شود
async runInTenantTx<T>(ctx: { orgId: string; membershipId: string }, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return this.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_organization_id', ${ctx.orgId}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_membership_id', ${ctx.membershipId}, true)`);
    return fn(tx);
  });
}
```
> **ایمنی Fail-Closed:** نقش دیتابیس برنامه `erpkian_app_runtime` فاقد `BYPASSRLS` است. اگر کانتکست ست نشود، مقایسه `organization_id = NULLIF(current_setting(...), '')::uuid` برابر `NULL` بوده و **۰ ردیف** برمی‌گرداند.

---

## ۲. خلاصه نگاشت ۱۰۹ جدول به ماژول‌ها و قوانین فیزیکی
- **مالکیت کامل ۱۰۹ جدول:** در سند [`04-modular-monolith-design.md`](./04-modular-monolith-design.md) بخش ۱ برای تک‌تک ماژول‌های ۲۵گانه ثبت شده است.
- **نوع داده‌های مالی و زمانی (`CONFIRMED`):**
  - مبالغ پایه: `NUMERIC(18,0)` با پسوند `*_irr`؛ قیمت واحد و نرخ تبدیل: `NUMERIC(20,4)` / `NUMERIC(20,8)`.
  - تاریخ سند: `DATE` میلادی + `CHAR(10)` شمسی (`*_jalali` با اعتبارسنجی کبیسه در Backend).
  - ساعت رخداد: `TIMESTAMPTZ` (UTC).
- **ایندکس‌های حیاتی کارایی (`Performance Indexing`):**
  - تمام جداول پرتراکنش (`invoices`, `payments`, `payment_allocations`, `inventory_movements`, `bank_transactions`, `audit_logs`) دارای Composite Index شروع‌شده با `organization_id` و Partial Index روی صف‌های کاری (`Needs Review`, `UNMATCHED`, `Posted SALE`) هستند.
- **پارتیشن‌بندی آینده (`Future Partitioning`):** جداول `audit_logs`، `inventory_movements` و `usage_records` برای Range Partitioning فصلی/سالانه روی `occurred_at` آماده می‌شوند.

---

## ۳. رفع تعارض‌های ممیزی مرحله چهارم روی مدل داده و فرمول‌ها (بخش ۲۲)

### ۳.۱. اصلاح اسکریپت پیشنهادی `Draft Migration 011` (`PROPOSED_FOR_OWNER_APPROVAL`)
**نقص شناسایی‌شده در ممیزی مرحله چهارم (`docs/processing/12-stage4-traceability.md`):**  
در پیش‌نویس قبلی، دستور زیر آمده بود:
```sql
ALTER TABLE service_definitions ADD COLUMN IF NOT EXISTS category_code VARCHAR(10) NOT NULL DEFAULT 'A';
```
اگر این دستور روی دیتابیس دارای ۶۲ سرویس (دسته‌های `A` تا `I`) اجرا شود، تمام سرویس‌های دسته‌های `B` تا `I` به اشتباه مقدار `'A'` می‌گیرند!

**اصلاحیه قطعی در معماری مرحله پنجم (الگوی `Expand → Explicit Backfill → Validate → Contract`):**
1. **گام Expand:** افزودن ستون‌های `category_code`, `required_permission_code`, `is_locked_in_v1` ابتدا به صورت **`NULLABLE`** بدون مقدار پیش‌فرض گمراه‌کننده `'A'`.
2. **گام Explicit Backfill (بر اساس `service_code`):** نگاشت دقیق بر اساس پیشوند رسمی کاتالوگ:
   - `DOC-%` ← `'A'` | `FIN-AR-%` ← `'B'` | `FIN-AP-%` ← `'C'` | `TRS-%` ← `'D'`
   - `INV-%` ← `'E'` | `SLS-%`, `PUR-%`, `INT-%` ← `'F'` | `PRF-%` ← `'G'` | `RPT-%` ← `'H'` | `TAX-%` ← `'I'`
   - قفل‌گذاری `is_locked_in_v1 = true` برای `TAX-SUB-MOADIAN-001` و `TAX-SUB-RETURN-001`.
   - نگاشت صریح `required_permission_code` بر اساس جدول بخش ۴ سند `05-role-permission-matrix.md`.
3. **گام Validate:** افزودن قید `NOT NULL` و `CHECK (category_code IN ('A','B','C','D','E','F','G','H','I'))` با الگوی `NOT VALID -> VALIDATE CONSTRAINT`.
4. **وضعیت:** **`PROPOSED_FOR_OWNER_APPROVAL`** *(غیرقابل اجرا در مخزن فعلی؛ صرفاً برای بسته Migration پروژه هدف)*.

### ۳.۲. رفع تکراری بودن شناسه فرمول `CF-INV-01` (بخش ۲۲)
در `docs/processing/08-calculation-formulas.md` شناسه `CF-INV-01` سهواً هم برای محاسبه فاکتور (بخش ۱) و هم برای موجودی لحظه‌ای (بخش ۳) استفاده شده بود. در تمام مشخصات Backend، Test Suite و Traceability مرحله پنجم نگاشت استاندارد زیر برقرار می‌شود:
- **`CF-DOC-INV-01`** *(معادل قدیمی بخش ۱)*: محاسبه مبلغ ردیف و هدر فاکتور (`LineGross`, `LineDiscount`, `TaxableLineBase`, `LineTax`, `LineNet`, `NetTotal`).
- **`CF-STK-01`** *(معادل قدیمی بخش ۳)*: محاسبه موجودی لحظه‌ای تعدادی کالا در تاریخ $T$ بر اساس `stock_snapshots + inventory_movements`.

### ۳.۳. تثبیت ترتیب محاسبه تخفیف ردیفی، تخفیف پای فاکتور و نرخ مالیات (`PROPOSED_FOR_OWNER_APPROVAL`)
برای جلوگیری از هرگونه ابهام بین نسخه‌های مختلف قوانین مالیاتی ایران:
1. **نرخ مالیات:** به جای عدد ثابت `10%` در کد، جدول مرجع تاریخ‌دار/سازمانی `tax_rate_pct` (در `organization_settings` یا ردیف فاکتور بر اساس سال شمسی — پیش‌فرض ایران `10%` در سال‌های جاری) نگهداری می‌شود.
2. **ترتیب محاسبه استاندارد (`InvoiceDiscount` پیش از مالیات در فاکتور فروش توزیعی — سیاست پیش‌فرض پیشنهادی):**
   - گام ۱: $\text{LineGross}_i = \text{ROUND}_{\text{HalfEven}}(\text{Qty}_i \times \text{UnitPrice}_i, 0)$ (برای `is_promotional_free_item = true` برابر `0`).
   - گام ۲: $\text{LineDiscount}_i$ (درصدی `ROUND(LineGross * discount_pct / 100, 0)` یا مبلغ صریح).
   - گام ۳: اگر `invoice_discount_irr > 0` و سیاست سازمان `PRE_TAX_PRORATA` باشد، تخفیف پای فاکتور به نسبت $\text{LineGross}_i - \text{LineDiscount}_i$ بین ردیف‌های غیررایگان سرشکن می‌شود (`Remainder` ریال ناشی از گردکردن با الگوریتم Largest Remainder به آخرین ردیف مشمول تخصیص می‌یابد تا جمع دقیقاً برابر `invoice_discount_irr` شود).
   - گام ۴: $\text{TaxableLineBase}_i = \text{LineGross}_i - \text{LineDiscount}_i - \text{AllocatedInvDiscount}_i$.
   - گام ۵: $\text{LineTax}_i = \text{ROUND}_{\text{HalfEven}}(\text{TaxableLineBase}_i \times \text{TaxRate}_i, 0)$.
   - گام ۶: $\text{NetTotal} = \sum_i (\text{TaxableLineBase}_i + \text{LineTax}_i)$.
   - *(اگر سازمان در اسناد کاغذی قدیمی از حالت `POST_TAX_DISCOUNT` استفاده کرده باشد، پرچم `invoice_discount_tax_mode` در فاکتور ثبت و در فرمول اعمال می‌شود — وضعیت: `PROPOSED_FOR_OWNER_APPROVAL`)*.

---

## ۴. پشتیبان‌گیری، بازیابی و نگهداری داده (`Backup, RPO/RTO & Retention`)
- **پشتیبان‌گیری مداوم:** Base Backup روزانه رمزنگاری‌شده + آرشیو پیوسته WAL (`pgBackRest` یا `WAL-G`) به یک باکت S3 ایزوله در موقعیت جغرافیایی مجزا.
- **اهداف بازیابی (`PROPOSED TARGET`):** `RPO <= 5 دقیقه`، `RTO <= 30 دقیقه`؛ آزمون بازیابی خودکار ماهانه در محیط Staging اجباری است.
- **سیاست نگهداری و Legal Hold (`data_retention_policies`):** اسناد `Posted` و `audit_logs` دارای قفل حقوقی حداقل ۱۰ ساله مطابق قوانین تجاری و مالیاتی‌اند؛ تنها اسناد `Rejected` یا موقت طبق سیاست سازمان پس از تایید و ثبت در `document_access_logs` پاکسازی می‌شوند.
