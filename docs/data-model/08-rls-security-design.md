# 08 — طراحی امنیت چندسازمانی و Row Level Security (`RLS Security Design`)

این سند معماری دفاعی چندلایه (`Defense-in-Depth`) را برای جلوگیری قطعی از دسترسی یک سازمان به داده‌های سازمان دیگر در `Erpkian` تشریح می‌کند.

---

## ۱. اصل معماری امنیت: سه لایه محافظتی همزمان
1. **لایه برنامه (`NestJS AuthGuard + RBAC Guard`):** بررسی توکن JWT، استخراج `user_id` و `active_organization_id`، تأیید عضویت فعال در `organization_memberships` و بررسی مجوز در `membership_roles`.
2. **لایه رابطه دیتابیس (`Composite Foreign Keys`):** پیوند `(organization_id, id)` مانع ارجاع رکوردهای سازمان `A` به رکوردهای سازمان `B` حتی در صورت وجود باگ در کد بک‌اند می‌شود.
3. **لایه ردیف دیتابیس (`PostgreSQL Row Level Security - RLS`):** حتی اگر یک کوئری در بک‌اند شرط `WHERE organization_id = ...` را فراموش کند، موتور PostgreSQL ردیف‌های سایر سازمان‌ها را بازنمی‌گرداند و اجازه درج/ویرایش در سازمان دیگر را نمی‌دهد.

---

## ۲. تفکیک نقش‌های اتصال به دیتابیس (`Database Roles Separation`)

| نقش PostgreSQL | کاربرد | دسترسی به `BYPASSRLS` | مالکیت جداول؟ | توضیحات امنیتی |
| :--- | :--- | :---: | :---: | :--- |
| **`erpkian_migrator`** | اجرای Migrationها (`001`..`010`) در CI/CD | دارد (یا مالک جداول) | **بله (Table Owner)** | هرگز در رشته اتصال Runtime سرور وب یا Worker استفاده نمی‌شود. |
| **`erpkian_app_runtime`** | سرویس Backend (NestJS) و Workerهای پردازشی | **ندارد (`NOBYPASSRLS`)** | **خیر** | موظف است در ابتدای هر تراکنش، کانتکست Tenant را تنظیم کند. |
| **`erpkian_readonly_bi`** | ابزارهای گزارش‌گیری داخلی محدود (آینده) | ندارد (`NOBYPASSRLS`) | خیر | فقط مجوز `SELECT` تحت RLS یا Viewهای مجاز. |

> **نکته حیاتی:** روی تمام جداول Tenant-owned علاوه بر `ENABLE ROW LEVEL SECURITY` باید دستور **`FORCE ROW LEVEL SECURITY`** اجرا شود تا حتی در سناریوهای غیرمنتظره خطای نقش، قوانین RLS دور زده نشوند و تا زمانی که `app.current_organization_id` ست نشده باشد (Fail-Closed)، **هیچ ردیفی (`0 rows`)** برگردانده نشود!

---

## ۳. الگوی تنظیم نشست در تراکنش (`Fail-Closed Session Context Pattern`)
برای سازگاری با Connection Pooling (مانند `PgBouncer` در حالت Transaction Pooling)، هرگز از `SET` در سطح Session استفاده نمی‌شود؛ بلکه در شروع هر تراکنش سرور از `SET LOCAL` استفاده می‌شود تا مقدار با پایان تراکنش پاک شود:

```sql
-- نمونه Draft غیرقابل اجرا در شروع هر Request/Job تراکنش‌دار:
BEGIN;
SET LOCAL app.current_organization_id = '11111111-1111-7111-8111-111111111111';
SET LOCAL app.current_membership_id   = '22222222-2222-7222-8222-222222222222';
-- اجرای کوئری‌های سرویس...
COMMIT;
```

در حالت `NULL` یا مقدار خالی (`current_setting('app.current_organization_id', true)`), تابع کمکی `NULLIF(..., '')::uuid` مقدار `NULL` برمی‌گرداند و مقایسه `organization_id = NULL` همیشه `FALSE` می‌شود (سیاست **Fail-Closed**).

---

## ۴. طبقه‌بندی RLS تمام جداول مدل داده (`۱۰۹` جدول)

| دسته جدول | جداول شامل‌شده | Tenant-Owned؟ | نیازمند RLS؟ | خواندن بدون عضویت سازمانی؟ | مبنای Policy |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **A. جداول مرجع سیستمی و سراسری** | `business_types`, `currencies`, `permissions`, `document_types`, `extraction_model_versions`, `source_systems`, `service_definitions`, `workflow_definitions`, `report_definitions`, `subscription_plans` | خیر (مشترک) | خیر (یا `SELECT` عمومی برای کاربران احرازشده) | فقط پس از Login برای کاتالوگ عمومی | نوشتن فقط توسط `erpkian_migrator` / Super-admin پلتفرم |
| **B. هویت سراسری کاربر** | `users` | خیر (سراسری) | بله (Self-Scoped) | فقط رکورد خود کاربر (`id = app.current_user_id`) یا هم‌سازمانی‌ها در نمایه محدود | محافظت از عدم افشای لیست کاربران کل پلتفرم |
| **C. جداول ترکیبی سیستمی/سازمانی** | `roles`, `units_of_measure`, `reconciliation_rules` | نیمه‌سازمانی (`organization_id NULL` = قالب سیستم) | **بله** | فقط ردیف‌های پیش‌فرض سیستمی با عضویت فعال | `SELECT`: `(organization_id IS NULL OR organization_id = current_org())`؛ `INSERT/UPDATE/DELETE`: فقط `organization_id = current_org()` |
| **D. جداول کاملاً سازمانی (اکثریت مطلق)** | تمام جداول دیگر (`organizations`, `branches`, `organization_memberships`, `fiscal_*`, `contacts*`, `products*`, `warehouses`, `inventory_*`, `documents*`, `extraction_*`, `invoices*`, `payments*`, `checks*`, `bank_*`, `integration_*`, `sync_*`, `import_*`, `reconciliation_*`, `workflow_*`, `processing_*`, `report_*`, `conversations*`, `audit_logs`, `notifications*`, `subscriptions*`, `usage_*`, `data_retention_policies`) | **بله** | **بله (اجباری + FORCE)** | **خیر (ممنوع)** | هم برای `USING` و هم برای `WITH CHECK`: `organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid` |
| **E. رویدادهای امنیتی بین‌سازمانی** | `security_events` | اختیاری (`organization_id NULL` برای حمله Login) | **بله** | خیر | ادمین سازمان فقط رویدادهای `organization_id = current_org()` را می‌بیند |

---

## ۵. نمونه Policyهای استاندارد PostgreSQL (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)

```sql
-- نمونه استاندارد برای جدول Tenant-owned (مثلاً invoices)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

-- 1. SELECT: فقط رکوردهای سازمان جاری
CREATE POLICY pol_invoices_select ON invoices
  FOR SELECT TO erpkian_app_runtime
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- 2. INSERT: فقط با organization_id سازمان جاری
CREATE POLICY pol_invoices_insert ON invoices
  FOR INSERT TO erpkian_app_runtime
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- 3. UPDATE: فقط برای اسنادی که هنوز Posted نشده‌اند (ایمنی مالی + Tenant)
CREATE POLICY pol_invoices_update ON invoices
  FOR UPDATE TO erpkian_app_runtime
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND lifecycle_status <> 'Posted'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- 4. DELETE: مسدود در لایه Policy برای جداول مالی (فقط ابطال با سند معکوس مجاز است)
CREATE POLICY pol_invoices_delete_deny ON invoices
  FOR DELETE TO erpkian_app_runtime
  USING (false);
```

---

## ۶. کنترل دسترسی بین نقش‌ها، فایل‌ها، JOINها و عامل ویندوز
1. **تفکیک نقش‌های داخل یک سازمان (`Role A..I`):**
   - `RLS` مرز **سازمان** را می‌بندد؛ مرز **نقش داخل سازمان** (مثلاً منع دسترسی `مدیر انبار` به `bank_transactions` یا `cost`، و منع تغییر `fiscal_periods` توسط `حسابدار`) توسط **RBAC Guard در NestJS** + بررسی `membership_roles` و `branch_scope_id` اعمال می‌شود.
2. **امنیت فایل‌ها در Object Storage:**
   - کلید فایل در S3 همیشه با پیشوند `<organization_id>/<document_id>/...` ساخته می‌شود.
   - کاربر هرگز لینک مستقیم و دائمی S3 نمی‌گیرد؛ دسترسی از طریق API با احراز عضویت + بررسی مجوز + صدور Pre-signed URL کوتاه‌عمر (مثلاً ۲ دقیقه) + ثبت در `document_access_logs` انجام می‌شود.
3. **جلوگیری از نشت در `JOIN`ها:**
   - از آنجا که `RLS` روی **هر جدول درگیر در JOIN** به طور مستقل اعمال می‌شود و کلیدهای خارجی نیز `(organization_id, id)` هستند، هیچ JOINی نمی‌تواند ردیف سازمان دیگری را ترکیب یا افشا کند.
4. **امنیت عامل محلی ویندوز (`.NET Windows Agent`):**
   - هر نصب Agent دارای یک رکورد در `integration_connections` با `agent_device_id` و کلید اختصاصی محدود به **یک `organization_id` واحد** و با دسترسی `read_only = true` در فاز اول است. در صورت لغو دستگاه (`status = 'REVOKED'`)، تمام درخواست‌های آن فوراً رد و در `security_events` ثبت می‌شوند.

---

## ۷. تست‌های منفی امنیتی الزامی (`Negative Security Tests`)
1. **تست NST-01 (دانستن UUID سازمان دیگر):** کاربر سازمان `A` با یک UUID واقعی و معتبر از فاکتور سازمان `B` درخواست `GET /invoices/:id_of_B` می‌فرستد ← با فرض عبور احتمالی از لایه سرویس، دیتابیس `0 rows` برمی‌گرداند و رویداد `CROSS_TENANT_ATTEMPT` در `security_events` ثبت می‌شود.
2. **تست NST-02 (تزریق در INSERT):** درخواست ساخت `invoice` در کانتکست سازمان `A` با `contact_id` متعلق به سازمان `B` ← هم به دلیل `Composite FK` و هم `RLS` با خطا رد می‌شود.
3. **تست NST-03 (تراکنش بدون Tenant Context):** اجرای مستقیم `SELECT * FROM invoices` با نقش `erpkian_app_runtime` بدون ست کردن `app.current_organization_id` ← خروجی باید دقیقاً `0` ردیف باشد (`Fail-Closed`).
4. **تست NST-04 (تلاش برای DELETE فیزیکی فاکتور `Posted`):** اجرای `DELETE FROM invoices WHERE id = ...` توسط نقش Runtime ← توسط `pol_invoices_delete_deny` مسدود می‌شود.
5. **تست NST-05 (تایید بدون مجوز):** حسابدار بدون نقش `Approver` تلاش به تغییر `lifecycle_status` به `Posted` دارد ← در Guard لایه سرویس مسدود و در `security_events` ثبت می‌شود.
