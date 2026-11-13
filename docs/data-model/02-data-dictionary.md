# 02 — فرهنگ داده جامع (`Data Dictionary`)

این سند مشخصات کامل **۱۰۹ جدول** مدل داده `Erpkian` را شامل مسئولیت، روابط، مالکیت سازمانی، چرخه عمر، سیاست حذف، محدودیت‌های مالی و تعریف دقیق فیلدبه‌فیلد با ۱۴ ستون استاندارد ارائه می‌دهد.

> **قواعد عمومی مشترک برای تمام جداول `Tenant-Owned`:**
> * کلید اصلی `id` از نوع `UUID` (ترجیحاً `UUIDv7`) و قید `UNIQUE (organization_id, id)` برای پشتیبانی از کلیدهای خارجی مرکب تعریف می‌شود.
> * ستون‌های استاندارد ممیزی زمانی در جداول عملیاتی شامل `created_at` و `updated_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`) هستند.

---

# بخش ۱: `Organization & Identity` (جداول ۱ تا ۱۲)

### ۱. جدول `business_types`
* **مسئولیت:** رجیستری مرجع انواع کسب‌وکار (`distribution_wholesale`, `retail`, `manufacturing`, `service`, `personal`). | **ارتباط:** والد `organizations`, `business_profiles`. | **مالکیت سازمانی:** سراسری سیستمی (بدون RLS سازمانی). | **ایجاد/اصلاح:** فقط در Seed/Migration. | **چرخه عمر:** `is_active` (`true/false`). | **سیاست حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Core/Auth`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| business_types | id | شناسه یکتای نوع کسب‌وکار | UUID | NO | YES | - | gen_random_uuid() | - | PK | Public | System | UUID valid | `01930000-...-0001` |
| business_types | code | کد سیستمی استاندارد نوع فعالیت | VARCHAR(40) | NO | NO | - | - | UNIQUE, CHECK(code ~ '^[a-z_]+$') | UQ | Public | System | lowercase snake_case | `distribution_wholesale` |
| business_types | name_fa | عنوان فارسی نوع فعالیت | VARCHAR(120) | NO | NO | - | - | - | - | Public | System | non-empty | `پخش و عمده‌فروشی` |
| business_types | is_active | فعال بودن برای ثبت‌نام جدید | BOOLEAN | NO | NO | - | true | - | idx_bt_active | Public | System | boolean | `true` |

### ۲. جدول `organizations`
* **مسئولیت:** ریشه Tenant و مالک تمام داده‌های سازمانی. | **ارتباط:** والد تمام جداول Tenant-owned. | **مالکیت:** Tenant Root (`id = organization_id`). | **ایجاد/اصلاح:** هنگام ایجاد سازمان توسط مالک و تنظیمات بعدی توسط Admin. | **چرخه عمر:** `TRIAL -> ACTIVE -> SUSPENDED -> ARCHIVED`. | **حذف:** ممنوع در وجود رکورد مالی (`RESTRICT`). | **محدودیت مالی:** `base_currency_code` پس از اولین سند `Posted` قفل است. | **ماژول:** `Core`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| organizations | id | شناسه یکتای سازمان (Tenant ID) | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193a000-...-0001` |
| organizations | name | نام تجاری یا حقوقی سازمان | VARCHAR(200) | NO | NO | - | - | LENGTH(name) >= 2 | idx_org_name | Internal | User | 2..200 chars | `پخش آریا گستر` |
| organizations | slug | شناسه متنی یکتا در URL | VARCHAR(80) | NO | NO | - | - | UNIQUE | UQ | Internal | System | slug regex | `arya-gostar` |
| organizations | business_type_id | نوع فعالیت اصلی سازمان | UUID | NO | NO | business_types(id) | - | ON DELETE RESTRICT | idx_org_bt | Internal | User | valid FK | `01930000-...-0001` |
| organizations | base_currency_code | ارز پایه محاسبات دیتابیس | CHAR(3) | NO | NO | currencies(code) | `'IRR'` | CHECK(base_currency_code='IRR') | idx_org_curr | Financial | System | ISO/Custom IRR | `IRR` |
| organizations | default_display_currency_code | ارز پیش‌فرض نمایش در UI | CHAR(3) | NO | NO | currencies(code) | `'IRT'` | IN('IRR','IRT') | - | Internal | User | IRR or IRT | `IRT` |
| organizations | default_calendar | تقویم نمایشی پیش‌فرض | VARCHAR(16) | NO | NO | - | `'JALALI'` | IN('JALALI','GREGORIAN') | - | Internal | User | enum | `JALALI` |
| organizations | status | وضعیت حیات سازمان | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('TRIAL','ACTIVE','SUSPENDED','ARCHIVED') | idx_org_status | Internal | System | enum | `ACTIVE` |
| organizations | created_at | زمان ایجاد سازمان | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T10:00Z` |

### ۳. جدول `business_profiles` *(PROVISIONAL)*
* **مسئولیت:** نگهداری ویژگی‌های تخصصی صنعت برای فعال‌سازی خدمات متناسب (`Business Profile`). | **ارتباط:** `1:1` با `organizations`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام Onboarding یا تغییر پروفایل توسط Owner. | **چرخه عمر:** فعال همگام با سازمان. | **حذف:** `RESTRICT`. | **محدودیت مالی:** فعال‌سازی `multi_uom_enabled` بر اجبار واحد سنجش اثر دارد. | **ماژول:** `Core/Discovery`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| business_profiles | organization_id | شناسه سازمان | UUID | NO | YES | organizations(id) | - | PK, ON DELETE RESTRICT | PK | Internal | System | valid org | `0193a000-...-0001` |
| business_profiles | business_type_id | نوع کسب‌وکار فعال | UUID | NO | NO | business_types(id) | - | ON DELETE RESTRICT | - | Internal | User | valid FK | `01930000-...-0001` |
| business_profiles | sales_model | مدل فروش (`DISTRIBUTION`, `RETAIL`, `B2B_SERVICE`, `PERSONAL`) | VARCHAR(30) | NO | NO | - | `'DISTRIBUTION'` | enum | - | Internal | User | enum | `DISTRIBUTION` |
| business_profiles | tax_regime | وضعیت مشمولیت ارزش افزوده | VARCHAR(30) | NO | NO | - | `'VAT_REGISTERED'` | IN('VAT_REGISTERED','EXEMPT','UNKNOWN') | - | Confidential | User | enum | `VAT_REGISTERED` |
| business_profiles | multi_uom_enabled | پشتیبانی از چند واحد سنجش (کارتن/عدد) | BOOLEAN | NO | NO | - | true | - | - | Internal | System | boolean | `true` |
| business_profiles | multi_branch_enabled | فعال بودن چند شعبه | BOOLEAN | NO | NO | - | false | - | - | Internal | System | boolean | `true` |

### ۴. جدول `organization_settings`
* **مسئولیت:** تنظیمات عددی و کنترلی عملیات مالی سازمان. | **ارتباط:** `1:1` با `organizations`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** ادمین یا مدیر مالی با ثبت Audit. | **چرخه عمر:** همراه سازمان. | **حذف:** `RESTRICT`. | **محدودیت مالی:** تغییر سقف دوامضایی عطف به ماسبق نمی‌شود. | **ماژول:** `Core/Financial`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| organization_settings | organization_id | شناسه سازمان | UUID | NO | YES | organizations(id) | - | PK | PK | Internal | System | valid org | `0193a000-...-0001` |
| organization_settings | fiscal_year_start_month | ماه شروع سال مالی شمسی (۱ تا ۱۲) | SMALLINT | NO | NO | - | 1 | BETWEEN 1 AND 12 | - | Internal | User | 1..12 | `1` |
| organization_settings | default_invoice_due_days | مهلت سررسید پیش‌فرض فاکتور نسیه | SMALLINT | NO | NO | - | 30 | >= 0 | - | Financial | User | >= 0 | `30` |
| organization_settings | allow_negative_stock | مجوز ثبت فروش با موجودی منفی | BOOLEAN | NO | NO | - | false | - | - | Financial | Admin | boolean | `false` |
| organization_settings | require_dual_approval_above_irr | سقف مبلغ نیازمند تأیید مدیر مالی (ریال) | NUMERIC(18,0) | YES | NO | - | NULL | >= 0 | - | Financial | CFO | non-negative | `500000000` |
| organization_settings | qty_decimal_scale | تعداد ارقام اعشار مجاز برای تعداد کالا | SMALLINT | NO | NO | - | 3 | BETWEEN 0 AND 6 | - | Financial | Admin | 0..6 | `3` |

### ۵. جدول `branches`
* **مسئولیت:** تفکیک شعب و دفاتر عملیاتی یک سازمان. | **ارتباط:** فرزند `organizations`، والد `warehouses`, `invoices`, `payments`, `documents`. | **مالکیت:** Tenant-owned (`UNIQUE(organization_id, id)`). | **ایجاد/اصلاح:** مدیر سیستم. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** حداقل ۱ شعبه HQ فعال برای سازمان کسب‌وکار. | **ماژول:** `Core`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| branches | organization_id | شناسه سازمان مالک | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_br_org | Internal | System | valid org | `0193a000-...-0001` |
| branches | id | شناسه یکتای شعبه | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193a100-...-0001` |
| branches | code | کد یکتای شعبه درون سازمان | VARCHAR(32) | NO | NO | - | - | UQ(organization_id,code) | UQ | Internal | User | non-empty | `THR-HQ` |
| branches | name | نام شعبه | VARCHAR(150) | NO | NO | - | - | - | - | Internal | User | >=2 chars | `شعبه مرکزی تهران` |
| branches | is_headquarters | نشانگر دفتر مرکزی | BOOLEAN | NO | NO | - | false | - | - | Internal | User | boolean | `true` |
| branches | is_active | وضعیت فعالیت شعبه | BOOLEAN | NO | NO | - | true | - | idx_br_active | Internal | Admin | boolean | `true` |

### ۶. جدول `users`
* **مسئولیت:** حساب هویتی سراسری شخص (مستقل از سازمان تا یک فرد عضو چند شرکت شود). | **ارتباط:** والد `organization_memberships`. | **مالکیت:** Global Identity (Self-scoped RLS). | **ایجاد/اصلاح:** ثبت‌نام و مدیریت پروفایل. | **چرخه عمر:** `ACTIVE`, `LOCKED`, `DISABLED`. | **حذف:** Soft-disable (`RESTRICT` روی عضویت). | **محدودیت مالی:** ندارد. | **ماژول:** `Auth`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| users | id | شناسه یکتای کاربر | UUID | NO | YES | - | gen_random_uuid() | - | PK | PII | System | UUID | `0193u000-...-0001` |
| users | email | ایمیل یکتا (اختیاری اگر ثبت‌نام موبایلی باشد) | VARCHAR(255) | YES | NO | - | NULL | UNIQUE | UQ | PII | User | RFC email | `m.rezaei@example.ir` |
| users | phone_e164 | شماره موبایل استاندارد بین‌المللی | VARCHAR(20) | YES | NO | - | NULL | UNIQUE, CHECK(email IS NOT NULL OR phone_e164 IS NOT NULL) | UQ | PII | User | E.164 | `+989121234567` |
| users | full_name | نام و نام خانوادگی | VARCHAR(150) | NO | NO | - | - | - | - | PII | User | >=2 chars | `مریم رضایی` |
| users | password_hash | هش امن رمز عبور (Argon2id) | TEXT | NO | NO | - | - | - | - | Restricted | System | hashed only | `$argon2id$v=19$...` |
| users | mfa_enabled | فعال بودن احراز هویت دومرحله‌ای | BOOLEAN | NO | NO | - | false | - | - | Security | User | boolean | `true` |
| users | status | وضعیت حساب | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('ACTIVE','LOCKED','DISABLED') | - | Security | System | enum | `ACTIVE` |

### ۷. جدول `organization_memberships`
* **مسئولیت:** اتصال کاربر به سازمان؛ هویت عامل تمام اکشن‌ها و تاییدها درون یک سازمان. | **ارتباط:** متصل به `organizations`, `users`, `branches`. | **مالکیت:** Tenant-owned (`UNIQUE(organization_id, id)`). | **ایجاد/اصلاح:** پذیرش دعوت یا ساخت سازمان. | **چرخه عمر:** `ACTIVE`, `SUSPENDED`, `REVOKED`. | **حذف:** هرگز حذف فیزیکی نمی‌شود (`REVOKED`) تا Audit Logs معتبر بماند. | **محدودیت مالی:** ندارد. | **ماژول:** `Core/RBAC`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| organization_memberships | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id), UQ(organization_id,user_id) | UQ | Internal | System | valid org | `0193a000-...-0001` |
| organization_memberships | id | شناسه عضویت (Actor ID) | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193m000-...-0001` |
| organization_memberships | user_id | شناسه کاربر سراسری | UUID | NO | NO | users(id) | - | ON DELETE RESTRICT | idx_mem_user | PII | System | valid user | `0193u000-...-0001` |
| organization_memberships | default_branch_id | شعبه پیش‌فرض عضو | UUID | YES | NO | branches(organization_id,id) | NULL | Composite FK | - | Internal | Admin | same org branch | `0193a100-...-0001` |
| organization_memberships | membership_status | وضعیت عضویت در این سازمان | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('ACTIVE','SUSPENDED','REVOKED') | idx_mem_status | Security | Admin | enum | `ACTIVE` |
| organization_memberships | joined_at | زمان پیوستن به سازمان | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T10:05Z` |

### ۸. جدول `roles`
* **مسئولیت:** تعریف نقش‌های سیستمی استاندارد (`A..I`) و نقش‌های سفارشی سازمان. | **ارتباط:** والد `role_permissions`, `membership_roles`. | **مالکیت:** Hybrid (`organization_id NULL` برای سیستمی). | **ایجاد/اصلاح:** Seed سیستم یا Admin سازمان. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT` در صورت تخصیص. | **محدودیت مالی:** ندارد. | **ماژول:** `RBAC`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| roles | id | شناسه یکتای نقش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193r000-...-0004` |
| roles | organization_id | شناسه سازمان (NULL = قالب سیستمی مشترک) | UUID | YES | NO | organizations(id) | NULL | UQ(COALESCE(organization_id,'0000...'), code) | idx_roles_org | Internal | System/Admin | valid org or null | `NULL` |
| roles | code | کد نقش (`ACCOUNTANT`, `CFO`, ...) | VARCHAR(50) | NO | NO | - | - | - | - | Security | System/Admin | uppercase | `ACCOUNTANT` |
| roles | name_fa | عنوان فارسی نقش | VARCHAR(100) | NO | NO | - | - | - | - | Internal | System/Admin | non-empty | `حسابدار` |
| roles | is_system_role | نشانگر نقش غیرقابل تغییر سیستم | BOOLEAN | NO | NO | - | false | - | - | Security | System | boolean | `true` |

### ۹. جدول `permissions`
* **مسئولیت:** کاتالوگ اتمیک مجوزها (مانند `invoice:post`, `period:reopen`). | **ارتباط:** متصل به `role_permissions`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Migration. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** مرجع گیت‌های Approval. | **ماژول:** `RBAC`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| permissions | id | شناسه یکتای مجوز | UUID | NO | YES | - | gen_random_uuid() | - | PK | Security | System | UUID | `0193p000-...-0012` |
| permissions | code | کد استاندارد `resource:action` | VARCHAR(80) | NO | NO | - | - | UNIQUE | UQ | Security | System | regex | `invoice:post` |
| permissions | module | نام ماژول مالک | VARCHAR(50) | NO | NO | - | - | - | idx_perm_mod | Internal | System | enum | `FINANCIAL` |
| permissions | description_fa | شرح فارسی مجوز | VARCHAR(250) | NO | NO | - | - | - | - | Internal | System | non-empty | `ثبت قطعی فاکتور` |

### ۱۰. جدول `role_permissions`
* **مسئولیت:** نگاشت `M:N` بین نقش‌ها و مجوزها. | **ارتباط:** پل `roles` و `permissions`. | **مالکیت:** تابع نقش والد. | **ایجاد/اصلاح:** Seed یا تنظیم نقش سفارشی. | **چرخه عمر:** فعال. | **حذف:** `CASCADE` فقط در ویرایش نقش سفارشی غیرسیستمی. | **محدودیت مالی:** ندارد. | **ماژول:** `RBAC`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| role_permissions | role_id | شناسه نقش | UUID | NO | YES | roles(id) | - | PK(role_id, permission_id) | PK | Security | System/Admin | valid role | `0193r000-...-0004` |
| role_permissions | permission_id | شناسه مجوز | UUID | NO | YES | permissions(id) | - | PK(role_id, permission_id) | PK | Security | System/Admin | valid perm | `0193p000-...-0012` |

### ۱۱. جدول `membership_roles`
* **مسئولیت:** تخصیص یک یا چند نقش به عضو یک سازمان (با قابلیت محدودسازی به یک شعبه). | **ارتباط:** متصل به `organization_memberships`, `roles`, `branches`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر سیستم سازمان با ثبت Audit. | **چرخه عمر:** فعال/لغوشده. | **حذف:** Soft-revoke یا ثبت `AuditLog`. | **محدودیت مالی:** ندارد. | **ماژول:** `RBAC`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| membership_roles | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_mr_org | Security | System | valid org | `0193a000-...-0001` |
| membership_roles | id | شناسه رکورد انتساب نقش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Security | System | UUID | `0193mr00-...-0001` |
| membership_roles | membership_id | شناسه عضو سازمان | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | idx_mr_mem | Security | Admin | same org | `0193m000-...-0001` |
| membership_roles | role_id | شناسه نقش | UUID | NO | NO | roles(id) | - | ON DELETE RESTRICT | idx_mr_role | Security | Admin | active role | `0193r000-...-0004` |
| membership_roles | branch_scope_id | محدودیت اختیاری نقش به یک شعبه | UUID | YES | NO | branches(organization_id,id) | NULL | Composite FK, UQ(membership_id,role_id,COALESCE(branch_scope_id,'0000...')) | UQ | Security | Admin | same org branch | `NULL` |

### ۱۲. جدول `invitations`
* **مسئولیت:** مدیریت دعوت امن کاربران جدید به سازمان. | **ارتباط:** متصل به `organizations`, `roles`, `branches`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Admin سازمان. | **چرخه عمر:** `PENDING -> ACCEPTED | EXPIRED | REVOKED`. | **حذف:** منقضی‌شدن خودکار. | **محدودیت مالی:** ندارد. | **ماژول:** `Auth/Core`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| invitations | organization_id | شناسه سازمان دعوت‌کننده | UUID | NO | NO | organizations(id) | - | - | idx_inv_org | Security | System | valid org | `0193a000-...-0001` |
| invitations | id | شناسه دعوت‌نامه | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193in00-...-0001` |
| invitations | contact_target | ایمیل یا موبایل فرد دعوت‌شده | VARCHAR(255) | NO | NO | - | - | - | idx_inv_target | PII | Admin | email or E.164 | `acc@company.ir` |
| invitations | invited_role_id | نقش پیشنهادی پس از پذیرش | UUID | NO | NO | roles(id) | - | ON DELETE RESTRICT | - | Security | Admin | valid role | `0193r000-...-0004` |
| invitations | branch_id | شعبه پیش‌فرض اختیاری | UUID | YES | NO | branches(organization_id,id) | NULL | Composite FK | - | Internal | Admin | same org | `NULL` |
| invitations | token_hash | هش SHA-256 توکن یکبارمصرف | CHAR(64) | NO | NO | - | - | UNIQUE | UQ | Restricted | System | 64 hex | `9f86d081...` |
| invitations | expires_at | زمان انقضای لینک دعوت | TIMESTAMPTZ | NO | NO | - | - | CHECK(expires_at > created_at) | idx_inv_exp | Security | System | future UTC | `2026-11-20T10:00Z` |
| invitations | accepted_at | زمان پذیرش دعوت | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Internal | System | UTC | `NULL` |
| invitations | created_at | زمان صدور دعوت | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T10:00Z` |

---

# بخش ۲: `Fiscal & Localization` (جداول ۱۳ تا ۲۰)

### ۱۳. جدول `currencies`
* **مسئولیت:** مرجع ارزهای مجاز (`IRR`, `IRT`, `USD`, `EUR`). | **ارتباط:** والد `organizations`, `exchange_rates`, `invoices`, `payments`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Seed. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `IRR` با `minor_unit_scale = 0`. | **ماژول:** `Fiscal`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| currencies | code | کد سه‌حرفی ارز (`IRR`, `IRT`) | CHAR(3) | NO | YES | - | - | CHECK(code ~ '^[A-Z]{3}$') | PK | Public | System | 3 uppercase | `IRR` |
| currencies | name_fa | نام فارسی ارز | VARCHAR(50) | NO | NO | - | - | - | - | Public | System | non-empty | `ریال ایران` |
| currencies | symbol | نماد نمایشی | VARCHAR(10) | NO | NO | - | - | - | - | Public | System | - | `ریال` |
| currencies | minor_unit_scale | تعداد ارقام اعشار رایج ارز | SMALLINT | NO | NO | - | 0 | BETWEEN 0 AND 4 | - | Financial | System | 0..4 | `0` |
| currencies | is_active | فعال بودن ارز | BOOLEAN | NO | NO | - | true | - | - | Public | System | boolean | `true` |

### ۱۴. جدول `exchange_rates`
* **مسئولیت:** نرخ تبدیل ارز مبدأ به `IRR` (به خصوص `IRT -> IRR = 10` و نرخ‌های آتی ارزی). | **ارتباط:** متصل به `organizations`, `currencies`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** سیستمی برای ریال/تومان و کاربر مجاز برای ارز خارجی. | **چرخه عمر:** تاریخ‌دار (`effective_date`). | **حذف:** `RESTRICT`. | **محدودیت مالی:** `rate > 0`. | **ماژول:** `Fiscal`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| exchange_rates | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_er_org | Financial | System | valid org | `0193a000-...-0001` |
| exchange_rates | id | شناسه رکورد نرخ تبدیل | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193er00-...-0001` |
| exchange_rates | from_currency_code | ارز مبدأ | CHAR(3) | NO | NO | currencies(code) | - | - | idx_er_pair | Financial | System/User | valid currency | `IRT` |
| exchange_rates | to_currency_code | ارز مقصد (معمولاً IRR) | CHAR(3) | NO | NO | currencies(code) | `'IRR'` | CHECK(from_currency_code <> to_currency_code) | idx_er_pair | Financial | System | valid currency | `IRR` |
| exchange_rates | rate | ضریب ضرب برای تبدیل | NUMERIC(20,8) | NO | NO | - | - | CHECK(rate > 0) | - | Financial | System/User | > 0 | `10.00000000` |
| exchange_rates | effective_date | تاریخ شروع اعتبار نرخ | DATE | NO | NO | - | - | UQ(organization_id,from_currency_code,to_currency_code,effective_date) | UQ | Financial | System/User | valid date | `2026-03-21` |

### ۱۵. جدول `fiscal_years`
* **مسئولیت:** تعریف سال‌های مالی سازمان با تاریخ شمسی و میلادی. | **ارتباط:** فرزند `organizations`، والد `fiscal_periods`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر مالی/ادمین. | **چرخه عمر:** `OPEN -> CLOSING -> CLOSED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** عدم همپوشانی بازه دو سال مالی یک سازمان. | **ماژول:** `Fiscal`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fiscal_years | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id), UQ(organization_id,code) | idx_fy_org | Financial | System | valid org | `0193a000-...-0001` |
| fiscal_years | id | شناسه سال مالی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193fy00-...-1405` |
| fiscal_years | code | کد سال مالی | VARCHAR(20) | NO | NO | - | - | - | UQ | Financial | User | non-empty | `FY-1405` |
| fiscal_years | title_fa | عنوان سال مالی | VARCHAR(100) | NO | NO | - | - | - | - | Financial | User | non-empty | `سال مالی ۱۴۰۵` |
| fiscal_years | start_date | تاریخ شروع میلادی | DATE | NO | NO | - | - | - | idx_fy_dates | Financial | System | valid date | `2026-03-21` |
| fiscal_years | end_date | تاریخ پایان میلادی | DATE | NO | NO | - | - | CHECK(end_date >= start_date) | idx_fy_dates | Financial | System | >= start_date | `2027-03-20` |
| fiscal_years | start_jalali | تاریخ شروع شمسی | CHAR(10) | NO | NO | - | - | regex YYYY/MM/DD | - | Financial | User/System | valid Jalali | `1405/01/01` |
| fiscal_years | end_jalali | تاریخ پایان شمسی | CHAR(10) | NO | NO | - | - | regex YYYY/MM/DD | - | Financial | User/System | valid Jalali | `1405/12/29` |
| fiscal_years | status | وضعیت سال مالی | VARCHAR(20) | NO | NO | - | `'OPEN'` | IN('OPEN','CLOSING','CLOSED') | - | Financial | CFO | enum | `OPEN` |

### ۱۶. جدول `fiscal_periods`
* **مسئولیت:** تقسیم سال مالی به دوره‌های ماهانه/فصلی برای کنترل قفل دوره. | **ارتباط:** فرزند `fiscal_years`، والد `invoices`, `payments`, `inventory_movements`, `period_locks`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** تولید خودکار ۱۲ دوره هنگام ساخت سال مالی. | **چرخه عمر:** `OPEN -> SOFT_LOCKED -> CLOSED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ثبت سند در دوره `CLOSED` ممنوع است. | **ماژول:** `Fiscal`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fiscal_periods | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_fp_org | Financial | System | valid org | `0193a000-...-0001` |
| fiscal_periods | id | شناسه دوره مالی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193fp00-...-08` |
| fiscal_periods | fiscal_year_id | شناسه سال مالی والد | UUID | NO | NO | fiscal_years(organization_id,id) | - | Composite FK | idx_fp_fy | Financial | System | same org | `0193fy00-...-1405` |
| fiscal_periods | period_number | شماره ترتیب دوره در سال | SMALLINT | NO | NO | - | - | UQ(organization_id,fiscal_year_id,period_number), CHECK(period_number>=1) | UQ | Financial | System | >= 1 | `8` |
| fiscal_periods | title_fa | نام دوره | VARCHAR(60) | NO | NO | - | - | - | - | Financial | System | non-empty | `آبان ۱۴۰۵` |
| fiscal_periods | start_date | تاریخ شروع میلادی دوره | DATE | NO | NO | - | - | - | idx_fp_range | Financial | System | valid date | `2026-10-23` |
| fiscal_periods | end_date | تاریخ پایان میلادی دوره | DATE | NO | NO | - | - | CHECK(end_date >= start_date) | idx_fp_range | Financial | System | >= start_date | `2026-11-21` |
| fiscal_periods | start_jalali | شروع شمسی | CHAR(10) | NO | NO | - | - | regex | - | Financial | System | valid Jalali | `1405/08/01` |
| fiscal_periods | end_jalali | پایان شمسی | CHAR(10) | NO | NO | - | - | regex | - | Financial | System | valid Jalali | `1405/08/30` |
| fiscal_periods | status | وضعیت قفل دوره | VARCHAR(20) | NO | NO | - | `'OPEN'` | IN('OPEN','SOFT_LOCKED','CLOSED') | idx_fp_status | Financial | CFO | enum | `OPEN` |

### ۱۷. جدول `period_locks`
* **مسئولیت:** لاگ تغییرناپذیر بستن و بازگشایی مجدد دوره‌های مالی. | **ارتباط:** متصل به `fiscal_periods` و `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only؛ فقط `INSERT`. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** `REOPEN` نیازمند مجوز سطح بالا (`CFO/Owner`) و دلیل کتبی است. | **ماژول:** `Fiscal/Audit`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| period_locks | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_pl_org | Financial | System | valid org | `0193a000-...-0001` |
| period_locks | id | شناسه رویداد قفل | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193pl00-...-0001` |
| period_locks | fiscal_period_id | دوره هدف | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | idx_pl_fp | Financial | System | same org | `0193fp00-...-08` |
| period_locks | lock_action | نوع عملیات (`LOCK`, `SOFT_LOCK`, `REOPEN`) | VARCHAR(20) | NO | NO | - | - | IN('LOCK','SOFT_LOCK','REOPEN') | - | Security | CFO | enum | `LOCK` |
| period_locks | actor_membership_id | درخواست/اجراکننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Security | System | valid member | `0193m000-...-0001` |
| period_locks | approved_by_membership_id | تاییدکننده بازگشایی | UUID | YES | NO | organization_memberships(organization_id,id) | NULL | Composite FK | - | Security | CFO | required if REOPEN | `0193m000-...-0002` |
| period_locks | reason | دلیل قانونی/عملیاتی تغییر وضعیت دوره | TEXT | NO | NO | - | - | LENGTH(reason) >= 5 | - | Audit | User | >=5 chars | `اتمام بررسی فاکتورهای آبان` |
| period_locks | occurred_at | زمان وقوع قفل/بازگشایی | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_pl_time | Audit | System | UTC | `2026-11-22T18:00Z` |

### ۱۸. جدول `accounting_policies`
* **مسئولیت:** ثبت صریح روش حسابداری، ارزش‌گذاری موجودی و تخصیص پرداخت سازمان به شکل تاریخ‌دار. | **ارتباط:** فرزند `organizations`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** نسخه جدید با تغییر سیاست (برای حفظ تاریخچه دوره‌های قبل). | **چرخه عمر:** تاریخ‌دار (`effective_from`). | **حذف:** `RESTRICT`. | **محدودیت مالی:** در صورت `UNSPECIFIED` بودن روش موجودی، ارزش‌گذاری ریالی متوقف می‌شود. | **ماژول:** `Fiscal/Processing`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| accounting_policies | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_ap_org | Financial | System | valid org | `0193a000-...-0001` |
| accounting_policies | id | شناسه نسخه سیاست | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193ap00-...-0001` |
| accounting_policies | effective_from | تاریخ شروع اعمال سیاست | DATE | NO | NO | - | - | UQ(organization_id,effective_from) | UQ | Financial | CFO | valid date | `2026-03-21` |
| accounting_policies | accounting_mode | مدل حسابداری فعال | VARCHAR(30) | NO | NO | - | `'SUB_LEDGER_FIRST'` | IN('SUB_LEDGER_FIRST','DOUBLE_ENTRY_READY') | - | Financial | System/CFO | enum | `SUB_LEDGER_FIRST` |
| accounting_policies | inventory_valuation_method | روش قیمت‌گذاری انبار | VARCHAR(30) | NO | NO | - | `'UNSPECIFIED'` | IN('WEIGHTED_AVERAGE','FIFO','UNSPECIFIED') | - | Financial | CFO | enum | `WEIGHTED_AVERAGE` |
| accounting_policies | payment_allocation_method | روش پیش‌فرض تخصیص پرداخت علی‌الحساب | VARCHAR(30) | NO | NO | - | `'EXPLICIT_OR_FIFO'` | IN('EXPLICIT_ONLY','EXPLICIT_OR_FIFO') | - | Financial | CFO | enum | `EXPLICIT_OR_FIFO` |

### ۱۹. جدول `units_of_measure`
* **مسئولیت:** کاتالوگ واحدهای اندازه‌گیری عمومی و سفارشی سازمان (عدد، بسته، کارتن، کیلوگرم). | **ارتباط:** والد `products`, `product_units`, `unit_conversions`, `invoice_lines`. | **مالکیت:** Hybrid (`organization_id NULL` برای واحدهای استاندارد). | **ایجاد/اصلاح:** Seed + Admin سازمان. | **چرخه عمر:** دائمی. | **حذف:** `RESTRICT`. | **محدودیت مالی:** نباید دو واحد هم‌نام در یک سازمان ایجاد شود. | **ماژول:** `Fiscal/Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| units_of_measure | id | شناسه واحد سنجش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Public/Internal | System | UUID | `0193uom0-...-0001` |
| units_of_measure | organization_id | سازمان مالک (NULL = واحد استاندارد عمومی) | UUID | YES | NO | organizations(id) | NULL | UQ(COALESCE(organization_id,'0000...'), code) | idx_uom_org | Internal | System/User | valid org/null | `NULL` |
| units_of_measure | code | کد انگلیسی استاندارد | VARCHAR(30) | NO | NO | - | - | - | UQ | Internal | System/User | uppercase | `CARTON` |
| units_of_measure | name_fa | نام فارسی واحد | VARCHAR(60) | NO | NO | - | - | - | - | Internal | System/User | non-empty | `کارتن` |
| units_of_measure | dimension | بعد فیزیکی واحد | VARCHAR(20) | NO | NO | - | `'COUNT'` | IN('COUNT','PACK','WEIGHT','VOLUME','LENGTH') | - | Internal | System | enum | `PACK` |
| units_of_measure | is_system | نشانگر واحد پایه سیستمی | BOOLEAN | NO | NO | - | false | - | - | Internal | System | boolean | `true` |

### ۲۰. جدول `unit_conversions`
* **مسئولیت:** قوانین تبدیل عمومی یا کالامحور بین دو واحد (مانند `1 kg = 1000 g` یا تبدیل سفارشی). *(برای تبدیل‌های استاندارد کالای پخش، `product_units` اولویت دارد)*. | **ارتباط:** متصل به `organizations`, `products`, `units_of_measure`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر انبار/حسابدار. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `conversion_factor > 0`. | **ماژول:** `Fiscal/Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| unit_conversions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_uc_org | Internal | System | valid org | `0193a000-...-0001` |
| unit_conversions | id | شناسه قانون تبدیل | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193uc00-...-0001` |
| unit_conversions | product_id | کالای خاص (NULL = قانون عمومی سازمان) | UUID | YES | NO | products(organization_id,id) | NULL | Composite FK | idx_uc_prod | Internal | User | same org | `NULL` |
| unit_conversions | from_uom_id | واحد مبدأ | UUID | NO | NO | units_of_measure(id) | - | ON DELETE RESTRICT | - | Internal | User | valid UoM | `0193uom0-...-KG` |
| unit_conversions | to_uom_id | واحد مقصد | UUID | NO | NO | units_of_measure(id) | - | CHECK(from_uom_id <> to_uom_id) | - | Internal | User | != from_uom | `0193uom0-...-GR` |
| unit_conversions | conversion_factor | ضریب تبدیل (`1 from = factor * to`) | NUMERIC(18,6) | NO | NO | - | - | CHECK(conversion_factor > 0) | - | Financial | User | > 0 | `1000.000000` |
| unit_conversions | is_active | وضعیت فعال بودن قاعده | BOOLEAN | NO | NO | - | true | - | - | Internal | User | boolean | `true` |

---

# بخش ۳: `Contacts & Entity Resolution` (جداول ۲۱ تا ۲۶)

### ۲۱. جدول `contacts`
* **مسئولیت:** مرجع واحد طرف‌های حساب (مشتری، تأمین‌کننده، ویزیتور/کارمند). | **ارتباط:** والد `contact_*`, `invoices`, `payments`, `checks`. | **مالکیت:** Tenant-owned (`UQ(organization_id, id)`). | **ایجاد/اصلاح:** کاربر یا فرآیند تایید `Entity Resolution`. | **چرخه عمر:** `ACTIVE -> MERGED | ARCHIVED`. | **حذف:** `RESTRICT` (در ادغام به `MERGED` می‌رود و حذف نمی‌شود). | **محدودیت مالی:** `credit_limit_irr >= 0`. | **ماژول:** `Contacts`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| contacts | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_con_org | Internal | System | valid org | `0193a000-...-0001` |
| contacts | id | شناسه یکتای طرف حساب | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193c000-...-0001` |
| contacts | canonical_name | نام رسمی استانداردشده در سیستم | VARCHAR(200) | NO | NO | - | - | - | GIN trgm | PII/Commercial | User/Verified | >=2 chars | `فروشگاه زنجیره‌ای پارسیان` |
| contacts | contact_kind | شخص حقیقی یا حقوقی | VARCHAR(20) | NO | NO | - | `'COMPANY'` | IN('PERSON','COMPANY') | - | Internal | User | enum | `COMPANY` |
| contacts | is_customer | نقش مشتری دارد | BOOLEAN | NO | NO | - | false | - | idx_con_cust | Commercial | User | boolean | `true` |
| contacts | is_supplier | نقش تأمین‌کننده دارد | BOOLEAN | NO | NO | - | false | - | idx_con_supp | Commercial | User | boolean | `false` |
| contacts | is_employee | نقش پرسنل/ویزیتور دارد | BOOLEAN | NO | NO | - | false | - | - | Internal | User | boolean | `false` |
| contacts | credit_limit_irr | سقف اعتبار فروش نسیه (ریال) | NUMERIC(18,0) | YES | NO | - | NULL | CHECK(credit_limit_irr >= 0) | - | Financial | CFO/SalesMgr | >= 0 | `2000000000` |
| contacts | status | وضعیت حیات رکورد | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('ACTIVE','MERGED','ARCHIVED') | idx_con_status | Internal | System | enum | `ACTIVE` |
| contacts | merged_into_contact_id | ارجاع به رکورد اصلی در صورت ادغام | UUID | YES | NO | contacts(organization_id,id) | NULL | CHECK(merged_into_contact_id <> id) | - | Audit | System | non-self | `NULL` |

### ۲۲. جدول `contact_roles`
* **مسئولیت:** نگهداری کدهای اختصاصی و ویژگی‌های هر نقش طرف حساب (وقتی یک شخص هم مشتری است و هم تأمین‌کننده). | **ارتباط:** فرزند `contacts`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر/Sync. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Contacts`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| contact_roles | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| contact_roles | id | شناسه نقش طرف حساب | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193cr00-...-0001` |
| contact_roles | contact_id | شناسه طرف حساب | UUID | NO | NO | contacts(organization_id,id) | - | Composite FK, UQ(organization_id,contact_id,role_type) | UQ | Commercial | User | same org | `0193c000-...-0001` |
| contact_roles | role_type | نوع نقش | VARCHAR(30) | NO | NO | - | - | IN('CUSTOMER','SUPPLIER','SALES_REP','BROKER','OTHER') | - | Commercial | User | enum | `CUSTOMER` |
| contact_roles | external_code | کد تفصیلی حسابداری در مبدأ | VARCHAR(64) | YES | NO | - | NULL | - | idx_cr_ext | Commercial | Sync/User | - | `1042` |
| contact_roles | is_active | فعال بودن نقش | BOOLEAN | NO | NO | - | true | - | - | Internal | User | boolean | `true` |

### ۲۳. جدول `contact_identifiers`
* **مسئولیت:** نگهداری شناسه‌های رسمی و بانکی طرف حساب (کد ملی، شناسه اقتصادی، موبایل، شبا) جهت یکتاسازی دقیق. | **ارتباط:** فرزند `contacts`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر/OCR تاییدشده. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** جلوگیری از ثبت دو طرف حساب فعال با شناسه ملی یکسان. | **ماژول:** `Contacts`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| contact_identifiers | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | PII | System | valid org | `0193a000-...-0001` |
| contact_identifiers | id | شناسه رکورد شناسه | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ci00-...-0001` |
| contact_identifiers | contact_id | طرف حساب مرتبط | UUID | NO | NO | contacts(organization_id,id) | - | Composite FK | idx_ci_con | PII | System | same org | `0193c000-...-0001` |
| contact_identifiers | identifier_type | نوع شناسه | VARCHAR(30) | NO | NO | - | - | IN('NATIONAL_ID','ECONOMIC_CODE','PHONE','MOBILE','IBAN','CARD_NO') | idx_ci_val | PII | User/OCR | enum | `NATIONAL_ID` |
| contact_identifiers | identifier_value | مقدار استانداردشده شناسه | VARCHAR(64) | NO | NO | - | - | UQ(organization_id,identifier_type,identifier_value) | UQ | Confidential | User/OCR | regex per type | `10103456789` |
| contact_identifiers | is_primary | شناسه اصلی برای این نوع | BOOLEAN | NO | NO | - | false | - | - | Internal | User | boolean | `true` |

### ۲۴. جدول `contact_addresses`
* **مسئولیت:** آدرس‌های تحویل، فروشگاه یا دفتر مشتری (کاربرد در تحلیل مسیرهای پخش). | **ارتباط:** فرزند `contacts`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر/OCR. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Contacts/Distribution`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| contact_addresses | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | PII | System | valid org | `0193a000-...-0001` |
| contact_addresses | id | شناسه آدرس | UUID | NO | YES | - | gen_random_uuid() | - | PK | PII | System | UUID | `0193ca00-...-0001` |
| contact_addresses | contact_id | طرف حساب | UUID | NO | NO | contacts(organization_id,id) | - | Composite FK | idx_ca_con | PII | User | same org | `0193c000-...-0001` |
| contact_addresses | label | عنوان محل | VARCHAR(60) | NO | NO | - | `'اصلی'` | - | - | Internal | User | non-empty | `شعبه غرب` |
| contact_addresses | province | استان | VARCHAR(80) | YES | NO | - | NULL | - | idx_ca_city | PII | User | - | `تهران` |
| contact_addresses | city | شهر | VARCHAR(80) | YES | NO | - | NULL | - | idx_ca_city | PII | User | - | `تهران` |
| contact_addresses | street_address | نشانی کامل | TEXT | NO | NO | - | - | - | - | PII | User/OCR | non-empty | `خیابان آزادی، پلاک ۱۲۰` |
| contact_addresses | postal_code | کد پستی ۱۰ رقمی | CHAR(10) | YES | NO | - | NULL | CHECK(postal_code ~ '^[0-9]{10}$') | - | PII | User/OCR | 10 digits | `1458812345` |

### ۲۵. جدول `entity_match_candidates`
* **مسئولیت:** نگهداری پیشنهادهای تطبیق احتمالی نام طرف حساب یا کالا پیش از تایید انسان. | **ارتباط:** متصل به `organizations` و شناسه کاندیدا (`contacts`/`products`). | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** موتور Entity Resolution ایجاد و کاربر وضعیت آن را تغییر می‌دهد. | **چرخه عمر:** `PENDING -> CONFIRMED_MATCH | CONFIRMED_NEW | REJECTED`. | **حذف:** نگه‌داری برای ممیزی. | **محدودیت مالی:** کاندیدای `PENDING` نباید به طور خودکار در `invoices (Posted)` استفاده شود. | **ماژول:** `Normalization`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entity_match_candidates | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_emc_org | Internal | System | valid org | `0193a000-...-0001` |
| entity_match_candidates | id | شناسه پیشنهاد تطبیق | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193emc0-...-0001` |
| entity_match_candidates | entity_domain | دامنه موجودیت (`CONTACT` یا `PRODUCT`) | VARCHAR(20) | NO | NO | - | - | IN('CONTACT','PRODUCT') | idx_emc_pend | Internal | System | enum | `CONTACT` |
| entity_match_candidates | source_raw_name | نام خام استخراج‌شده از سند | VARCHAR(250) | NO | NO | - | - | - | - | Commercial | OCR/Import | non-empty | `هایپر پارسیان` |
| entity_match_candidates | candidate_entity_id | شناسه موجودیت کاندید در دیتابیس | UUID | NO | NO | - | - | - | idx_emc_cand | Internal | AI/Fuzzy | valid UUID | `0193c000-...-0001` |
| entity_match_candidates | match_score | امتیاز تشابه (`0.0000` تا `1.0000`) | NUMERIC(5,4) | NO | NO | - | - | BETWEEN 0 AND 1 | - | Internal | AI/Fuzzy | 0..1 | `0.8400` |
| entity_match_candidates | match_method | روش تشخیص (`FUZZY_NAME`, `PHONE`, `TAX_ID`) | VARCHAR(30) | NO | NO | - | - | - | - | Internal | System | non-empty | `FUZZY_NAME` |
| entity_match_candidates | review_status | وضعیت بررسی انسانی | VARCHAR(25) | NO | NO | - | `'PENDING'` | IN('PENDING','CONFIRMED_MATCH','CONFIRMED_NEW','REJECTED') | idx_emc_pend | Audit | User | enum | `PENDING` |
| entity_match_candidates | reviewed_by_membership_id | عضو بررسی‌کننده | UUID | YES | NO | organization_memberships(organization_id,id) | NULL | Composite FK | - | Audit | User | same org | `0193m000-...-0001` |
| entity_match_candidates | reviewed_at | زمان تصمیم انسانی | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Audit | System | UTC | `2026-11-13T11:20Z` |

### ۲۶. جدول `entity_merge_history`
* **مسئولیت:** ثبت تغییرناپذیر تاریخچه ادغام دو مشتری یا دو کالا. | **ارتباط:** متصل به `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** هنگام ادغام باید ارجاعات تاریخی به رکورد مقصد قابل ردیابی بمانند. | **ماژول:** `Normalization/Audit`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entity_merge_history | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_emh_org | Audit | System | valid org | `0193a000-...-0001` |
| entity_merge_history | id | شناسه رویداد ادغام | UUID | NO | YES | - | gen_random_uuid() | - | PK | Audit | System | UUID | `0193emh0-...-0001` |
| entity_merge_history | entity_domain | دامنه ادغام‌شده (`CONTACT` یا `PRODUCT`) | VARCHAR(20) | NO | NO | - | - | IN('CONTACT','PRODUCT') | - | Audit | System | enum | `CONTACT` |
| entity_merge_history | source_entity_id | شناسه رکورد ادغام‌شده (قدیمی) | UUID | NO | NO | - | - | - | idx_emh_src | Audit | User | valid UUID | `0193c000-...-0099` |
| entity_merge_history | target_entity_id | شناسه رکورد مرجع (باقیمانده) | UUID | NO | NO | - | - | CHECK(source_entity_id <> target_entity_id) | idx_emh_tgt | Audit | User | != source | `0193c000-...-0001` |
| entity_merge_history | merged_by_membership_id | کاربر اجراکننده ادغام | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| entity_merge_history | reason | علت ادغام | TEXT | NO | NO | - | - | - | - | Audit | User | non-empty | `شناسه ملی یکسان در دو فاکتور` |
| entity_merge_history | merged_at | زمان ادغام | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T11:25Z` |

---

# بخش ۴: `Product & Inventory` (جداول ۲۷ تا ۳۵)

### ۲۷. جدول `product_categories`
* **مسئولیت:** دسته‌بندی درختی کالاها و خدمات (مانند لبنیات ← پنیر). | **ارتباط:** خودارجاع + والد `products`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر انبار/سیستم. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| product_categories | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id), UQ(organization_id,code) | idx_pc_org | Commercial | System | valid org | `0193a000-...-0001` |
| product_categories | id | شناسه دسته‌بندی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Commercial | System | UUID | `0193pc00-...-0001` |
| product_categories | parent_category_id | شناسه دسته والد | UUID | YES | NO | product_categories(organization_id,id) | NULL | CHECK(parent_category_id <> id) | - | Commercial | User | non-self | `NULL` |
| product_categories | code | کد دسته | VARCHAR(40) | NO | NO | - | - | - | UQ | Commercial | User | non-empty | `CAT-FOOD` |
| product_categories | name_fa | نام دسته | VARCHAR(120) | NO | NO | - | - | - | - | Commercial | User | non-empty | `مواد غذایی کنسروی` |

### ۲۸. جدول `products`
* **مسئولیت:** تعریف کالا یا خدمت با واحد پایه و تنظیمات انبار/انقضا. | **ارتباط:** والد `product_units`, `product_identifiers`, `invoice_lines`, `inventory_movements`, `stock_snapshots`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر مجاز. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `base_uom_id` پس از اولین `inventory_movement` غیرقابل تغییر است. | **ماژول:** `Product/Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| products | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id), UQ(organization_id,sku) | idx_prod_org | Commercial | System | valid org | `0193a000-...-0001` |
| products | id | شناسه یکتای کالا | UUID | NO | YES | - | gen_random_uuid() | - | PK | Commercial | System | UUID | `0193pr00-...-0001` |
| products | sku | کد کالای یکتا درون سازمان | VARCHAR(64) | NO | NO | - | - | - | UQ | Commercial | User/Sync | non-empty | `TOM-800G` |
| products | canonical_name | نام استاندارد کالا | VARCHAR(200) | NO | NO | - | - | - | GIN trgm | Commercial | User/Verified | >=2 chars | `رب گوجه‌فرنگی ۸۰۰ گرمی` |
| products | category_id | دسته‌بندی کالا | UUID | YES | NO | product_categories(organization_id,id) | NULL | Composite FK | idx_prod_cat | Commercial | User | same org | `0193pc00-...-0001` |
| products | product_type | کالا یا خدمت | VARCHAR(20) | NO | NO | - | `'GOODS'` | IN('GOODS','SERVICE') | - | Commercial | User | enum | `GOODS` |
| products | base_uom_id | واحد پایه محاسبه موجودی | UUID | NO | NO | units_of_measure(id) | - | ON DELETE RESTRICT | - | Financial | User | valid UoM | `0193uom0-...-PCS` |
| products | reorder_point_base_qty | نقطه سفارش بحرانی به واحد پایه | NUMERIC(18,4) | YES | NO | - | NULL | CHECK(reorder_point_base_qty >= 0) | - | Commercial | InventoryMgr | >= 0 | `120.0000` |
| products | track_expiry | نیاز به پایش تاریخ انقضا | BOOLEAN | NO | NO | - | false | - | - | Commercial | User | boolean | `true` |
| products | is_active | فعال بودن کالا | BOOLEAN | NO | NO | - | true | - | idx_prod_act | Commercial | User | boolean | `true` |

### ۲۹. جدول `product_identifiers`
* **مسئولیت:** نگاشت بارکدها، ایران‌کد و شناسه کالای مالیاتی به کالا. | **ارتباط:** فرزند `products`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر/Sync. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** یک بارکد یکتا درون سازمان. | **ماژول:** `Product`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| product_identifiers | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| product_identifiers | id | شناسه رکورد | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193pi00-...-0001` |
| product_identifiers | product_id | کالا | UUID | NO | NO | products(organization_id,id) | - | Composite FK | idx_pi_prod | Commercial | User | same org | `0193pr00-...-0001` |
| product_identifiers | identifier_type | نوع کد | VARCHAR(30) | NO | NO | - | - | IN('BARCODE','IRAN_CODE','TAX_ITEM_ID','SUPPLIER_SKU') | idx_pi_val | Commercial | User/Sync | enum | `BARCODE` |
| product_identifiers | identifier_value | مقدار کد | VARCHAR(64) | NO | NO | - | - | UQ(organization_id,identifier_type,identifier_value) | UQ | Commercial | User/Sync | non-empty | `6260123456789` |

### ۳۰. جدول `product_units`
* **مسئولیت:** تعریف واحدهای فرعی هر کالا (مانند کارتن ۱۲تایی) و قیمت استاندارد خرید/فروش هر واحد. | **ارتباط:** فرزند `products`, متصل به `units_of_measure`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر/حسابدار/مدیر انبار. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `conversion_to_base > 0`. | **ماژول:** `Product/Distribution`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| product_units | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| product_units | id | شناسه واحد کالا | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193pu00-...-0001` |
| product_units | product_id | کالا | UUID | NO | NO | products(organization_id,id) | - | Composite FK, UQ(organization_id,product_id,uom_id) | UQ | Commercial | User | same org | `0193pr00-...-0001` |
| product_units | uom_id | واحد فرعی (مثلاً کارتن) | UUID | NO | NO | units_of_measure(id) | - | ON DELETE RESTRICT | - | Commercial | User | valid UoM | `0193uom0-...-CTN` |
| product_units | conversion_to_base | تعداد واحد پایه در هر ۱ واحد فرعی | NUMERIC(18,6) | NO | NO | - | - | CHECK(conversion_to_base > 0) | - | Financial | User | > 0 | `12.000000` |
| product_units | default_purchase_price_irr | قیمت خرید مرجع این واحد (ریال) | NUMERIC(20,4) | YES | NO | - | NULL | CHECK(default_purchase_price_irr >= 0) | - | Commercial | User | >= 0 | `6000000.0000` |
| product_units | default_sale_price_irr | قیمت فروش مرجع این واحد (ریال) | NUMERIC(20,4) | YES | NO | - | NULL | CHECK(default_sale_price_irr >= 0) | - | Commercial | User | >= 0 | `7200000.0000` |
| product_units | is_purchase_default | واحد پیش‌فرض هنگام خرید | BOOLEAN | NO | NO | - | false | - | - | Commercial | User | boolean | `true` |
| product_units | is_sale_default | واحد پیش‌فرض هنگام فروش | BOOLEAN | NO | NO | - | false | - | - | Commercial | User | boolean | `false` |

### ۳۱. جدول `warehouses`
* **مسئولیت:** تعریف انبارهای فیزیکی یا مجازی (مانند انبار خودرو پخش). | **ارتباط:** متصل به `branches`؛ والد `inventory_locations`, `inventory_movements`, `stock_snapshots`. | **مالکیت:** Tenant-owned (`UQ(organization_id, id)`). | **ایجاد/اصلاح:** مدیر انبار/سیستم. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| warehouses | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id), UQ(organization_id,code) | idx_wh_org | Internal | System | valid org | `0193a000-...-0001` |
| warehouses | id | شناسه انبار | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193wh00-...-0001` |
| warehouses | branch_id | شعبه مالک انبار | UUID | NO | NO | branches(organization_id,id) | - | Composite FK | idx_wh_br | Internal | User | same org | `0193a100-...-0001` |
| warehouses | code | کد انبار | VARCHAR(32) | NO | NO | - | - | - | UQ | Internal | User | non-empty | `WH-THR-01` |
| warehouses | name | نام انبار | VARCHAR(150) | NO | NO | - | - | - | - | Internal | User | non-empty | `انبار مرکزی تهران` |
| warehouses | is_default | انبار پیش‌فرض شعبه | BOOLEAN | NO | NO | - | false | - | - | Internal | Admin | boolean | `true` |
| warehouses | is_active | وضعیت فعالیت | BOOLEAN | NO | NO | - | true | - | - | Internal | Admin | boolean | `true` |

### ۳۲. جدول `inventory_locations`
* **مسئولیت:** قفسه، سالن یا جایگاه داخل یک انبار (اختیاری). | **ارتباط:** فرزند `warehouses`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر انبار. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inventory_locations | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| inventory_locations | id | شناسه جایگاه | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193il00-...-0001` |
| inventory_locations | warehouse_id | انبار والد | UUID | NO | NO | warehouses(organization_id,id) | - | Composite FK, UQ(organization_id,warehouse_id,code) | UQ | Internal | User | same org | `0193wh00-...-0001` |
| inventory_locations | code | کد قفسه/زون | VARCHAR(40) | NO | NO | - | - | - | UQ | Internal | User | non-empty | `A-01-R2` |
| inventory_locations | zone_name | نام بخش انبار | VARCHAR(100) | YES | NO | - | NULL | - | - | Internal | User | - | `سردخانه` |
| inventory_locations | is_active | فعال بودن | BOOLEAN | NO | NO | - | true | - | - | Internal | User | boolean | `true` |

### ۳۳. جدول `inventory_movements`
* **مسئولیت:** دفتر کل رویدادهای ورود و خروج کالا برای بازسازی دقیق موجودی. | **ارتباط:** متصل به `warehouses`, `products`, `fiscal_periods`, `documents`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only پس از `Posted`؛ اصلاح فقط با حرکت معکوس. | **چرخه عمر:** `VERIFIED -> POSTED -> REVERSED`. | **حذف:** ممنوع. | **محدودیت مالی:** `base_qty_signed <> 0`، علامت همسو با `movement_type`. | **ماژول:** `Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inventory_movements | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_im_org | Financial | System | valid org | `0193a000-...-0001` |
| inventory_movements | id | شناسه گردش انبار | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193im00-...-0001` |
| inventory_movements | warehouse_id | انبار محل حرکت | UUID | NO | NO | warehouses(organization_id,id) | - | Composite FK | idx_im_stock | Commercial | System | same org | `0193wh00-...-0001` |
| inventory_movements | product_id | کالا | UUID | NO | NO | products(organization_id,id) | - | Composite FK | idx_im_stock | Commercial | System | same org | `0193pr00-...-0001` |
| inventory_movements | movement_type | نوع گردش انبار | VARCHAR(25) | NO | NO | - | - | IN('OPENING','PURCHASE_IN','SALE_OUT','RETURN_IN','RETURN_OUT','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT') | idx_im_type | Financial | System | enum | `PURCHASE_IN` |
| inventory_movements | source_uom_id | واحد اصلی ثبت‌شده در سند | UUID | NO | NO | units_of_measure(id) | - | ON DELETE RESTRICT | - | Commercial | User/OCR | valid UoM | `0193uom0-...-CTN` |
| inventory_movements | source_qty | مقدار در واحد سند (مثبت) | NUMERIC(18,4) | NO | NO | - | - | CHECK(source_qty > 0) | - | Commercial | User/OCR | > 0 | `10.0000` |
| inventory_movements | base_qty_signed | مقدار تبدیل‌شده به واحد پایه با علامت (+/-) | NUMERIC(18,4) | NO | NO | - | - | CHECK(base_qty_signed <> 0) | idx_im_stock | Financial | Engine | != 0 | `+120.0000` |
| inventory_movements | unit_cost_irr | بهای تمام‌شده هر واحد پایه (ریال) | NUMERIC(20,4) | YES | NO | - | NULL | CHECK(unit_cost_irr >= 0) | - | Confidential | Engine | >= 0 | `500000.0000` |
| inventory_movements | total_cost_irr | بهای کل حرکت (ریال) | NUMERIC(18,0) | YES | NO | - | NULL | CHECK(total_cost_irr >= 0) | - | Confidential | Engine | >= 0 | `60000000` |
| inventory_movements | occurred_at | تاریخ و ساعت واقعی حرکت | TIMESTAMPTZ | NO | NO | - | - | - | idx_im_stock | Financial | Document | valid UTC | `2026-11-01T09:00Z` |
| inventory_movements | occurred_jalali | تاریخ شمسی متناظر | CHAR(10) | NO | NO | - | - | regex | - | Financial | System | valid Jalali | `1405/08/10` |
| inventory_movements | fiscal_period_id | دوره مالی | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | - | Financial | System | OPEN period | `0193fp00-...-08` |
| inventory_movements | source_record_type | نوع سند منشأ (`INVOICE`, `ADJUSTMENT`, `SNAPSHOT`) | VARCHAR(30) | NO | NO | - | - | - | idx_im_src | Provenance | System | enum | `INVOICE` |
| inventory_movements | source_record_id | شناسه سند منشأ | UUID | NO | NO | - | - | - | idx_im_src | Provenance | System | valid UUID | `0193iv00-...-0001` |
| inventory_movements | status | وضعیت ثبت | VARCHAR(20) | NO | NO | - | `'POSTED'` | IN('VERIFIED','POSTED','REVERSED') | - | Financial | System | enum | `POSTED` |
| inventory_movements | reversed_movement_id | ارجاع به حرکت معکوس‌کننده | UUID | YES | NO | inventory_movements(organization_id,id) | NULL | Composite FK | - | Audit | System | same org | `NULL` |
| inventory_movements | idempotency_key | کلید جلوگیری از ثبت تکراری | VARCHAR(128) | NO | NO | - | - | UQ(organization_id,idempotency_key) | UQ | System | System | unique hash | `im_inv1_line1_v1` |

### ۳۴. جدول `inventory_adjustments`
* **مسئولیت:** سند تعدیل کسری/اضافه انبارگردانی یا ضایعات پیش از ثبت حرکات در `inventory_movements`. | **ارتباط:** متصل به `warehouses`, `fiscal_periods`, `documents`, `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر انبار ایجاد و مدیر مالی تایید می‌کند. | **چرخه عمر:** `Needs Review -> Verified -> Posted -> Reversed`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** نیازمند `approved_by_membership_id` برای `Posted`. | **ماژول:** `Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inventory_adjustments | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| inventory_adjustments | id | شناسه سند تعدیل | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193ia00-...-0001` |
| inventory_adjustments | warehouse_id | انبار هدف | UUID | NO | NO | warehouses(organization_id,id) | - | Composite FK | - | Commercial | User | same org | `0193wh00-...-0001` |
| inventory_adjustments | adjustment_no | شماره سند تعدیل | VARCHAR(40) | NO | NO | - | - | UQ(organization_id,adjustment_no) | UQ | Financial | User/System | non-empty | `ADJ-1405-012` |
| inventory_adjustments | reason_code | دلیل تعدیل (`COUNT_VARIANCE`, `DAMAGED`, `EXPIRED`) | VARCHAR(30) | NO | NO | - | - | - | - | Audit | User | enum | `COUNT_VARIANCE` |
| inventory_adjustments | occurred_at | تاریخ وقوع | TIMESTAMPTZ | NO | NO | - | - | - | - | Financial | User | UTC | `2026-11-10T16:00Z` |
| inventory_adjustments | fiscal_period_id | دوره مالی | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | - | Financial | System | OPEN period | `0193fp00-...-08` |
| inventory_adjustments | document_id | سند پشتیبان (صورتجلسه انبار) | UUID | YES | NO | documents(organization_id,id) | NULL | Composite FK | - | Provenance | User | same org | `0193d000-...-0009` |
| inventory_adjustments | status | وضعیت تایید | VARCHAR(20) | NO | NO | - | `'Needs Review'` | IN('Needs Review','Verified','Posted','Reversed') | - | Financial | System | enum | `Posted` |
| inventory_adjustments | approved_by_membership_id | تاییدکننده نهایی | UUID | YES | NO | organization_memberships(organization_id,id) | NULL | Composite FK | - | Audit | Approver | required if Posted | `0193m000-...-0002` |

### ۳۵. جدول `stock_snapshots`
* **مسئولیت:** ثبت موجودی اول دوره یا نقطه مرجع شمارش انبار برای شتاب‌دهی محاسبه و مغایرت‌گیری با فایل انبار. | **ارتباط:** متصل به `warehouses`, `products`, `documents`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Import یا بستن دوره. | **چرخه عمر:** تاریخ‌دار (`as_of_date`). | **حذف:** `RESTRICT`. | **محدودیت مالی:** `base_qty_on_hand >= 0` برای Snapshot معتبر. | **ماژول:** `Inventory`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| stock_snapshots | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_ss_lookup | Financial | System | valid org | `0193a000-...-0001` |
| stock_snapshots | id | شناسه Snapshot | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193ss00-...-0001` |
| stock_snapshots | warehouse_id | انبار | UUID | NO | NO | warehouses(organization_id,id) | - | Composite FK | idx_ss_lookup | Commercial | System | same org | `0193wh00-...-0001` |
| stock_snapshots | product_id | کالا | UUID | NO | NO | products(organization_id,id) | - | Composite FK | idx_ss_lookup | Commercial | System | same org | `0193pr00-...-0001` |
| stock_snapshots | as_of_date | تاریخ مرجع موجودی | DATE | NO | NO | - | - | - | idx_ss_lookup | Financial | User/Engine | valid date | `2026-10-22` |
| stock_snapshots | base_qty_on_hand | موجودی به واحد پایه | NUMERIC(18,4) | NO | NO | - | - | - | - | Financial | Import/Engine | decimal | `500.0000` |
| stock_snapshots | valuation_method | روش قیمت‌گذاری هنگام اسنپ‌شات | VARCHAR(30) | NO | NO | - | `'UNSPECIFIED'` | IN('WEIGHTED_AVERAGE','FIFO','UNSPECIFIED') | - | Financial | Engine | enum | `WEIGHTED_AVERAGE` |
| stock_snapshots | total_value_irr | ارزش کل ریالی (اختیاری اگر سیاست مشخص باشد) | NUMERIC(18,0) | YES | NO | - | NULL | CHECK(total_value_irr >= 0) | - | Confidential | Engine | >= 0 | `250000000` |
| stock_snapshots | source_type | منشأ (`OPENING_BALANCE`, `EXTERNAL_FILE`, `SYSTEM_CHECKPOINT`) | VARCHAR(30) | NO | NO | - | - | - | - | Provenance | System | enum | `EXTERNAL_FILE` |
| stock_snapshots | document_id | فایل گزارش انبار مبدأ | UUID | YES | NO | documents(organization_id,id) | NULL | Composite FK | - | Provenance | User | same org | `0193d000-...-0010` |
| stock_snapshots | is_canonical | آیا مبنای رسمی داخلی است یا صرفاً فایل مقایسه‌ای | BOOLEAN | NO | NO | - | false | - | - | Financial | System | boolean | `false` |

---

# بخش ۵: `Document Management` (جداول ۳۶ تا ۴۳)

### ۳۶. جدول `document_types`
* **مسئولیت:** کاتالوگ انواع اسناد ورودی (`SALES_INVOICE`, `PURCHASE_INVOICE`, `PAYMENT_RECEIPT`, `INVENTORY_REPORT`, `BANK_STATEMENT`, `CHEQUE`, `DEBT_LIST`, `PERSONAL_RECEIPT`, `UNKNOWN`). | **ارتباط:** والد `documents`, `extraction_attempts`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Seed. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Documents`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document_types | id | شناسه نوع سند | UUID | NO | YES | - | gen_random_uuid() | - | PK | Public | System | UUID | `0193dt00-...-0001` |
| document_types | code | کد استاندارد نوع سند | VARCHAR(40) | NO | NO | - | - | UNIQUE | UQ | Public | System | uppercase | `SALES_INVOICE` |
| document_types | name_fa | عنوان فارسی نوع سند | VARCHAR(100) | NO | NO | - | - | - | - | Public | System | non-empty | `فاکتور فروش` |
| document_types | target_domain | حوزه مقصد پردازش | VARCHAR(30) | NO | NO | - | - | - | - | Internal | System | enum | `FINANCIAL` |

### ۳۷. جدول `document_batches`
* **مسئولیت:** گروه‌بندی چند فایل یا چند عکس گرفته‌شده در یک جلسه آپلود. | **ارتباط:** والد `documents`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر یا Sync. | **چرخه عمر:** `OPEN -> PROCESSING -> COMPLETED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Documents`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document_batches | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_db_org | Internal | System | valid org | `0193a000-...-0001` |
| document_batches | id | شناسه دسته اسناد | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193db00-...-0001` |
| document_batches | title | عنوان دسته | VARCHAR(150) | YES | NO | - | NULL | - | - | Internal | User | - | `فاکتورهای مهر ۱۴۰۵` |
| document_batches | upload_channel | کانال ورود | VARCHAR(30) | NO | NO | - | - | IN('MOBILE_CAMERA','WEB_UPLOAD','EXCEL_IMPORT','ZIP_UPLOAD','API','WINDOWS_AGENT') | - | Internal | System | enum | `MOBILE_CAMERA` |
| document_batches | uploaded_by_membership_id | عضو بارگذار | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| document_batches | total_files | تعداد فایل‌های دسته | INTEGER | NO | NO | - | 0 | >= 0 | - | Internal | System | >= 0 | `5` |
| document_batches | status | وضعیت دسته | VARCHAR(20) | NO | NO | - | `'OPEN'` | IN('OPEN','PROCESSING','COMPLETED','PARTIAL_FAILED') | - | Internal | System | enum | `PROCESSING` |

### ۳۸. جدول `document_storage_objects`
* **مسئولیت:** اشاره به فایل فیزیکی رمزنگاری‌شده در S3/MinIO با نگهداری هش برای تشخیص تکراری و محافظت از فایل خام. | **ارتباط:** والد `document_versions`, `document_pages`, `report_outputs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام آپلود فایل (Immutable). | **چرخه عمر:** تحت کنترل `data_retention_policies`. | **حذف:** ممنوع برای فایل‌های متصل به اسناد `Posted`. | **محدودیت مالی:** ندارد. | **ماژول:** `Storage`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document_storage_objects | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_dso_org | Internal | System | valid org | `0193a000-...-0001` |
| document_storage_objects | id | شناسه آبجکت ذخیره‌سازی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193dso0-...-0001` |
| document_storage_objects | storage_provider | ارائه‌دهنده فضا (`S3`, `MINIO`) | VARCHAR(20) | NO | NO | - | `'S3'` | - | - | Internal | System | non-empty | `S3` |
| document_storage_objects | bucket_name | نام باکت | VARCHAR(100) | NO | NO | - | - | - | - | Internal | System | non-empty | `erpkian-docs-prod` |
| document_storage_objects | object_key | مسیر کلید فایل با پیشوند سازمان | VARCHAR(512) | NO | NO | - | - | UNIQUE | UQ | Confidential | System | starts with org_id | `0193a000.../raw.jpg` |
| document_storage_objects | mime_type | نوع واقعی تشخیص‌داده‌شده فایل | VARCHAR(100) | NO | NO | - | - | - | - | Internal | System | valid MIME | `application/pdf` |
| document_storage_objects | byte_size | حجم فایل به بایت | BIGINT | NO | NO | - | - | CHECK(byte_size > 0) | - | Internal | System | > 0 | `1450200` |
| document_storage_objects | sha256_hash | هش فایل برای تشخیص فایل تکراری | CHAR(64) | NO | NO | - | - | - | idx_dso_hash | Internal | System | 64 hex | `e3b0c442...` |
| document_storage_objects | is_immutable_original | نشانگر فایل خام اصلی (غیرقابل جایگزینی) | BOOLEAN | NO | NO | - | true | - | - | Audit | System | boolean | `true` |

### ۳۹. جدول `documents`
* **مسئولیت:** پرونده منطقی سند ورودی و نگهداری چرخه عمر ۶مرحله‌ای. | **ارتباط:** والد `document_versions`, `document_relations`, `extraction_jobs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام بارگذاری؛ تغییر وضعیت فقط توسط Engine/Approver. | **چرخه عمر:** `Uploaded -> Processing -> Needs Review -> Verified -> Eligible for Posting -> Posted | Rejected`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** سند `Needs Review` داده قطعی نیست. | **ماژول:** `Documents`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| documents | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_doc_org | Internal | System | valid org | `0193a000-...-0001` |
| documents | id | شناسه سند | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193d000-...-0001` |
| documents | batch_id | دسته آپلود | UUID | YES | NO | document_batches(organization_id,id) | NULL | Composite FK | idx_doc_batch | Internal | System | same org | `0193db00-...-0001` |
| documents | branch_id | شعبه مرتبط | UUID | YES | NO | branches(organization_id,id) | NULL | Composite FK | - | Internal | User | same org | `0193a100-...-0001` |
| documents | document_type_id | نوع سند تشخیص‌داده‌شده یا انتخابی | UUID | NO | NO | document_types(id) | - | ON DELETE RESTRICT | idx_doc_type | Internal | User/AI | valid type | `0193dt00-...-0001` |
| documents | original_filename | نام اولیه فایل کاربر | VARCHAR(255) | NO | NO | - | - | - | - | Internal | User | non-empty | `factor_mehr.pdf` |
| documents | source_channel | کانال ورود | VARCHAR(30) | NO | NO | - | - | IN('MOBILE_CAMERA','WEB_UPLOAD','EXCEL_IMPORT','CSV_IMPORT','API','WINDOWS_AGENT') | - | Provenance | System | enum | `WEB_UPLOAD` |
| documents | lifecycle_status | وضعیت استاندارد سند | VARCHAR(25) | NO | NO | - | `'Uploaded'` | IN('Uploaded','Processing','Needs Review','Verified','Eligible for Posting','Posted','Rejected') | idx_doc_status | Financial | Engine | enum | `Needs Review` |
| documents | duplicate_of_document_id | ارجاع به سند قبلی در صورت تکرار فایل | UUID | YES | NO | documents(organization_id,id) | NULL | CHECK(duplicate_of_document_id <> id) | - | Audit | System | non-self | `NULL` |
| documents | uploaded_by_membership_id | عضو بارگذار | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| documents | uploaded_at | زمان آپلود | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_doc_status | Audit | System | UTC | `2026-11-13T10:15Z` |

### ۴۰. جدول `document_versions`
* **مسئولیت:** نگهداری نسخه خام اصلی در کنار نسخه‌های بهبودیافته تصویر یا PDF ادغام‌شده. | **ارتباط:** فرزند `documents`، والد `document_pages`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only برای هر پردازش تصویر جدید. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** نسخه ۱ همیشه `ORIGINAL` باقی می‌ماند. | **ماژول:** `Documents`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document_versions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| document_versions | id | شناسه نسخه سند | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193dv00-...-0001` |
| document_versions | document_id | سند والد | UUID | NO | NO | documents(organization_id,id) | - | Composite FK, UQ(organization_id,document_id,version_number) | UQ | Internal | System | same org | `0193d000-...-0001` |
| document_versions | version_number | شماره نسخه (`1, 2, ...`) | INTEGER | NO | NO | - | - | CHECK(version_number >= 1) | UQ | Internal | System | >= 1 | `1` |
| document_versions | version_kind | نوع نسخه | VARCHAR(30) | NO | NO | - | - | IN('ORIGINAL','IMAGE_ENHANCED','MERGED_PDF','USER_CROPPED') | - | Provenance | System/User | enum | `MERGED_PDF` |
| document_versions | storage_object_id | فایل فیزیکی در Storage | UUID | NO | NO | document_storage_objects(organization_id,id) | - | Composite FK | - | Internal | System | same org | `0193dso0-...-0001` |
| document_versions | page_count | تعداد کل صفحات این نسخه | INTEGER | NO | NO | - | 1 | CHECK(page_count >= 1) | - | Internal | System | >= 1 | `3` |
| document_versions | created_at | زمان ایجاد نسخه | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T10:15Z` |

### ۴۱. جدول `document_pages`
* **مسئولیت:** مدیریت ترتیب، زاویه و امتیاز وضوح تک‌تک صفحات یک سند چندصفحه‌ای. | **ارتباط:** فرزند `document_versions`، والد `ocr_page_results`, `extracted_fields`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام جداسازی صفحات PDF یا چرخش تصویر. | **چرخه عمر:** همراه نسخه. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Documents/OCR`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document_pages | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| document_pages | id | شناسه صفحه | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193dp00-...-0001` |
| document_pages | document_version_id | نسخه سند والد | UUID | NO | NO | document_versions(organization_id,id) | - | Composite FK, UQ(organization_id,document_version_id,page_number) | UQ | Internal | System | same org | `0193dv00-...-0001` |
| document_pages | page_number | شماره ترتیب صفحه | INTEGER | NO | NO | - | - | CHECK(page_number >= 1) | UQ | Internal | System | >= 1 | `1` |
| document_pages | storage_object_id | تصویر رندر/برش‌خورده صفحه | UUID | NO | NO | document_storage_objects(organization_id,id) | - | Composite FK | - | Internal | System | same org | `0193dso0-...-0002` |
| document_pages | rotation_deg | زاویه چرخش اعمال‌شده | SMALLINT | NO | NO | - | 0 | IN(0,90,180,270) | - | Internal | User/Python | 0/90/180/270 | `0` |
| document_pages | quality_score | امتیاز کیفیت/وضوح تصویر (`0..1`) | NUMERIC(5,4) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Quality | Python/OpenCV | 0..1 | `0.9150` |
| document_pages | is_blurry_flagged | هشدار تار بودن یا ناخوانا بودن | BOOLEAN | NO | NO | - | false | - | - | Quality | Python/OpenCV | boolean | `false` |

### ۴۲. جدول `document_relations`
* **مسئولیت:** جدول میانی `M:N` برای اتصال چند سند به یک رکورد مالی یا یک سند چندبرگی به چند رکورد مالی. | **ارتباط:** متصل به `documents` و انواع رکوردهای مالی. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام لینک کردن سند به فاکتور/دریافت/تعدیل. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT` پس از `Posted`. | **محدودیت مالی:** ردیابی کامل شواهد. | **ماژول:** `Documents/Financial`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document_relations | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_dr_org | Provenance | System | valid org | `0193a000-...-0001` |
| document_relations | id | شناسه رابطه سند | UUID | NO | YES | - | gen_random_uuid() | - | PK | Provenance | System | UUID | `0193dr00-...-0001` |
| document_relations | document_id | سند پشتیبان | UUID | NO | NO | documents(organization_id,id) | - | Composite FK | idx_dr_doc | Provenance | System/User | same org | `0193d000-...-0001` |
| document_relations | target_entity_type | نوع رکورد مالی هدف | VARCHAR(30) | NO | NO | - | - | IN('INVOICE','PAYMENT','CHECK','BANK_TRANSACTION','INVENTORY_ADJUSTMENT','ACCOUNTING_ENTRY') | idx_dr_tgt | Provenance | System | enum | `INVOICE` |
| document_relations | target_entity_id | شناسه رکورد هدف | UUID | NO | NO | - | - | UQ(organization_id,document_id,target_entity_type,target_entity_id) | UQ | Provenance | System | valid UUID | `0193iv00-...-0001` |
| document_relations | relation_role | نقش سند (`PRIMARY_SOURCE`, `SUPPORTING_EVIDENCE`, `CORRECTION_ADDENDUM`) | VARCHAR(30) | NO | NO | - | `'SUPPORTING_EVIDENCE'` | enum | - | Provenance | User/System | enum | `PRIMARY_SOURCE` |

### ۴۳. جدول `document_access_logs`
* **مسئولیت:** ثبت ممیزی مشاهده، دانلود و درخواست حذف فایل‌های محرمانه. | **ارتباط:** متصل به `documents` و `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** ندارد. | **ماژول:** `Security/Audit`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document_access_logs | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_dal_org | Audit | System | valid org | `0193a000-...-0001` |
| document_access_logs | id | شناسه رویداد دسترسی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Audit | System | UUID | `0193dal0-...-0001` |
| document_access_logs | document_id | سند مشاهده‌شده | UUID | NO | NO | documents(organization_id,id) | - | Composite FK | idx_dal_doc | Audit | System | same org | `0193d000-...-0001` |
| document_access_logs | actor_membership_id | کاربر دسترسی‌گیرنده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | idx_dal_act | Security | System | same org | `0193m000-...-0001` |
| document_access_logs | access_action | نوع عملیات | VARCHAR(20) | NO | NO | - | - | IN('VIEW','DOWNLOAD','EXPORT','DELETE_REQUEST') | - | Security | System | enum | `VIEW` |
| document_access_logs | ip_address | آدرس IP درخواست‌کننده | INET | YES | NO | - | NULL | - | - | Security | System | valid IP | `185.12.34.56` |
| document_access_logs | accessed_at | زمان دسترسی | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_dal_time | Audit | System | UTC | `2026-11-13T10:30Z` |

---

# بخش ۶: `OCR & Extraction` (جداول ۴۴ تا ۵۳)

### ۴۴. جدول `extraction_model_versions`
* **مسئولیت:** رجیستری نسخه‌های موتورهای OCR/VLM برای ردیابی تغییر دقت در طول زمان. | **ارتباط:** والد `extraction_attempts`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** DevOps/AI Release. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `OCR`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extraction_model_versions | id | شناسه نسخه مدل | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193emv0-...-0001` |
| extraction_model_versions | provider_name | نام سرویس‌دهنده (`PYTHON_SURYA`, `GEMINI_VISION`, ...) | VARCHAR(60) | NO | NO | - | - | - | - | Internal | System | non-empty | `PYTHON_FASTAPI_HYBRID` |
| extraction_model_versions | model_name | نام مدل | VARCHAR(80) | NO | NO | - | - | - | - | Internal | System | non-empty | `persian-invoice-v1` |
| extraction_model_versions | version_tag | تگ نسخه | VARCHAR(40) | NO | NO | - | - | UQ(provider_name,model_name,version_tag) | UQ | Internal | System | semver | `1.2.0` |
| extraction_model_versions | is_active | فعال بودن برای درخواست‌های جدید | BOOLEAN | NO | NO | - | true | - | - | Internal | System | boolean | `true` |

### ۴۵. جدول `extraction_jobs`
* **مسئولیت:** درخواست صف پردازش OCR روی یک نسخه سند. | **ارتباط:** متصل به `documents`, `document_versions`؛ والد `extraction_attempts`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** صف BullMQ/Worker. | **چرخه عمر:** `QUEUED -> RUNNING -> COMPLETED | FAILED | CANCELLED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `OCR/Queue`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extraction_jobs | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_ej_org | Internal | System | valid org | `0193a000-...-0001` |
| extraction_jobs | id | شناسه Job استخراج | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ej00-...-0001` |
| extraction_jobs | document_id | سند هدف | UUID | NO | NO | documents(organization_id,id) | - | Composite FK | idx_ej_doc | Internal | System | same org | `0193d000-...-0001` |
| extraction_jobs | document_version_id | نسخه سند هدف | UUID | NO | NO | document_versions(organization_id,id) | - | Composite FK | - | Internal | System | same org | `0193dv00-...-0001` |
| extraction_jobs | queue_job_id | شناسه صف در Redis/BullMQ | VARCHAR(100) | YES | NO | - | NULL | - | - | Internal | System | - | `ocr:88412` |
| extraction_jobs | job_status | وضعیت اجرا | VARCHAR(20) | NO | NO | - | `'QUEUED'` | IN('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED') | idx_ej_status | Internal | Worker | enum | `COMPLETED` |
| extraction_jobs | error_message | پیام خطا در صورت شکست | TEXT | YES | NO | - | NULL | - | - | Internal | Worker | - | `NULL` |
| extraction_jobs | created_at | زمان ایجاد درخواست | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T10:16Z` |

### ۴۶. جدول `extraction_attempts`
* **مسئولیت:** نگهداری هر بار اجرای استخراج (برای پشتیبانی از Retry با مدل جدید بدون پاک کردن تلاش قبلی). | **ارتباط:** فرزند `extraction_jobs`، متصل به `extraction_model_versions`؛ والد `ocr_page_results`, `extracted_fields`, `extracted_tables`, `extraction_reviews`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only توسط Worker. | **چرخه عمر:** تکمیل/خطا. | **حذف:** `RESTRICT`. | **محدودیت مالی:** فقط `math_validation_passed` واقعی اجازه پیش‌تأیید می‌دهد. | **ماژول:** `OCR`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extraction_attempts | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| extraction_attempts | id | شناسه تلاش استخراج | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ea00-...-0001` |
| extraction_attempts | extraction_job_id | Job والد | UUID | NO | NO | extraction_jobs(organization_id,id) | - | Composite FK, UQ(organization_id,extraction_job_id,attempt_number) | UQ | Internal | Worker | same org | `0193ej00-...-0001` |
| extraction_attempts | attempt_number | شماره تلاش (`1, 2, ...`) | INTEGER | NO | NO | - | 1 | >= 1 | UQ | Provenance | Worker | >= 1 | `1` |
| extraction_attempts | model_version_id | نسخه مدل استخراج‌کننده | UUID | NO | NO | extraction_model_versions(id) | - | ON DELETE RESTRICT | - | Provenance | Worker | valid model | `0193emv0-...-0001` |
| extraction_attempts | detected_document_type_id | نوع سند تشخیص‌داده‌شده توسط مدل | UUID | YES | NO | document_types(id) | NULL | ON DELETE RESTRICT | - | Internal | AI | valid type | `0193dt00-...-0001` |
| extraction_attempts | overall_confidence | میانگین اطمینان کل سند (`0..1`) | NUMERIC(5,4) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Quality | AI | 0..1 | `0.8720` |
| extraction_attempts | math_validation_passed | نتیجه کنترل ریاضی جمع ردیف‌ها و کل | BOOLEAN | NO | NO | - | false | - | - | Financial | Deterministic Engine | boolean | `false` |
| extraction_attempts | duration_ms | زمان پردازش به میلی‌ثانیه | INTEGER | YES | NO | - | NULL | >= 0 | - | Internal | Worker | >= 0 | `2450` |

### ۴۷. جدول `ocr_page_results`
* **مسئولیت:** نگهداری متن خام کامل استخراج‌شده هر صفحه و جهت/زبان متن. | **ارتباط:** فرزند `extraction_attempts` و `document_pages`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی با نسخه. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `OCR`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ocr_page_results | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| ocr_page_results | id | شناسه خروجی صفحه | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193opr0-...-0001` |
| ocr_page_results | extraction_attempt_id | تلاش استخراج | UUID | NO | NO | extraction_attempts(organization_id,id) | - | Composite FK | idx_opr_att | Internal | Worker | same org | `0193ea00-...-0001` |
| ocr_page_results | document_page_id | صفحه فیزیکی سند | UUID | NO | NO | document_pages(organization_id,id) | - | Composite FK, UQ(organization_id,extraction_attempt_id,document_page_id) | UQ | Internal | Worker | same org | `0193dp00-...-0001` |
| ocr_page_results | detected_language | زبان غالب (`fa`, `en`, `fa+en`) | VARCHAR(16) | NO | NO | - | `'fa'` | - | - | Internal | OCR | non-empty | `fa` |
| ocr_page_results | raw_text | متن خام کامل استخراج‌شده صفحه | TEXT | NO | NO | - | - | - | - | Confidential | OCR | - | `صورتحساب فروش کالا...` |
| ocr_page_results | page_confidence | اعتماد کلی صفحه (`0..1`) | NUMERIC(5,4) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Quality | OCR | 0..1 | `0.8900` |

### ۴۸. جدول `extracted_fields`
* **مسئولیت:** نگهداری فیلدهای کلیدی سند (شماره فاکتور، تاریخ، فروشنده، جمع کل) با مقدار خام، مقدار استاندارد، موقعیت مکانی و وضعیت بازبینی. | **ارتباط:** فرزند `extraction_attempts` و `document_pages`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** OCR می‌سازد؛ UI وضعیت بررسی و مقدار استاندارد اصلاحی را ثبت و در `extraction_corrections` تاریخچه‌گذاری می‌کند. | **چرخه عمر:** `UNREVIEWED -> ACCEPTED | EDITED | FLAGGED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** مقدار Null به معنی خوانده‌نشده است (هرگز حدس زده نمی‌شود). | **ماژول:** `OCR/Review`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extracted_fields | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| extracted_fields | id | شناسه فیلد استخراجی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ef00-...-0001` |
| extracted_fields | extraction_attempt_id | تلاش استخراج | UUID | NO | NO | extraction_attempts(organization_id,id) | - | Composite FK | idx_ef_att | Internal | OCR | same org | `0193ea00-...-0001` |
| extracted_fields | document_page_id | صفحه منبع | UUID | YES | NO | document_pages(organization_id,id) | NULL | Composite FK | - | Provenance | OCR | same org | `0193dp00-...-0001` |
| extracted_fields | field_key | نام استاندارد فیلد (`invoice_no`, `issue_date`, `total_amount`, ...) | VARCHAR(60) | NO | NO | - | - | - | idx_ef_key | Internal | System | snake_case | `total_amount` |
| extracted_fields | data_type | نوع داده مورد انتظار (`STRING`, `DATE`, `DECIMAL`, `CURRENCY`) | VARCHAR(20) | NO | NO | - | - | - | - | Internal | System | enum | `DECIMAL` |
| extracted_fields | raw_value | رشته خام دقیقاً طبق سند | TEXT | YES | NO | - | NULL | - | - | Provenance | OCR | exact OCR text | `۱۲,۰۰۰,۰۰۰` |
| extracted_fields | normalized_value | مقدار استانداردشده (یا اصلاح‌شده) | TEXT | YES | NO | - | NULL | - | - | Financial | Normalizer/User | typed string | `120000000` |
| extracted_fields | bbox_x | مختصات افقی نسبی (`0..1`) | NUMERIC(6,5) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Provenance | OCR | 0..1 | `0.72100` |
| extracted_fields | bbox_y | مختصات عمودی نسبی (`0..1`) | NUMERIC(6,5) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Provenance | OCR | 0..1 | `0.81500` |
| extracted_fields | bbox_w | عرض باکس نسبی | NUMERIC(6,5) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Provenance | OCR | 0..1 | `0.15000` |
| extracted_fields | bbox_h | ارتفاع باکس نسبی | NUMERIC(6,5) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Provenance | OCR | 0..1 | `0.03200` |
| extracted_fields | confidence | اعتماد استخراج مدل (`0..1`) | NUMERIC(5,4) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Quality | OCR | 0..1 | `0.6200` |
| extracted_fields | review_status | وضعیت تایید انسانی | VARCHAR(20) | NO | NO | - | `'UNREVIEWED'` | IN('UNREVIEWED','ACCEPTED','EDITED','FLAGGED') | - | Audit | User/System | enum | `EDITED` |

### ۴۹. جدول `extracted_tables`
* **مسئولیت:** شناسایی جداول درون سند (جدول اقلام فاکتور، جدول انبار یا پرینت اکسل). | **ارتباط:** فرزند `extraction_attempts`؛ والد `extracted_table_rows`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** OCR Worker. | **چرخه عمر:** دائمی با تلاش استخراج. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `OCR`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extracted_tables | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| extracted_tables | id | شناسه جدول استخراجی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193et00-...-0001` |
| extracted_tables | extraction_attempt_id | تلاش استخراج | UUID | NO | NO | extraction_attempts(organization_id,id) | - | Composite FK | idx_et_att | Internal | OCR | same org | `0193ea00-...-0001` |
| extracted_tables | document_page_id | صفحه جدول | UUID | NO | NO | document_pages(organization_id,id) | - | Composite FK | - | Provenance | OCR | same org | `0193dp00-...-0001` |
| extracted_tables | table_index | شماره جدول در صفحه | SMALLINT | NO | NO | - | 1 | >= 1 | - | Internal | OCR | >= 1 | `1` |
| extracted_tables | table_kind | نوع جدول (`INVOICE_LINES`, `STOCK_LIST`, `DEBT_LIST`, `BANK_STMT`) | VARCHAR(30) | NO | NO | - | - | - | - | Internal | AI | enum | `INVOICE_LINES` |
| extracted_tables | confidence | اعتماد تشخیص جدول | NUMERIC(5,4) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Quality | OCR | 0..1 | `0.9100` |

### ۵۰. جدول `extracted_table_rows`
* **مسئولیت:** سطرهای استخراج‌شده هر جدول برای کنترل خط‌به‌خط حسابی. | **ارتباط:** فرزند `extracted_tables`؛ والد `extracted_table_cells`, ارجاع‌داده‌شده در `invoice_lines`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** OCR + کاربر. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `math_valid` وضعیت صحت حسابی سطر را نگه می‌دارد. | **ماژول:** `OCR`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extracted_table_rows | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| extracted_table_rows | id | شناسه سطر استخراجی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193etr0-...-0001` |
| extracted_table_rows | extracted_table_id | جدول والد | UUID | NO | NO | extracted_tables(organization_id,id) | - | Composite FK, UQ(organization_id,extracted_table_id,row_index) | UQ | Internal | OCR | same org | `0193et00-...-0001` |
| extracted_table_rows | row_index | شماره ردیف | INTEGER | NO | NO | - | - | >= 0 | UQ | Internal | OCR | >= 0 | `1` |
| extracted_table_rows | row_kind | نقش سطر (`HEADER`, `LINE_ITEM`, `SUBTOTAL`, `SUMMARY`) | VARCHAR(20) | NO | NO | - | `'LINE_ITEM'` | IN('HEADER','LINE_ITEM','SUBTOTAL','SUMMARY') | - | Internal | AI | enum | `LINE_ITEM` |
| extracted_table_rows | math_valid | آیا جمع حسابی سطر برقرار است | BOOLEAN | NO | NO | - | false | - | - | Financial | Engine | boolean | `true` |
| extracted_table_rows | review_status | وضعیت بررسی سطر | VARCHAR(20) | NO | NO | - | `'UNREVIEWED'` | IN('UNREVIEWED','ACCEPTED','EDITED','FLAGGED') | - | Audit | User | enum | `ACCEPTED` |

### ۵۱. جدول `extracted_table_cells`
* **مسئولیت:** سلول‌های مجزا با مختصات دقیق برای Highlight روی تصویر هنگام بررسی حسابدار. | **ارتباط:** فرزند `extracted_table_rows`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** OCR + ویرایش کاربر. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** مقدار خام از استاندارد تفکیک می‌شود. | **ماژول:** `OCR/Review`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extracted_table_cells | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| extracted_table_cells | id | شناسه سلول | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193etc0-...-0001` |
| extracted_table_cells | extracted_table_row_id | سطر والد | UUID | NO | NO | extracted_table_rows(organization_id,id) | - | Composite FK | idx_etc_row | Internal | OCR | same org | `0193etr0-...-0001` |
| extracted_table_cells | column_index | اندیس ستون | SMALLINT | NO | NO | - | - | >= 0 | - | Internal | OCR | >= 0 | `3` |
| extracted_table_cells | column_key | ستون استاندارد نگاشت‌شده (`item_name`, `qty`, `uom`, `unit_price`, ...) | VARCHAR(40) | YES | NO | - | NULL | - | - | Internal | AI/User | snake_case | `unit_price` |
| extracted_table_cells | raw_value | مقدار خام سلول در عکس | TEXT | YES | NO | - | NULL | - | - | Provenance | OCR | - | `۵۰,۰۰۰` |
| extracted_table_cells | normalized_value | مقدار استاندارد‌شده سلول | TEXT | YES | NO | - | NULL | - | - | Financial | Normalizer/User | - | `50000` |
| extracted_table_cells | bbox_x | مختصات X نسبی | NUMERIC(6,5) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Provenance | OCR | 0..1 | `0.41000` |
| extracted_table_cells | bbox_y | مختصات Y نسبی | NUMERIC(6,5) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Provenance | OCR | 0..1 | `0.35000` |
| extracted_table_cells | confidence | اعتماد مدل روی این سلول | NUMERIC(5,4) | YES | NO | - | NULL | BETWEEN 0 AND 1 | - | Quality | OCR | 0..1 | `0.9400` |

### ۵۲. جدول `extraction_reviews`
* **مسئولیت:** ثبت جلسه بازبینی و تأیید انسانی یک سند استخراج‌شده. | **ارتباط:** متصل به `documents`, `extraction_attempts`, `organization_memberships`؛ والد `extraction_corrections`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام بازبینی کاربر. | **چرخه عمر:** `APPROVED | NEEDS_CORRECTION | REJECTED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** شرط لازم برای تبدیل سند به `Verified`. | **ماژول:** `Review`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extraction_reviews | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Audit | System | valid org | `0193a000-...-0001` |
| extraction_reviews | id | شناسه بازبینی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Audit | System | UUID | `0193erv0-...-0001` |
| extraction_reviews | document_id | سند بازبینی‌شده | UUID | NO | NO | documents(organization_id,id) | - | Composite FK | idx_erv_doc | Audit | System | same org | `0193d000-...-0001` |
| extraction_reviews | extraction_attempt_id | تلاش OCR بررسی‌شده | UUID | NO | NO | extraction_attempts(organization_id,id) | - | Composite FK | - | Provenance | System | same org | `0193ea00-...-0001` |
| extraction_reviews | reviewer_membership_id | عضو بازبینی‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| extraction_reviews | review_outcome | نتیجه بازبینی | VARCHAR(25) | NO | NO | - | - | IN('APPROVED','NEEDS_CORRECTION','REJECTED') | - | Audit | User | enum | `APPROVED` |
| extraction_reviews | review_notes | یادداشت بازبین | TEXT | YES | NO | - | NULL | - | - | Audit | User | - | `اصلاح رقم جمع کل انجام شد` |
| extraction_reviews | reviewed_at | زمان ثبت نتیجه | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T10:40Z` |

### ۵۳. جدول `extraction_corrections`
* **مسئولیت:** ثبت دقیق تفاوت مقدار قبل و بعد از اصلاح انسانی برای حسابرسی و بهبود الگوهای سازمان. | **ارتباط:** فرزند `extraction_reviews` و `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** ندارد. | **ماژول:** `Review/Learning`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| extraction_corrections | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_ec_org | Audit | System | valid org | `0193a000-...-0001` |
| extraction_corrections | id | شناسه رکورد اصلاح | UUID | NO | YES | - | gen_random_uuid() | - | PK | Audit | System | UUID | `0193ec00-...-0001` |
| extraction_corrections | extraction_review_id | جلسه بازبینی والد | UUID | NO | NO | extraction_reviews(organization_id,id) | - | Composite FK | idx_ec_rev | Audit | System | same org | `0193erv0-...-0001` |
| extraction_corrections | target_kind | فیلد هدر یا سلول جدول (`FIELD`, `CELL`) | VARCHAR(10) | NO | NO | - | - | IN('FIELD','CELL') | - | Provenance | System | enum | `FIELD` |
| extraction_corrections | target_id | شناسه در `extracted_fields` یا `cells` | UUID | NO | NO | - | - | - | - | Provenance | System | valid UUID | `0193ef00-...-0001` |
| extraction_corrections | field_key | کلید فیلد اصلاح‌شده | VARCHAR(60) | NO | NO | - | - | - | idx_ec_key | Audit | System | snake_case | `total_amount` |
| extraction_corrections | value_before | مقدار پیش از اصلاح | TEXT | YES | NO | - | NULL | - | - | Audit | System | - | `12000000` |
| extraction_corrections | value_after | مقدار پس از اصلاح | TEXT | YES | NO | - | NULL | - | - | Audit | User | - | `120000000` |
| extraction_corrections | correction_reason | علت اصلاح | VARCHAR(200) | YES | NO | - | NULL | - | - | Audit | User | - | `یک صفر در تصویر ناخوانا بود` |
| extraction_corrections | corrected_by_membership_id | عضو اصلاح‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| extraction_corrections | corrected_at | زمان اصلاح | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T10:39Z` |

---

# بخش ۷: `Financial Documents & Transactions` (جداول ۵۴ تا ۶۵)

### ۵۴. جدول `invoices`
* **مسئولیت:** هدر فاکتورهای خرید، فروش و برگشتی با ردیابی منشأ، واحد پول، تاریخ شمسی/میلادی و قفل Idempotency. | **ارتباط:** متصل به `branches`, `fiscal_periods`, `contacts`, `currencies`, `documents`؛ والد `invoice_lines`, `invoice_adjustments`, `payment_allocations`. | **مالکیت:** Tenant-owned (`UQ(organization_id, id)`). | **ایجاد/اصلاح:** تا پیش از `Posted` قابل اصلاح است؛ پس از آن تغییر ممنوع و فقط `Reversed`. | **چرخه عمر:** `Needs Review -> Verified -> Posted -> Reversed | Cancelled`. | **حذف:** ممنوع در وضعیت `Posted`. | **محدودیت مالی:** مجموع `net_line_amount_irr` ردیف‌ها منهای تخفیف کلی به علاوه مالیات برابر `net_total_irr`. | **ماژول:** `Financial`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| invoices | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_inv_ar | Financial | System | valid org | `0193a000-...-0001` |
| invoices | id | شناسه فاکتور | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193iv00-...-0001` |
| invoices | branch_id | شعبه صادرکننده/دریافت‌کننده | UUID | NO | NO | branches(organization_id,id) | - | Composite FK | - | Internal | User | same org | `0193a100-...-0001` |
| invoices | invoice_direction | جهت فاکتور | VARCHAR(20) | NO | NO | - | - | IN('SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN') | idx_inv_ar | Financial | User/AI | enum | `SALE` |
| invoices | invoice_number | شماره فاکتور رسمی/داخلی | VARCHAR(64) | NO | NO | - | - | - | idx_inv_no | Financial | User/OCR | non-empty | `S-1405-4021` |
| invoices | issue_date | تاریخ صدور میلادی | DATE | NO | NO | - | - | - | idx_inv_ar | Financial | System | valid date | `2026-11-01` |
| invoices | issue_jalali | تاریخ صدور شمسی | CHAR(10) | NO | NO | - | - | regex | - | Financial | User/OCR | valid Jalali | `1405/08/10` |
| invoices | due_date | تاریخ سررسید پرداخت میلادی | DATE | YES | NO | - | NULL | CHECK(due_date IS NULL OR due_date >= issue_date) | idx_inv_due | Financial | User/Policy | >= issue_date | `2026-12-01` |
| invoices | due_jalali | تاریخ سررسید شمسی | CHAR(10) | YES | NO | - | NULL | regex | - | Financial | System | valid Jalali | `1405/09/10` |
| invoices | fiscal_period_id | دوره مالی مربوطه | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | idx_inv_fp | Financial | System | OPEN if Posted | `0193fp00-...-08` |
| invoices | contact_id | مشتری یا تأمین‌کننده | UUID | NO | NO | contacts(organization_id,id) | - | Composite FK | idx_inv_ar | Commercial | User/Resolved | same org | `0193c000-...-0001` |
| invoices | source_currency_code | واحد پول روی سند مبدأ (`IRR`, `IRT`) | CHAR(3) | NO | NO | currencies(code) | `'IRR'` | - | - | Financial | User/OCR | valid currency | `IRT` |
| invoices | exchange_rate_to_base | نرخ تبدیل به ریال پایه در زمان فاکتور | NUMERIC(20,8) | NO | NO | - | 1.00000000 | CHECK(exchange_rate_to_base > 0) | - | Financial | System | > 0 | `10.00000000` |
| invoices | subtotal_irr | جمع ناخالص ردیف‌ها (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine | >= 0 | `100000000` |
| invoices | line_discount_total_irr | جمع تخفیف‌های ردیفی (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine | >= 0 | `5000000` |
| invoices | invoice_discount_irr | تخفیف پای فاکتور (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | User/OCR | >= 0 | `0` |
| invoices | tax_total_irr | جمع مالیات و عوارض (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine | >= 0 | `9500000` |
| invoices | net_total_irr | مبلغ قابل پرداخت نهایی (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine | >= 0 | `104500000` |
| invoices | source_system | منشأ ثبت (`MANUAL`, `OCR`, `EXCEL`, `SEPIDAR`, ...) | VARCHAR(30) | NO | NO | - | - | - | - | Provenance | System | valid source | `OCR` |
| invoices | source_external_id | شناسه فاکتور در سیستم مبدأ | VARCHAR(100) | YES | NO | - | NULL | - | idx_inv_ext | Provenance | Sync | - | `SEP-9941` |
| invoices | primary_document_id | سند تصویری/PDF مرجع اصلی | UUID | YES | NO | documents(organization_id,id) | NULL | Composite FK | - | Provenance | System | same org | `0193d000-...-0001` |
| invoices | lifecycle_status | وضعیت فاکتور | VARCHAR(20) | NO | NO | - | `'Needs Review'` | IN('Needs Review','Verified','Posted','Cancelled','Reversed') | idx_inv_ar | Financial | Engine | enum | `Posted` |
| invoices | reversed_invoice_id | ارجاع به فاکتور باطل‌شده یا معکوس‌کننده | UUID | YES | NO | invoices(organization_id,id) | NULL | Composite FK | - | Audit | System | same org | `NULL` |
| invoices | approved_by_membership_id | تاییدکننده ثبت قطعی | UUID | YES | NO | organization_memberships(organization_id,id) | NULL | Composite FK | - | Audit | Approver | required if Posted | `0193m000-...-0002` |
| invoices | posted_at | زمان ثبت قطعی | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Audit | System | UTC | `2026-11-13T11:00Z` |
| invoices | idempotency_key | کلید یکتا برای جلوگیری از ثبت تکراری | VARCHAR(128) | NO | NO | - | - | UQ(organization_id,idempotency_key) | UQ | System | System | unique hash | `inv_4021_doc1_v1` |

### ۵۵. جدول `invoice_lines`
* **مسئولیت:** اقلام جزئی فاکتور با نگهداری همزمان واحد سند و مقدار تبدیل‌شده به واحد پایه. | **ارتباط:** فرزند `invoices`، متصل به `products`, `units_of_measure`, `warehouses`, `extracted_table_rows`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** همگام با هدر فاکتور (تا قبل از `Posted`). | **چرخه عمر:** تابع فاکتور. | **حذف:** `RESTRICT` پس از `Posted`. | **محدودیت مالی:** `quantity > 0`, `unit_price_irr >= 0` (پشتیبانی از اشانتیون صفر ریالی). | **ماژول:** `Financial`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| invoice_lines | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Financial | System | valid org | `0193a000-...-0001` |
| invoice_lines | id | شناسه ردیف فاکتور | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193iln0-...-0001` |
| invoice_lines | invoice_id | فاکتور والد | UUID | NO | NO | invoices(organization_id,id) | - | Composite FK, UQ(organization_id,invoice_id,line_number) | UQ | Financial | System | same org | `0193iv00-...-0001` |
| invoice_lines | line_number | شماره سطر | INTEGER | NO | NO | - | - | >= 1 | UQ | Internal | System | >= 1 | `1` |
| invoice_lines | product_id | کالای استاندارد (قابل NULL در پیش‌نویس تا قبل تطبیق) | UUID | YES | NO | products(organization_id,id) | NULL | Composite FK | idx_iln_prod | Commercial | User/Resolved | required if Posted | `0193pr00-...-0001` |
| invoice_lines | item_description_raw | شرح خام کالا روی سند | VARCHAR(255) | NO | NO | - | - | - | - | Provenance | OCR/User | non-empty | `رب گوجه ۸۰۰ گرمی کارتن` |
| invoice_lines | uom_id | واحد سنجش سطر | UUID | NO | NO | units_of_measure(id) | - | ON DELETE RESTRICT | - | Commercial | User/OCR | valid UoM | `0193uom0-...-CTN` |
| invoice_lines | quantity | مقدار در واحد سند | NUMERIC(18,4) | NO | NO | - | - | CHECK(quantity > 0) | - | Financial | User/OCR | > 0 | `10.0000` |
| invoice_lines | base_quantity | مقدار تبدیل‌شده به واحد پایه کالا | NUMERIC(18,4) | NO | NO | - | - | CHECK(base_quantity > 0) | - | Financial | Engine | > 0 | `120.0000` |
| invoice_lines | unit_price_irr | فی واحد سند (ریال) | NUMERIC(20,4) | NO | NO | - | - | CHECK(unit_price_irr >= 0) | - | Financial | User/OCR | >= 0 | `7200000.0000` |
| invoice_lines | discount_amount_irr | تخفیف ردیف (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | User/OCR | >= 0 | `2000000` |
| invoice_lines | tax_amount_irr | مالیات ردیف (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine/OCR | >= 0 | `7000000` |
| invoice_lines | net_line_amount_irr | جمع خالص ردیف با احتساب تخفیف و مالیات (ریال) | NUMERIC(18,0) | NO | NO | - | - | >= 0 | - | Financial | Engine | >= 0 | `77000000` |
| invoice_lines | warehouse_id | انبار تحویل/خروج | UUID | YES | NO | warehouses(organization_id,id) | NULL | Composite FK | - | Commercial | User | same org | `0193wh00-...-0001` |
| invoice_lines | source_extraction_row_id | ارجاع به ردیف OCR منبع | UUID | YES | NO | extracted_table_rows(organization_id,id) | NULL | Composite FK | - | Provenance | OCR | same org | `0193etr0-...-0001` |

### ۵۶. جدول `invoice_adjustments`
* **مسئولیت:** ثبت هزینه‌های جانبی یا تعدیلات بعدی روی یک فاکتور (کرایه حمل، کسورات، رندینگ) بدون تغییر ردیف‌های کالا. | **ارتباط:** فرزند `invoices`, `fiscal_periods`, `documents`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر مجاز. | **چرخه عمر:** `Verified -> Posted`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `amount_signed_irr <> 0`. | **ماژول:** `Financial`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| invoice_adjustments | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Financial | System | valid org | `0193a000-...-0001` |
| invoice_adjustments | id | شناسه تعدیل فاکتور | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193iad0-...-0001` |
| invoice_adjustments | invoice_id | فاکتور هدف | UUID | NO | NO | invoices(organization_id,id) | - | Composite FK | idx_iad_inv | Financial | User | same org | `0193iv00-...-0001` |
| invoice_adjustments | adjustment_type | نوع تعدیل | VARCHAR(25) | NO | NO | - | - | IN('DISCOUNT','SURCHARGE','FREIGHT','ROUNDING','CREDIT_MEMO') | - | Financial | User | enum | `FREIGHT` |
| invoice_adjustments | amount_signed_irr | مبلغ اثرگذار بر بدهی (+ یا -) | NUMERIC(18,0) | NO | NO | - | - | CHECK(amount_signed_irr <> 0) | - | Financial | User | != 0 | `2500000` |
| invoice_adjustments | fiscal_period_id | دوره ثبت تعدیل | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | - | Financial | System | OPEN period | `0193fp00-...-08` |
| invoice_adjustments | reason | شرح تعدیل | VARCHAR(250) | NO | NO | - | - | - | - | Audit | User | non-empty | `کرایه حمل پخش` |

### ۵۷. جدول `bank_accounts`
* **مسئولیت:** تعریف حساب‌های بانکی، صندوق‌ها و تنخواه‌های سازمان. | **ارتباط:** والد `payments`, `checks`, `bank_transactions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر مالی/ادمین. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Treasury`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bank_accounts | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_ba_org | Financial | System | valid org | `0193a000-...-0001` |
| bank_accounts | id | شناسه حساب/صندوق | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193ba00-...-0001` |
| bank_accounts | branch_id | شعبه مرتبط | UUID | YES | NO | branches(organization_id,id) | NULL | Composite FK | - | Internal | User | same org | `0193a100-...-0001` |
| bank_accounts | bank_name | نام بانک یا عنوان صندوق | VARCHAR(100) | NO | NO | - | - | - | - | Financial | User | non-empty | `بانک ملت شعبه مرکزی` |
| bank_accounts | account_number | شماره حساب | VARCHAR(50) | YES | NO | - | NULL | - | - | Confidential | User | - | `1234567890` |
| bank_accounts | iban | شماره شبا ۲۶ کاراکتری (`IR...`) | VARCHAR(34) | YES | NO | - | NULL | CHECK(iban IS NULL OR iban ~ '^IR[0-9]{24}$') | - | Confidential | User | IR + 24 digits | `IR120120000000001234567890` |
| bank_accounts | account_kind | نوع حساب (`BANK`, `CASH_REGISTER`, `PETTY_CASH`) | VARCHAR(20) | NO | NO | - | `'BANK'` | IN('BANK','CASH_REGISTER','PETTY_CASH') | - | Financial | User | enum | `BANK` |
| bank_accounts | is_active | فعال بودن | BOOLEAN | NO | NO | - | true | - | - | Internal | User | boolean | `true` |

### ۵۸. جدول `payments`
* **مسئولیت:** ثبت دریافت‌ها، پرداخت‌ها و انتقال وجه بین حساب‌های داخلی سازمان. | **ارتباط:** متصل به `contacts`, `bank_accounts`, `fiscal_periods`, `documents`؛ والد `payment_allocations`, `checks`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** قابل ویرایش تا `Verified`؛ در `Posted` غیرقابل حذف و فقط `Reversed`. | **چرخه عمر:** `Needs Review -> Verified -> Posted -> Reversed`. | **حذف:** ممنوع در `Posted`. | **محدودیت مالی:** `amount_irr > 0`؛ در `INTERNAL_TRANSFER` باید `to_bank_account_id IS NOT NULL` و `<> bank_account_id`. | **ماژول:** `Financial/Treasury`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| payments | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_pay_org | Financial | System | valid org | `0193a000-...-0001` |
| payments | id | شناسه دریافت/پرداخت | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193py00-...-0001` |
| payments | branch_id | شعبه | UUID | NO | NO | branches(organization_id,id) | - | Composite FK | - | Internal | User | same org | `0193a100-...-0001` |
| payments | payment_direction | جهت پول (`RECEIPT_IN`, `PAYMENT_OUT`, `INTERNAL_TRANSFER`) | VARCHAR(25) | NO | NO | - | - | IN('RECEIPT_IN','PAYMENT_OUT','INTERNAL_TRANSFER') | idx_pay_dir | Financial | User/OCR | enum | `RECEIPT_IN` |
| payments | payment_method | روش (`CASH`, `BANK_TRANSFER`, `POS`, `CHEQUE`, `OFFSET`) | VARCHAR(20) | NO | NO | - | - | IN('CASH','BANK_TRANSFER','POS','CHEQUE','OFFSET') | - | Financial | User/OCR | enum | `BANK_TRANSFER` |
| payments | payment_number | شماره رسید/سند پرداخت | VARCHAR(64) | NO | NO | - | - | - | - | Financial | User/System | non-empty | `RCV-1405-101` |
| payments | occurred_at | تاریخ و ساعت وقوع | TIMESTAMPTZ | NO | NO | - | - | - | idx_pay_date | Financial | User/OCR | UTC | `2026-11-05T14:20Z` |
| payments | occurred_jalali | تاریخ شمسی | CHAR(10) | NO | NO | - | - | regex | - | Financial | System | valid Jalali | `1405/08/14` |
| payments | fiscal_period_id | دوره مالی | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | - | Financial | System | OPEN period | `0193fp00-...-08` |
| payments | contact_id | طرف حساب (در انتقال داخلی NULL) | UUID | YES | NO | contacts(organization_id,id) | NULL | Composite FK | idx_pay_con | Commercial | User/Resolved | required unless transfer | `0193c000-...-0001` |
| payments | bank_account_id | حساب مبدأ/مقصد اصلی | UUID | YES | NO | bank_accounts(organization_id,id) | NULL | Composite FK | - | Financial | User | same org | `0193ba00-...-0001` |
| payments | to_bank_account_id | حساب مقصد در انتقال داخلی بین دو حساب | UUID | YES | NO | bank_accounts(organization_id,id) | NULL | Composite FK, CHECK(to_bank_account_id IS NULL OR to_bank_account_id <> bank_account_id) | - | Financial | User | != bank_account_id | `NULL` |
| payments | amount_irr | مبلغ اصلی (ریال) | NUMERIC(18,0) | NO | NO | - | - | CHECK(amount_irr > 0) | - | Financial | User/OCR | > 0 | `90000000` |
| payments | tracking_code | شماره پیگیری بانکی/پوز | VARCHAR(64) | YES | NO | - | NULL | - | idx_pay_trk | Financial | OCR/User | - | `TRK-998811` |
| payments | lifecycle_status | وضعیت تایید | VARCHAR(20) | NO | NO | - | `'Needs Review'` | IN('Needs Review','Verified','Posted','Reversed') | idx_pay_stat | Financial | Engine | enum | `Posted` |
| payments | reversed_payment_id | ارجاع به سند برگشتی | UUID | YES | NO | payments(organization_id,id) | NULL | Composite FK | - | Audit | System | same org | `NULL` |
| payments | idempotency_key | کلید جلوگیری از ثبت تکراری | VARCHAR(128) | NO | NO | - | - | UQ(organization_id,idempotency_key) | UQ | System | System | unique hash | `pay_101_v1` |

### ۵۹. جدول `payment_allocations`
* **مسئولیت:** جدول رابط `M:N` برای تخصیص ۱ دریافت به چند فاکتور، یا چند پرداخت به ۱ فاکتور و محاسبه مانده باز بدون ستون Cache ناسازگار. | **ارتباط:** پل بین `payments` و `invoices`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام تسویه دستی یا FIFO خودکار؛ در ابطال به `REVERSED` می‌رود. | **چرخه عمر:** `ACTIVE -> REVERSED`. | **حذف:** ممنوع. | **محدودیت مالی:** مجموع `allocated_amount_irr` فعال برای یک پرداخت ≤ `payments.amount_irr` و برای یک فاکتور ≤ `invoices.net_total_irr`. | **ماژول:** `Financial`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| payment_allocations | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Financial | System | valid org | `0193a000-...-0001` |
| payment_allocations | id | شناسه تخصیص | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193pa00-...-0001` |
| payment_allocations | payment_id | پرداخت/دریافت | UUID | NO | NO | payments(organization_id,id) | - | Composite FK | idx_pa_pay | Financial | System/User | same org | `0193py00-...-0001` |
| payment_allocations | invoice_id | فاکتور تسویه‌شده | UUID | NO | NO | invoices(organization_id,id) | - | Composite FK | idx_pa_inv | Financial | System/User | same org | `0193iv00-...-0001` |
| payment_allocations | allocated_amount_irr | مبلغ تخصیص‌داده‌شده (ریال) | NUMERIC(18,0) | NO | NO | - | - | CHECK(allocated_amount_irr > 0) | - | Financial | Engine/User | > 0 | `40000000` |
| payment_allocations | allocation_method | روش تخصیص (`EXPLICIT`, `FIFO_AUTO`, `REVERSAL`) | VARCHAR(20) | NO | NO | - | `'EXPLICIT'` | IN('EXPLICIT','FIFO_AUTO','REVERSAL') | - | Provenance | System | enum | `FIFO_AUTO` |
| payment_allocations | status | وضعیت تخصیص | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('ACTIVE','REVERSED') | idx_pa_inv | Financial | System | enum | `ACTIVE` |
| payment_allocations | allocated_at | زمان تخصیص | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T11:05Z` |

### ۶۰. جدول `checks`
* **مسئولیت:** مدیریت چک‌های دریافتی و پرداختی با شناسه صیاد و سررسید. | **ارتباط:** متصل به `contacts`, `bank_accounts`, `payments`, `documents`؛ والد `check_status_history`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام دریافت/صدور چک و تغییر وضعیت در خزانه. | **چرخه عمر:** `IN_HAND -> DEPOSITED | ENDORSED -> CLEARED | BOUNCED | CANCELLED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** چک `IN_HAND` (وصول‌نشده) از بدهی قطعی مشتری کسر نمی‌شود، بلکه تفکیک می‌گردد. | **ماژول:** `Treasury`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| checks | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_chk_due | Financial | System | valid org | `0193a000-...-0001` |
| checks | id | شناسه چک | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193ch00-...-0001` |
| checks | check_direction | دریافتی یا پرداختی | VARCHAR(20) | NO | NO | - | - | IN('RECEIVABLE','PAYABLE') | idx_chk_due | Financial | User/OCR | enum | `RECEIVABLE` |
| checks | sayad_id | شناسه ۱۶ رقمی صیادی | CHAR(16) | YES | NO | - | NULL | CHECK(sayad_id IS NULL OR sayad_id ~ '^[0-9]{16}$') | idx_chk_sayad | Financial | User/OCR | 16 digits | `9812345678901234` |
| checks | serial_number | شماره سریال چک | VARCHAR(40) | NO | NO | - | - | - | - | Financial | User/OCR | non-empty | `1245/881` |
| checks | bank_name | نام بانک صادرکننده چک | VARCHAR(100) | NO | NO | - | - | - | - | Financial | User/OCR | non-empty | `بانک صادرات` |
| checks | issuer_contact_id | صادرکننده چک | UUID | YES | NO | contacts(organization_id,id) | NULL | Composite FK | - | Commercial | User | same org | `0193c000-...-0001` |
| checks | due_date | تاریخ سررسید میلادی | DATE | NO | NO | - | - | - | idx_chk_due | Financial | System | valid date | `2026-12-06` |
| checks | due_jalali | تاریخ سررسید شمسی | CHAR(10) | NO | NO | - | - | regex | - | Financial | User/OCR | valid Jalali | `1405/09/15` |
| checks | amount_irr | مبلغ چک (ریال) | NUMERIC(18,0) | NO | NO | - | - | CHECK(amount_irr > 0) | - | Financial | User/OCR | > 0 | `150000000` |
| checks | current_status | وضعیت فعلی چک | VARCHAR(20) | NO | NO | - | `'IN_HAND'` | IN('IN_HAND','DEPOSITED','ENDORSED','CLEARED','BOUNCED','CANCELLED') | idx_chk_due | Financial | Engine | enum | `CLEARED` |
| checks | linked_payment_id | سند دریافت/پرداخت متصل | UUID | YES | NO | payments(organization_id,id) | NULL | Composite FK | - | Financial | System | same org | `0193py00-...-0003` |
| checks | primary_document_id | تصویر چک | UUID | YES | NO | documents(organization_id,id) | NULL | Composite FK | - | Provenance | User | same org | `0193d000-...-0007` |

### ۶۱. جدول `check_status_history`
* **مسئولیت:** ثبت تاریخچه تمام تغییرات وضعیت چک و اتصال به تراکنش بانکی هنگام پاس شدن یا برگشت. | **ارتباط:** فرزند `checks` و متصل به `bank_transactions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** تغییر به `CLEARED` در بانک باید به `bank_transaction_id` متصل باشد (در صورت تطبیق بانکی). | **ماژول:** `Treasury/Audit`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| check_status_history | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Audit | System | valid org | `0193a000-...-0001` |
| check_status_history | id | شناسه رویداد وضعیت چک | UUID | NO | YES | - | gen_random_uuid() | - | PK | Audit | System | UUID | `0193csh0-...-0001` |
| check_status_history | check_id | چک مربوطه | UUID | NO | NO | checks(organization_id,id) | - | Composite FK | idx_csh_chk | Financial | System | same org | `0193ch00-...-0001` |
| check_status_history | from_status | وضعیت قبلی | VARCHAR(20) | YES | NO | - | NULL | - | - | Audit | System | enum/null | `IN_HAND` |
| check_status_history | to_status | وضعیت جدید | VARCHAR(20) | NO | NO | - | - | IN('IN_HAND','DEPOSITED','ENDORSED','CLEARED','BOUNCED','CANCELLED') | - | Financial | User/Engine | enum | `CLEARED` |
| check_status_history | changed_at | زمان تغییر وضعیت | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-12-06T12:00Z` |
| check_status_history | bank_transaction_id | تراکنش بانکی تسویه چک | UUID | YES | NO | bank_transactions(organization_id,id) | NULL | Composite FK | - | Provenance | Reconciliation | same org | `0193bt00-...-0001` |
| check_status_history | changed_by_membership_id | کاربر ثبت‌کننده تغییر | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |

### ۶۲. جدول `bank_transactions`
* **مسئولیت:** ذخیره ردیف‌های صورتحساب بانک (حتی قبل از داشتن سند متناظر). | **ارتباط:** فرزند `bank_accounts`، متصل به `import_rows`, `documents`, `reconciliation_matches`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Import بانکی یا OCR صورتحساب. | **چرخه عمر:** `UNMATCHED -> SUGGESTED_MATCH -> MATCHED | IGNORED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `amount_signed_irr <> 0` (واریز مثبت، برداشت منفی). | **ماژول:** `Treasury/Reconciliation`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bank_transactions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_bt_unm | Financial | System | valid org | `0193a000-...-0001` |
| bank_transactions | id | شناسه تراکنش بانکی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193bt00-...-0001` |
| bank_transactions | bank_account_id | حساب بانکی | UUID | NO | NO | bank_accounts(organization_id,id) | - | Composite FK | idx_bt_acc | Financial | Import | same org | `0193ba00-...-0001` |
| bank_transactions | occurred_at | تاریخ و زمان تراکنش بانک | TIMESTAMPTZ | NO | NO | - | - | - | idx_bt_acc | Financial | Bank | UTC | `2026-11-12T08:15Z` |
| bank_transactions | occurred_jalali | تاریخ شمسی | CHAR(10) | NO | NO | - | - | regex | - | Financial | System | valid Jalali | `1405/08/21` |
| bank_transactions | amount_signed_irr | مبلغ با علامت (+/- ریال) | NUMERIC(18,0) | NO | NO | - | - | CHECK(amount_signed_irr <> 0) | - | Financial | Bank | != 0 | `+25000000` |
| bank_transactions | reference_no | شماره پیگیری/سند بانکی | VARCHAR(64) | YES | NO | - | NULL | - | idx_bt_ref | Financial | Bank | - | `99104422` |
| bank_transactions | description_raw | شرح خام تراکنش در فایل بانک | TEXT | YES | NO | - | NULL | - | - | Confidential | Bank | - | `واریز پایا-۰۱۲۳` |
| bank_transactions | reconciliation_status | وضعیت تطبیق با اسناد داخلی | VARCHAR(20) | NO | NO | - | `'UNMATCHED'` | IN('UNMATCHED','SUGGESTED_MATCH','MATCHED','IGNORED') | idx_bt_unm | Financial | Reconciliation | enum | `UNMATCHED` |
| bank_transactions | import_row_id | ارجاع به ردیف اکسل مبدأ (افزوده‌شده در Migration 010) | UUID | YES | NO | import_rows(organization_id,id) | NULL | Composite FK | - | Provenance | Import | same org | `NULL` |

### ۶۳. جدول `financial_adjustments`
* **مسئولیت:** ثبت اصلاحات یا تهاترهای مالی تاییدشده روی مانده طرف حساب یا سند بدون حذف تاریخچه. | **ارتباط:** متصل به `fiscal_periods`, `documents`, `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر مالی/حسابدار با Approval. | **چرخه عمر:** `Verified -> Posted -> Reversed`. | **حذف:** ممنوع. | **محدودیت مالی:** `amount_signed_irr <> 0`. | **ماژول:** `Financial`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| financial_adjustments | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Financial | System | valid org | `0193a000-...-0001` |
| financial_adjustments | id | شناسه تعدیل مالی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193fa00-...-0001` |
| financial_adjustments | target_entity_type | موجودیت هدف (`INVOICE`, `PAYMENT`, `CONTACT_BALANCE`) | VARCHAR(30) | NO | NO | - | - | IN('INVOICE','PAYMENT','CONTACT_BALANCE') | idx_fa_tgt | Financial | User | enum | `CONTACT_BALANCE` |
| financial_adjustments | target_entity_id | شناسه رکورد هدف | UUID | NO | NO | - | - | - | idx_fa_tgt | Financial | User | valid UUID | `0193c000-...-0001` |
| financial_adjustments | amount_signed_irr | مبلغ تعدیل (+/- ریال) | NUMERIC(18,0) | NO | NO | - | - | CHECK(amount_signed_irr <> 0) | - | Financial | User | != 0 | `-5000000` |
| financial_adjustments | adjustment_reason | علت اصلاحیه | TEXT | NO | NO | - | - | - | - | Audit | User | non-empty | `تخفیف توافقی حسن انجام تسویه` |
| financial_adjustments | fiscal_period_id | دوره مالی | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | - | Financial | System | OPEN period | `0193fp00-...-08` |
| financial_adjustments | status | وضعیت تایید | VARCHAR(20) | NO | NO | - | `'Verified'` | IN('Verified','Posted','Reversed') | - | Financial | Engine | enum | `Posted` |

### ۶۴. جدول `accounting_entries` *(PROVISIONAL — Future Double-Entry Hook)*
* **مسئولیت:** نگهداری هدر سند حسابداری دوطرفه برای اتصال رویدادهای Sub-ledger در فاز توسعه آتی دفترکل. | **ارتباط:** متصل به `fiscal_periods`, والد `accounting_entry_lines`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** موتور Accounting Mapping آینده. | **چرخه عمر:** `DRAFT -> POSTED -> REVERSED`. | **حذف:** ممنوع. | **محدودیت مالی:** `total_debit_irr = total_credit_irr` در وضعیت `POSTED`. | **ماژول:** `Future GL`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| accounting_entries | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Financial | System | valid org | `0193a000-...-0001` |
| accounting_entries | id | شناسه سند حسابداری | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193ae00-...-0001` |
| accounting_entries | entry_number | شماره سند | VARCHAR(40) | NO | NO | - | - | UQ(organization_id,fiscal_period_id,entry_number) | UQ | Financial | Engine | non-empty | `GL-1405-0001` |
| accounting_entries | entry_date | تاریخ سند | DATE | NO | NO | - | - | - | - | Financial | System | valid date | `2026-11-01` |
| accounting_entries | fiscal_period_id | دوره مالی | UUID | NO | NO | fiscal_periods(organization_id,id) | - | Composite FK | - | Financial | System | OPEN period | `0193fp00-...-08` |
| accounting_entries | source_event_type | نوع رویداد منشأ در Sub-ledger | VARCHAR(30) | YES | NO | - | NULL | - | - | Provenance | Engine | - | `INVOICE_POSTED` |
| accounting_entries | source_event_id | شناسه فاکتور/پرداخت منشأ | UUID | YES | NO | - | NULL | - | - | Provenance | Engine | valid UUID | `0193iv00-...-0001` |
| accounting_entries | total_debit_irr | جمع بدهکار | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine | = credit if posted | `104500000` |
| accounting_entries | total_credit_irr | جمع بستانکار | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine | = debit if posted | `104500000` |
| accounting_entries | status | وضعیت سند | VARCHAR(20) | NO | NO | - | `'DRAFT'` | IN('DRAFT','POSTED','REVERSED') | - | Financial | Engine | enum | `DRAFT` |

### ۶۵. جدول `accounting_entry_lines` *(PROVISIONAL — Future Double-Entry Hook)*
* **مسئولیت:** سطرهای بدهکار و بستانکار متصل به `accounting_entries`. | **ارتباط:** فرزند `accounting_entries`, متصل به `contacts`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** همراه هدر. | **چرخه عمر:** تابع سند. | **حذف:** ممنوع در `POSTED`. | **محدودیت مالی:** `(debit_irr > 0 AND credit_irr = 0) OR (credit_irr > 0 AND debit_irr = 0)`. | **ماژول:** `Future GL`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| accounting_entry_lines | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Financial | System | valid org | `0193a000-...-0001` |
| accounting_entry_lines | id | شناسه ردیف سند | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193ael0-...-0001` |
| accounting_entry_lines | accounting_entry_id | سند والد | UUID | NO | NO | accounting_entries(organization_id,id) | - | Composite FK | idx_ael_ae | Financial | Engine | same org | `0193ae00-...-0001` |
| accounting_entry_lines | line_number | شماره ردیف | INTEGER | NO | NO | - | - | >= 1 | - | Internal | Engine | >= 1 | `1` |
| accounting_entry_lines | account_code | کد حساب معین/کل | VARCHAR(40) | NO | NO | - | - | - | idx_ael_acc | Financial | Mapping | non-empty | `110301` |
| accounting_entry_lines | contact_id | تفصیلی طرف حساب اختیاری | UUID | YES | NO | contacts(organization_id,id) | NULL | Composite FK | - | Commercial | Engine | same org | `0193c000-...-0001` |
| accounting_entry_lines | debit_irr | مبلغ بدهکار (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | Engine | one side only | `104500000` |
| accounting_entry_lines | credit_irr | مبلغ بستانکار (ریال) | NUMERIC(18,0) | NO | NO | - | 0 | CHECK((debit_irr > 0 AND credit_irr = 0) OR (credit_irr > 0 AND debit_irr = 0)) | - | Financial | Engine | one side only | `0` |

---

# بخش ۸: `Accounting Integration` (جداول ۶۶ تا ۷۳)

### ۶۶. جدول `source_systems`
* **مسئولیت:** رجیستری سیستم‌ها و کانال‌های مبدأ (`MANUAL`, `OCR`, `EXCEL`, `HOLOO`, `SEPIDAR`, `RAHKARAN`, ...). | **ارتباط:** والد `integration_connections`, `external_entity_mappings`, `import_batches`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Seed/Migration. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Integration`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| source_systems | id | شناسه سیستم مبدأ | UUID | NO | YES | - | gen_random_uuid() | - | PK | Public | System | UUID | `0193ssy0-...-0001` |
| source_systems | code | کد یکتای سیستم | VARCHAR(40) | NO | NO | - | - | UNIQUE | UQ | Public | System | uppercase | `SEPIDAR` |
| source_systems | name_fa | نام فارسی | VARCHAR(100) | NO | NO | - | - | - | - | Public | System | non-empty | `سپیدار سیستم` |
| source_systems | connector_kind | نوع اتصال (`FILE`, `API`, `AGENT`, `INTERNAL`) | VARCHAR(20) | NO | NO | - | - | IN('FILE','API','AGENT','INTERNAL') | - | Internal | System | enum | `FILE` |

### ۶۷. جدول `integration_connections`
* **مسئولیت:** پیکربندی اتصال فعال یک سازمان به API یا Windows Agent محلی. | **ارتباط:** متصل به `organizations`, `source_systems`؛ والد `sync_jobs`, `sync_cursors`, `external_entity_mappings`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر سیستم سازمان. | **چرخه عمر:** `ACTIVE | PAUSED | ERROR | REVOKED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** در فاز ۱ `read_only = true` اجباری برای Agent. | **ماژول:** `Integration`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| integration_connections | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_ic_org | Internal | System | valid org | `0193a000-...-0001` |
| integration_connections | id | شناسه اتصال | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ic00-...-0001` |
| integration_connections | source_system_id | نرم‌افزار مبدأ | UUID | NO | NO | source_systems(id) | - | ON DELETE RESTRICT | - | Internal | Admin | valid system | `0193ssy0-...-0001` |
| integration_connections | connection_name | نام دلخواه اتصال | VARCHAR(120) | NO | NO | - | - | - | - | Internal | Admin | non-empty | `سرور سپیدار دفتر مرکزی` |
| integration_connections | transport_mode | روش ارتباط (`API`, `WINDOWS_AGENT`, `FILE_TEMPLATE`) | VARCHAR(25) | NO | NO | - | - | IN('API','WINDOWS_AGENT','FILE_TEMPLATE') | - | Internal | Admin | enum | `WINDOWS_AGENT` |
| integration_connections | credential_secret_ref | ارجاع به Secret Manager (نه رمز خام!) | VARCHAR(255) | YES | NO | - | NULL | - | - | Restricted | Vault | KMS key ref | `vault://org1/sepidar` |
| integration_connections | agent_device_id | شناسه دستگاه ویندوزی ثبت‌شده | VARCHAR(100) | YES | NO | - | NULL | - | - | Security | Agent | - | `WIN-SRV-01` |
| integration_connections | read_only | محدودیت فقط-خواندنی | BOOLEAN | NO | NO | - | true | - | - | Security | System | true in v1 | `true` |
| integration_connections | status | وضعیت اتصال | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('ACTIVE','PAUSED','ERROR','REVOKED') | idx_ic_stat | Security | System/Admin | enum | `ACTIVE` |

### ۶۸. جدول `external_entity_mappings`
* **مسئولیت:** نگاشت قطعی بین شناسه سیستم خارجی (هلو/سپیدار) و شناسه داخلی Erpkian برای جلوگیری از واردسازی تکراری. | **ارتباط:** متصل به `integration_connections`, `source_systems`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام همگام‌سازی یا تایید نگاشت توسط کاربر. | **چرخه عمر:** `PROPOSED -> CONFIRMED | CONFLICT`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** کلید یکتا `(organization_id, source_system_id, entity_domain, external_id)`. | **ماژول:** `Integration`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| external_entity_mappings | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_eem_org | Internal | System | valid org | `0193a000-...-0001` |
| external_entity_mappings | id | شناسه نگاشت | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193eem0-...-0001` |
| external_entity_mappings | integration_connection_id | اتصال مبدأ | UUID | YES | NO | integration_connections(organization_id,id) | NULL | Composite FK | - | Internal | Sync | same org | `0193ic00-...-0001` |
| external_entity_mappings | source_system_id | سیستم مبدأ | UUID | NO | NO | source_systems(id) | - | ON DELETE RESTRICT | - | Provenance | System | valid system | `0193ssy0-...-0001` |
| external_entity_mappings | entity_domain | دامنه (`CONTACT`, `PRODUCT`, `INVOICE`, `PAYMENT`, `CHECK`) | VARCHAR(30) | NO | NO | - | - | - | UQ | Internal | Sync | enum | `INVOICE` |
| external_entity_mappings | external_id | شناسه یکتای رکورد در نرم‌افزار مبدأ | VARCHAR(128) | NO | NO | - | - | UQ(organization_id,source_system_id,entity_domain,external_id) | UQ | Provenance | Sync | non-empty | `SEP-INV-9941` |
| external_entity_mappings | external_code | کد نمایشی در مبدأ (مثلاً کد تفصیلی) | VARCHAR(64) | YES | NO | - | NULL | - | - | Commercial | Sync | - | `9941` |
| external_entity_mappings | internal_entity_id | شناسه داخلی در Erpkian | UUID | NO | NO | - | - | - | idx_eem_int | Internal | Sync/User | valid UUID | `0193iv00-...-0001` |
| external_entity_mappings | mapping_status | وضعیت تایید نگاشت | VARCHAR(20) | NO | NO | - | `'CONFIRMED'` | IN('PROPOSED','CONFIRMED','CONFLICT') | - | Audit | System/User | enum | `CONFIRMED` |

### ۶۹. جدول `sync_jobs`
* **مسئولیت:** ثبت گزارش اجرای هر نوبت همگام‌سازی API یا Windows Agent. | **ارتباط:** فرزند `integration_connections`؛ والد `sync_errors`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Sync Worker. | **چرخه عمر:** `RUNNING -> COMPLETED | PARTIAL | FAILED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Integration`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sync_jobs | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| sync_jobs | id | شناسه اجرا | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193sj00-...-0001` |
| sync_jobs | integration_connection_id | اتصال مربوطه | UUID | NO | NO | integration_connections(organization_id,id) | - | Composite FK | idx_sj_ic | Internal | System | same org | `0193ic00-...-0001` |
| sync_jobs | sync_direction | جهت (`PULL` یا `PUSH`) | VARCHAR(10) | NO | NO | - | `'PULL'` | IN('PULL','PUSH') | - | Internal | System | enum | `PULL` |
| sync_jobs | status | وضعیت همگام‌سازی | VARCHAR(20) | NO | NO | - | `'RUNNING'` | IN('RUNNING','COMPLETED','PARTIAL','FAILED') | - | Internal | Worker | enum | `COMPLETED` |
| sync_jobs | records_fetched | تعداد رکورد دریافت‌شده | INTEGER | NO | NO | - | 0 | >= 0 | - | Internal | Worker | >= 0 | `250` |
| sync_jobs | records_imported | تعداد رکورد جدید واردشده | INTEGER | NO | NO | - | 0 | >= 0 | - | Internal | Worker | >= 0 | `12` |
| sync_jobs | records_skipped_duplicate | تعداد تکراری ردشده | INTEGER | NO | NO | - | 0 | >= 0 | - | Audit | Worker | >= 0 | `238` |
| sync_jobs | started_at | زمان شروع | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T09:00Z` |

### ۷۰. جدول `sync_cursors`
* **مسئولیت:** نگهداری آخرین نقطه (Watermark / Timestamp / Last ID) برای همگام‌سازی افزایشی. | **ارتباط:** فرزند `integration_connections`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Sync Worker پس از موفقیت. | **چرخه عمر:** فعال. | **حذف:** `CASCADE` با حذف اتصال غیرفعال. | **محدودیت مالی:** ندارد. | **ماژول:** `Integration`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sync_cursors | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| sync_cursors | id | شناسه کرسر | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193sc00-...-0001` |
| sync_cursors | integration_connection_id | اتصال والد | UUID | NO | NO | integration_connections(organization_id,id) | - | Composite FK, UQ(organization_id,integration_connection_id,entity_domain) | UQ | Internal | System | same org | `0193ic00-...-0001` |
| sync_cursors | entity_domain | دامنه موجودیت همگام‌سازی‌شده | VARCHAR(30) | NO | NO | - | - | - | UQ | Internal | System | enum | `INVOICE` |
| sync_cursors | cursor_value | مقدار آخرین Watermark | VARCHAR(255) | NO | NO | - | - | - | - | Internal | Worker | non-empty | `2026-11-13T08:59:59Z` |
| sync_cursors | updated_at | زمان آخرین بروزرسانی | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T09:01Z` |

### ۷۱. جدول `sync_errors`
* **مسئولیت:** ثبت خطاهای رکوردبه‌رکورد همگام‌سازی با امکان بررسی و حل. | **ارتباط:** فرزند `sync_jobs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Sync Worker. | **چرخه عمر:** باز تا رفع. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Integration`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sync_errors | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| sync_errors | id | شناسه خطا | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193se00-...-0001` |
| sync_errors | sync_job_id | Job همگام‌سازی | UUID | NO | NO | sync_jobs(organization_id,id) | - | Composite FK | idx_se_sj | Internal | Worker | same org | `0193sj00-...-0001` |
| sync_errors | external_id | شناسه رکورد خطادار در مبدأ | VARCHAR(128) | YES | NO | - | NULL | - | - | Provenance | Worker | - | `SEP-9950` |
| sync_errors | error_code | کد خطای استاندارد | VARCHAR(50) | NO | NO | - | - | - | - | Internal | Worker | non-empty | `MISSING_CURRENCY` |
| sync_errors | error_message | پیام قابل فهم خطا | TEXT | NO | NO | - | - | - | - | Internal | Worker | non-empty | `واحد پول در ردیف مشخص نیست` |
| sync_errors | resolved_at | زمان رفع خطا | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Audit | User/System | UTC | `NULL` |

### ۷۲. جدول `import_batches`
* **مسئولیت:** مدیریت ورود فایل‌های Excel/CSV با قالب نگاشت ستون‌ها و کلید Idempotency. | **ارتباط:** متصل به `documents`, `source_systems`؛ والد `import_rows`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر هنگام Import. | **چرخه عمر:** `PARSING -> PREVIEW -> IMPORTED | PARTIAL | FAILED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** اجرای مجدد با همان `idempotency_key` یا محتوای تکراری نباید رکورد تکراری بسازد. | **ماژول:** `Integration/Import`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| import_batches | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_ib_org | Internal | System | valid org | `0193a000-...-0001` |
| import_batches | id | شناسه دسته Import | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ib00-...-0001` |
| import_batches | document_id | فایل اکسل/CSV مبدأ | UUID | NO | NO | documents(organization_id,id) | - | Composite FK | - | Provenance | User | same org | `0193d000-...-0011` |
| import_batches | source_system_id | سیستم تولیدکننده فایل (مثل هلو/سپیدار/اکسل عمومی) | UUID | NO | NO | source_systems(id) | - | ON DELETE RESTRICT | - | Provenance | User/System | valid system | `0193ssy0-...-0001` |
| import_batches | column_mapping_template_name | نام قالب ذخیره‌شده نگاشت ستون‌ها | VARCHAR(100) | YES | NO | - | NULL | - | - | Internal | User | - | `گزارش فروش سپیدار ۱۴۰۵` |
| import_batches | total_rows | کل سطرهای فایل | INTEGER | NO | NO | - | 0 | >= 0 | - | Internal | Engine | >= 0 | `100` |
| import_batches | duplicate_rows | سطرهای تکراری ردشده | INTEGER | NO | NO | - | 0 | >= 0 | - | Audit | Engine | >= 0 | `99` |
| import_batches | idempotency_key | کلید جلوگیری از اجرای تکراری کل دسته | VARCHAR(128) | NO | NO | - | - | UQ(organization_id,idempotency_key) | UQ | System | System | unique hash | `imp_sha256_...` |

### ۷۳. جدول `import_rows`
* **مسئولیت:** نگهداری تک‌تک سطرهای خام فایل Excel/CSV، وضعیت اعتبارسنجی هر سطر، خطاهای سطری و ارجاع به رکورد مقصد. | **ارتباط:** فرزند `import_batches`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Parser ایجاد و پردازشگر به‌روز می‌کند. | **چرخه عمر:** `VALID | INVALID | DUPLICATE_SKIPPED | IMPORTED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** سطرهای `INVALID` هرگز به جداول مالی منتقل نمی‌شوند. | **ماژول:** `Integration/Import`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| import_rows | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| import_rows | id | شناسه سطر فایل | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ir00-...-0001` |
| import_rows | import_batch_id | دسته Import والد | UUID | NO | NO | import_batches(organization_id,id) | - | Composite FK, UQ(organization_id,import_batch_id,row_number) | UQ | Internal | System | same org | `0193ib00-...-0001` |
| import_rows | row_number | شماره سطر در فایل اکسل | INTEGER | NO | NO | - | - | >= 1 | UQ | Provenance | Parser | >= 1 | `14` |
| import_rows | row_hash | هش محتوای نرمال‌سازی‌شده سطر | CHAR(64) | NO | NO | - | - | - | idx_ir_hash | Internal | System | 64 hex | `a4f1b2...` |
| import_rows | raw_row_json | مقادیر خام ستون‌های متغیر سطر | JSONB | NO | NO | - | - | - | - | Confidential | Parser | valid JSON object | `{"کد مشتری":"1042","مبلغ":"5000000"}` |
| import_rows | validation_status | نتیجه کنترل سطر | VARCHAR(25) | NO | NO | - | `'VALID'` | IN('VALID','INVALID','DUPLICATE_SKIPPED','IMPORTED') | idx_ir_stat | Financial | Engine | enum | `IMPORTED` |
| import_rows | error_message | علت رد شدن سطر در صورت خرابی داده | TEXT | YES | NO | - | NULL | - | - | Internal | Engine | - | `NULL` |
| import_rows | target_entity_type | نوع رکورد ساخته‌شده (`INVOICE`, `BANK_TX`, ...) | VARCHAR(30) | YES | NO | - | NULL | - | - | Provenance | Engine | enum | `INVOICE` |
| import_rows | target_entity_id | شناسه رکورد ساخته‌شده | UUID | YES | NO | - | NULL | - | - | Provenance | Engine | valid UUID | `0193iv00-...-0010` |

---

# بخش ۹: `Reconciliation` (جداول ۷۴ تا ۷۷)

### ۷۴. جدول `reconciliation_rules`
* **مسئولیت:** تعریف قواعد و تلرانس تاریخ/مبلغ برای تطبیق خودکار بانک، طرف‌حساب، فاکتور و انبار. | **ارتباط:** متعلق به `organizations` (یا سراسری). | **مالکیت:** Hybrid (`organization_id NULL` = پیش‌فرض سیستم). | **ایجاد/اصلاح:** سیستم یا مدیر مالی. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `amount_tolerance_irr >= 0`. | **ماژول:** `Reconciliation`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reconciliation_rules | id | شناسه قاعده تطبیق | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193rr00-...-0001` |
| reconciliation_rules | organization_id | سازمان (NULL = قاعده سیستمی) | UUID | YES | NO | organizations(id) | NULL | - | idx_rr_org | Internal | System/CFO | valid org/null | `NULL` |
| reconciliation_rules | reconciliation_domain | دامنه (`BANK`, `PARTY`, `INVOICE_PAYMENT`, `INVENTORY`) | VARCHAR(25) | NO | NO | - | - | IN('BANK','PARTY','INVOICE_PAYMENT','INVENTORY') | - | Financial | System | enum | `BANK` |
| reconciliation_rules | rule_code | کد قاعده | VARCHAR(50) | NO | NO | - | - | - | - | Internal | System | uppercase | `BANK_EXACT_REF_AMT` |
| reconciliation_rules | date_tolerance_days | اختلاف روز مجاز در تطبیق | SMALLINT | NO | NO | - | 2 | >= 0 | - | Financial | CFO | >= 0 | `2` |
| reconciliation_rules | amount_tolerance_irr | اختلاف مبلغ مجاز (مثلاً کارمزد یا رند) | NUMERIC(18,0) | NO | NO | - | 0 | >= 0 | - | Financial | CFO | >= 0 | `0` |
| reconciliation_rules | is_active | فعال بودن | BOOLEAN | NO | NO | - | true | - | - | Internal | System | boolean | `true` |

### ۷۵. جدول `reconciliation_runs`
* **مسئولیت:** ثبت هر نوبت اجرای فرآیند مغایرت‌گیری روی بازه و هدف مشخص. | **ارتباط:** والد `reconciliation_matches`, `reconciliation_exceptions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** موتور تطبیق. | **چرخه عمر:** `RUNNING -> COMPLETED | FAILED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** دارد (`period_end >= period_start`). | **ماژول:** `Reconciliation`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reconciliation_runs | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_rrun_org | Financial | System | valid org | `0193a000-...-0001` |
| reconciliation_runs | id | شناسه اجرای تطبیق | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193rrn0-...-0001` |
| reconciliation_runs | reconciliation_domain | دامنه تطبیق | VARCHAR(25) | NO | NO | - | - | IN('BANK','PARTY','INVOICE_PAYMENT','INVENTORY') | - | Financial | User/Engine | enum | `BANK` |
| reconciliation_runs | period_start | تاریخ شروع بازه | DATE | NO | NO | - | - | - | - | Financial | User | valid date | `2026-10-23` |
| reconciliation_runs | period_end | تاریخ پایان بازه | DATE | NO | NO | - | - | CHECK(period_end >= period_start) | - | Financial | User | >= period_start | `2026-11-21` |
| reconciliation_runs | run_status | وضعیت اجرا | VARCHAR(20) | NO | NO | - | `'RUNNING'` | IN('RUNNING','COMPLETED','FAILED') | - | Internal | Engine | enum | `COMPLETED` |
| reconciliation_runs | started_by_membership_id | درخواست‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| reconciliation_runs | started_at | زمان شروع | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T12:00Z` |

### ۷۶. جدول `reconciliation_matches`
* **مسئولیت:** ثبت تطبیق‌های قطعی، پیشنهادی (احتمالی) و دستی بین دو طرف (با پشتیبانی تطبیق چندبه‌چند). | **ارتباط:** فرزند `reconciliation_runs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** موتور تطبیق ایجاد و حسابدار پیشنهادهای احتمالی را تایید/رد می‌کند. | **چرخه عمر:** `PENDING -> ACCEPTED | REJECTED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `PROBABILISTIC_SUGGESTED` تا پیش از `ACCEPTED` قطعی تلقی نمی‌شود. | **ماژول:** `Reconciliation`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reconciliation_matches | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Financial | System | valid org | `0193a000-...-0001` |
| reconciliation_matches | id | شناسه جفت تطبیق | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193rm00-...-0001` |
| reconciliation_matches | reconciliation_run_id | اجرای تطبیق والد | UUID | NO | NO | reconciliation_runs(organization_id,id) | - | Composite FK | idx_rm_run | Financial | System | same org | `0193rrn0-...-0001` |
| reconciliation_matches | match_confidence_type | نوع قطعیت (`EXACT_CONFIRMED`, `PROBABILISTIC_SUGGESTED`, `MANUAL_CONFIRMED`) | VARCHAR(30) | NO | NO | - | - | enum | - | Financial | Engine/User | enum | `EXACT_CONFIRMED` |
| reconciliation_matches | left_entity_type | موجودیت سمت چپ (`BANK_TX`, `INVOICE`, `STOCK_SNAPSHOT`) | VARCHAR(30) | NO | NO | - | - | - | idx_rm_left | Provenance | Engine | enum | `BANK_TX` |
| reconciliation_matches | left_entity_id | شناسه سمت چپ | UUID | NO | NO | - | - | - | idx_rm_left | Provenance | Engine | valid UUID | `0193bt00-...-0001` |
| reconciliation_matches | right_entity_type | موجودیت سمت راست (`PAYMENT`, `CHECK`, `INVENTORY_MOVEMENT`) | VARCHAR(30) | NO | NO | - | - | - | idx_rm_right | Provenance | Engine | enum | `PAYMENT` |
| reconciliation_matches | right_entity_id | شناسه سمت راست | UUID | NO | NO | - | - | - | idx_rm_right | Provenance | Engine | valid UUID | `0193py00-...-0003` |
| reconciliation_matches | matched_amount_irr | مبلغ تطبیق‌یافته (برای تطبیق چندبه‌چند) | NUMERIC(18,0) | YES | NO | - | NULL | >= 0 | - | Financial | Engine | >= 0 | `150000000` |
| reconciliation_matches | score | امتیاز تطبیق (`0..1`) | NUMERIC(5,4) | NO | NO | - | 1.0000 | BETWEEN 0 AND 1 | - | Quality | Engine | 0..1 | `1.0000` |
| reconciliation_matches | decision_status | وضعیت تایید انسانی | VARCHAR(20) | NO | NO | - | `'PENDING'` | IN('PENDING','ACCEPTED','REJECTED') | - | Audit | User/Engine | enum | `ACCEPTED` |

### ۷۷. جدول `reconciliation_exceptions`
* **مسئولیت:** ثبت مغایرت‌های کشف‌شده (تراکنش بدون سند، سند بدون تراکنش، اختلاف مبلغ/تعداد انبار). | **ارتباط:** فرزند `reconciliation_runs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** موتور تطبیق ایجاد و کاربر رفع/توضیح می‌دهد. | **چرخه عمر:** `OPEN -> RESOLVED | DISMISSED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** مغایرت باز مانع اعلام گزارش «اطمینان بالا» می‌شود. | **ماژول:** `Reconciliation`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reconciliation_exceptions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_re_org | Financial | System | valid org | `0193a000-...-0001` |
| reconciliation_exceptions | id | شناسه مغایرت | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193re00-...-0001` |
| reconciliation_exceptions | reconciliation_run_id | اجرای والد | UUID | NO | NO | reconciliation_runs(organization_id,id) | - | Composite FK | idx_re_run | Financial | System | same org | `0193rrn0-...-0001` |
| reconciliation_exceptions | exception_type | نوع مغایرت | VARCHAR(35) | NO | NO | - | - | IN('MISSING_BOOK_RECORD','MISSING_BANK_TX','AMOUNT_MISMATCH','DATE_MISMATCH','STOCK_VARIANCE','POTENTIAL_DUPLICATE') | - | Financial | Engine | enum | `STOCK_VARIANCE` |
| reconciliation_exceptions | entity_type | نوع موجودیت دچار مغایرت | VARCHAR(30) | NO | NO | - | - | - | - | Provenance | Engine | enum | `PRODUCT` |
| reconciliation_exceptions | entity_id | شناسه موجودیت | UUID | NO | NO | - | - | - | - | Provenance | Engine | valid UUID | `0193pr00-...-0002` |
| reconciliation_exceptions | variance_amount_irr | میزان اختلاف ریالی | NUMERIC(18,0) | YES | NO | - | NULL | - | - | Financial | Engine | decimal | `0` |
| reconciliation_exceptions | variance_qty | میزان اختلاف تعدادی (در انبار) | NUMERIC(18,4) | YES | NO | - | NULL | - | - | Financial | Engine | decimal | `15.0000` |
| reconciliation_exceptions | resolution_status | وضعیت پیگیری | VARCHAR(20) | NO | NO | - | `'OPEN'` | IN('OPEN','RESOLVED','DISMISSED') | idx_re_stat | Audit | User | enum | `OPEN` |

---

# بخش ۱۰: `Processing & Workflow` (جداول ۷۸ تا ۸۷)

### ۷۸. جدول `service_definitions` *(PROVISIONAL)*
* **مسئولیت:** کاتالوگ خدمات استاندارد محصول (مطابق دسته‌بندی‌های مرحله ۲ و PRD). | **ارتباط:** والد `workflow_definitions`, `report_definitions`, `assistant_recommendations`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Seed. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Workflow/Discovery`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| service_definitions | id | شناسه خدمت | UUID | NO | YES | - | gen_random_uuid() | - | PK | Public | System | UUID | `0193sd00-...-0003` |
| service_definitions | service_code | کد استاندارد خدمت | VARCHAR(60) | NO | NO | - | - | UNIQUE | UQ | Internal | System | uppercase | `AR_AGING_ANALYSIS` |
| service_definitions | name_fa | نام فارسی خدمت | VARCHAR(150) | NO | NO | - | - | - | - | Public | System | non-empty | `تحلیل بدهی معوق مشتریان` |
| service_definitions | priority_tier | اولویت محصول (`P0..P3`) | VARCHAR(5) | NO | NO | - | `'P0'` | IN('P0','P1','P2','P3') | - | Internal | System | enum | `P0` |
| service_definitions | risk_level | سطح ریسک مالی (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) | VARCHAR(15) | NO | NO | - | `'MEDIUM'` | enum | - | Security | System | enum | `HIGH` |
| service_definitions | is_active | فعال بودن در محیط | BOOLEAN | NO | NO | - | true | - | - | Internal | System | boolean | `true` |

### ۷۹. جدول `workflow_definitions` *(PROVISIONAL)*
* **مسئولیت:** تعریف نسخه‌بندی‌شده مراحل State Machine هر خدمت. | **ارتباط:** فرزند `service_definitions`؛ والد `workflow_executions`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Seed/Release. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Orchestrator`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workflow_definitions | id | شناسه تعریف گردشکار | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193wd00-...-0001` |
| workflow_definitions | service_id | خدمت مرتبط | UUID | NO | NO | service_definitions(id) | - | ON DELETE RESTRICT | - | Internal | System | valid service | `0193sd00-...-0003` |
| workflow_definitions | workflow_code | کد گردشکار | VARCHAR(60) | NO | NO | - | - | - | - | Internal | System | uppercase | `WF_AR_AGING` |
| workflow_definitions | version_number | شماره نسخه گردشکار | INTEGER | NO | NO | - | 1 | UQ(workflow_code,version_number) | UQ | Internal | System | >= 1 | `1` |
| workflow_definitions | is_active | نسخه فعال فعلی | BOOLEAN | NO | NO | - | true | - | - | Internal | System | boolean | `true` |

### ۸۰. جدول `workflow_executions`
* **مسئولیت:** نگهداری وضعیت اجرای یک گردشکار واقعی کاربر (با قابلیت توقف، ازسرگیری و جلوگیری از اجرای تکراری). | **ارتباط:** متصل به `workflow_definitions`, `organization_memberships`؛ والد `workflow_step_executions`, `processing_jobs`, `approval_requests`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Orchestrator. | **چرخه عمر:** ۱۰ وضعیت استاندارد (`Draft` .. `Completed` / `Partially Completed` / `Failed` / `Cancelled`). | **حذف:** `RESTRICT`. | **محدودیت مالی:** `idempotency_key` مانع اجرای تکراری عملیات ثبت مالی است. | **ماژول:** `Orchestrator`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workflow_executions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_we_org | Internal | System | valid org | `0193a000-...-0001` |
| workflow_executions | id | شناسه اجرای گردشکار | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193we00-...-0001` |
| workflow_executions | workflow_definition_id | نسخه گردشکار | UUID | NO | NO | workflow_definitions(id) | - | ON DELETE RESTRICT | - | Provenance | System | valid def | `0193wd00-...-0001` |
| workflow_executions | requested_by_membership_id | کاربر شروع‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | idx_we_mem | Audit | System | same org | `0193m000-...-0001` |
| workflow_executions | current_state | وضعیت فعلی State Machine | VARCHAR(25) | NO | NO | - | `'Draft'` | IN('Draft','Checking Readiness','Awaiting Input','Processing','Awaiting Review','Awaiting Approval','Completed','Partially Completed','Failed','Cancelled') | idx_we_state | Internal | Engine | enum | `Completed` |
| workflow_executions | input_params_json | پارامترهای ساختاریافته ورودی | JSONB | NO | NO | - | `'{}'::jsonb` | - | - | Internal | Orchestrator | valid JSON | `{"overdue_days":30}` |
| workflow_executions | checkpoint_state_json | وضعیت ذخیره شده برای ازسرگیری | JSONB | NO | NO | - | `'{}'::jsonb` | - | - | Internal | Orchestrator | valid JSON | `{"step":3}` |
| workflow_executions | idempotency_key | کلید یکتا | VARCHAR(128) | NO | NO | - | - | UQ(organization_id,idempotency_key) | UQ | System | System | unique hash | `wf_ar_20261113_01` |
| workflow_executions | started_at | زمان شروع | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T12:10Z` |

### ۸۱. جدول `workflow_step_executions`
* **مسئولیت:** ثبت تاریخچه تمام انتقال‌های وضعیت (`Transitions`) یک گردشکار. | **ارتباط:** فرزند `workflow_executions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** ندارد. | **ماژول:** `Orchestrator`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workflow_step_executions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| workflow_step_executions | id | شناسه گام | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193wse0-...-0001` |
| workflow_step_executions | workflow_execution_id | اجرای گردشکار والد | UUID | NO | NO | workflow_executions(organization_id,id) | - | Composite FK | idx_wse_we | Internal | System | same org | `0193we00-...-0001` |
| workflow_step_executions | step_code | کد گام | VARCHAR(50) | NO | NO | - | - | - | - | Internal | Engine | uppercase | `CHECK_READINESS` |
| workflow_step_executions | from_state | وضعیت مبدا | VARCHAR(25) | NO | NO | - | - | - | - | Audit | Engine | enum | `Draft` |
| workflow_step_executions | to_state | وضعیت مقصد | VARCHAR(25) | NO | NO | - | - | - | - | Audit | Engine | enum | `Checking Readiness` |
| workflow_step_executions | actor_membership_id | عامل انتقال (NULL اگر سیستمی باشد) | UUID | YES | NO | organization_memberships(organization_id,id) | NULL | Composite FK | - | Audit | System | same org | `NULL` |
| workflow_step_executions | occurred_at | زمان انتقال | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T12:10Z` |

### ۸۲. جدول `processing_jobs`
* **مسئولیت:** ثبت درخواست‌های اجرای پردازش‌های مالی قطعی (مربوط به بخش ۷ PRD). | **ارتباط:** متصل به `workflow_executions`؛ والد `processing_results`, `processing_warnings`, `processing_errors`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Processing Engine. | **چرخه عمر:** `READY -> RUNNING -> COMPLETED | COMPLETED_WITH_WARNINGS | NEEDS_REVIEW | FAILED | INCOMPLETE_INPUT`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** نگهداری نسخه الگوریتم (`algorithm_version`) برای بازتولید. | **ماژول:** `Processing`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| processing_jobs | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_pj_org | Internal | System | valid org | `0193a000-...-0001` |
| processing_jobs | id | شناسه پردازش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193pj00-...-0001` |
| processing_jobs | workflow_execution_id | گردشکار مرتبط | UUID | YES | NO | workflow_executions(organization_id,id) | NULL | Composite FK | idx_pj_we | Internal | System | same org | `0193we00-...-0001` |
| processing_jobs | job_type | نوع پردازش (`AR_AGING`, `INVENTORY_CALC`, `PNL`, ...) | VARCHAR(40) | NO | NO | - | - | - | - | Internal | Engine | uppercase | `AR_AGING` |
| processing_jobs | job_status | وضعیت پردازش | VARCHAR(30) | NO | NO | - | `'READY'` | IN('READY','RUNNING','COMPLETED','COMPLETED_WITH_WARNINGS','NEEDS_REVIEW','FAILED','INCOMPLETE_INPUT') | idx_pj_stat | Internal | Engine | enum | `COMPLETED` |
| processing_jobs | algorithm_version | نسخه منطق محاسبه | VARCHAR(20) | NO | NO | - | `'1.0.0'` | - | - | Provenance | Engine | semver | `1.0.0` |
| processing_jobs | started_at | زمان شروع | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Internal | Engine | UTC | `2026-11-13T12:10Z` |
| processing_jobs | finished_at | زمان پایان | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Internal | Engine | UTC | `2026-11-13T12:10Z` |

### ۸۳. جدول `processing_results`
* **مسئولیت:** ذخیره نتیجه رسمی یک پردازش مالی متصل به هش Snapshot داده‌های ورودی. | **ارتباط:** فرزند `processing_jobs`؛ والد `processing_result_sources`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی (نسخه‌بندی‌شده). | **حذف:** `RESTRICT`. | **محدودیت مالی:** `confidence_level` از کیفیت داده حاصل می‌شود نه حدس LLM. | **ماژول:** `Processing`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| processing_results | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Financial | System | valid org | `0193a000-...-0001` |
| processing_results | id | شناسه نتیجه پردازش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193prl0-...-0001` |
| processing_results | processing_job_id | Job والد | UUID | NO | NO | processing_jobs(organization_id,id) | - | Composite FK | idx_prl_pj | Financial | Engine | same org | `0193pj00-...-0001` |
| processing_results | confidence_level | سطح اطمینان داده‌ای (`HIGH`, `MEDIUM`, `LOW`) | VARCHAR(10) | NO | NO | - | - | IN('HIGH','MEDIUM','LOW') | - | Quality | Engine | enum | `HIGH` |
| processing_results | summary_json | خلاصه ساختاریافته خروجی موتور قطعی | JSONB | NO | NO | - | - | - | - | Financial | Engine | valid JSON | `{"total_overdue_irr":120000000}` |
| processing_results | data_snapshot_hash | هش داده‌های ورودی زمان اجرا | CHAR(64) | NO | NO | - | - | - | - | Provenance | Engine | 64 hex | `7c211433...` |
| processing_results | created_at | زمان تولید نتیجه | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T12:10Z` |

### ۸۴. جدول `processing_result_sources`
* **مسئولیت:** ثبت فهرست رکوردها و اسناد ورودی تشکیل‌دهنده نتیجه یک پردازش. | **ارتباط:** فرزند `processing_results`، متصل به `documents`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** ضامن ردیابی‌پذیری نتیجه. | **ماژول:** `Processing/Provenance`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| processing_result_sources | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Provenance | System | valid org | `0193a000-...-0001` |
| processing_result_sources | id | شناسه رکورد منبع | UUID | NO | YES | - | gen_random_uuid() | - | PK | Provenance | System | UUID | `0193prs0-...-0001` |
| processing_result_sources | processing_result_id | نتیجه والد | UUID | NO | NO | processing_results(organization_id,id) | - | Composite FK | idx_prs_res | Provenance | Engine | same org | `0193prl0-...-0001` |
| processing_result_sources | source_entity_type | نوع رکورد منبع (`INVOICE`, `PAYMENT`, `CHECK`) | VARCHAR(30) | NO | NO | - | - | - | - | Provenance | Engine | enum | `INVOICE` |
| processing_result_sources | source_entity_id | شناسه رکورد منبع | UUID | NO | NO | - | - | - | - | Provenance | Engine | valid UUID | `0193iv00-...-0001` |
| processing_result_sources | source_document_id | سند تصویری/فایل مرجع | UUID | YES | NO | documents(organization_id,id) | NULL | Composite FK | - | Provenance | Engine | same org | `0193d000-...-0001` |

### ۸۵. جدول `processing_warnings`
* **مسئولیت:** ثبت هشدارهای مالی یا کیفی در حین پردازش (مانند وجود ۲ فاکتور `Needs Review` یا نبود بهای تمام‌شده برای ۳ کالا). | **ارتباط:** فرزند `processing_jobs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Engine. | **چرخه عمر:** دائمی. | **حذف:** `RESTRICT`. | **محدودیت مالی:** هشدارها حتماً در خروجی گزارش منعکس می‌شوند. | **ماژول:** `Processing`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| processing_warnings | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| processing_warnings | id | شناسه هشدار | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193pw00-...-0001` |
| processing_warnings | processing_job_id | Job والد | UUID | NO | NO | processing_jobs(organization_id,id) | - | Composite FK | idx_pw_pj | Internal | Engine | same org | `0193pj00-...-0001` |
| processing_warnings | warning_code | کد استاندارد هشدار | VARCHAR(50) | NO | NO | - | - | - | - | Quality | Engine | uppercase | `PENDING_DOCS_EXCLUDED` |
| processing_warnings | message_fa | پیام واضح فارسی برای کاربر | TEXT | NO | NO | - | - | - | - | Internal | Engine | non-empty | `۲ فاکتور منتظر تایید در محاسبه لحاظ نشدند.` |

### ۸۶. جدول `processing_errors`
* **مسئولیت:** ثبت خطاهای مانع تکمیل پردازش و راهنمای بازیابی (`Error Recovery`). | **ارتباط:** فرزند `processing_jobs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Engine. | **چرخه عمر:** دائمی. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Processing`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| processing_errors | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| processing_errors | id | شناسه خطا | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193pe00-...-0001` |
| processing_errors | processing_job_id | Job والد | UUID | NO | NO | processing_jobs(organization_id,id) | - | Composite FK | idx_pe_pj | Internal | Engine | same org | `0193pj00-...-0001` |
| processing_errors | error_code | کد خطا | VARCHAR(50) | NO | NO | - | - | - | - | Internal | Engine | uppercase | `VALUATION_POLICY_UNSET` |
| processing_errors | is_recoverable | قابلیت بازیابی توسط کاربر | BOOLEAN | NO | NO | - | true | - | - | Internal | Engine | boolean | `true` |
| processing_errors | message_fa | توضیح خطا و مسیر رفع آن | TEXT | NO | NO | - | - | - | - | Internal | Engine | non-empty | `روش قیمت‌گذاری موجودی مشخص نشده است.` |

### ۸۷. جدول `approval_requests`
* **مسئولیت:** مدیریت دروازه تأیید انسانی (`Human Approval Gate`) پیش از تغییرات حساس مالی (مانند `Posted` کردن فاکتور بالای سقف). | **ارتباط:** متصل به `workflow_executions` و `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Orchestrator ایجاد و تاییدکننده تصمیم می‌گیرد. | **چرخه عمر:** `PENDING -> APPROVED | REJECTED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** تاییدکننده باید دارای `required_permission_code` باشد و نباید با درخواست‌کننده در حالت `Dual Approval` یکی باشد. | **ماژول:** `Workflow/Security`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| approval_requests | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_ar_org | Security | System | valid org | `0193a000-...-0001` |
| approval_requests | id | شناسه درخواست تایید | UUID | NO | YES | - | gen_random_uuid() | - | PK | Security | System | UUID | `0193apr0-...-0001` |
| approval_requests | workflow_execution_id | گردشکار منتظر تایید | UUID | NO | NO | workflow_executions(organization_id,id) | - | Composite FK | idx_apr_we | Security | System | same org | `0193we00-...-0001` |
| approval_requests | target_entity_type | نوع رکورد مالی (`INVOICE`, `PAYMENT`, `PERIOD_REOPEN`) | VARCHAR(30) | NO | NO | - | - | - | - | Financial | Engine | enum | `INVOICE` |
| approval_requests | target_entity_id | شناسه رکورد هدف | UUID | NO | NO | - | - | - | - | Financial | Engine | valid UUID | `0193iv00-...-0001` |
| approval_requests | required_permission_code | مجوز موردنیاز برای تایید | VARCHAR(80) | NO | NO | - | - | - | - | Security | System | valid perm | `invoice:post` |
| approval_requests | requested_by_membership_id | درخواست‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| approval_requests | decision | تصمیم تاییدکننده | VARCHAR(20) | NO | NO | - | `'PENDING'` | IN('PENDING','APPROVED','REJECTED') | idx_apr_dec | Security | Approver | enum | `APPROVED` |
| approval_requests | decided_by_membership_id | عضو تصمیم‌گیرنده | UUID | YES | NO | organization_memberships(organization_id,id) | NULL | Composite FK | - | Audit | Approver | same org | `0193m000-...-0002` |
| approval_requests | decided_at | زمان تصمیم | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Audit | System | UTC | `2026-11-13T12:15Z` |

---

# بخش ۱۱: `Reporting & Evidence` (جداول ۸۸ تا ۹۴)

### ۸۸. جدول `report_definitions`
* **مسئولیت:** تعریف الگوهای استاندارد گزارش به همراه نسخه فرمول محاسبه. | **ارتباط:** متصل به `service_definitions`؛ والد `report_executions`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Seed/Release. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** تغییر فرمول نیازمند افزایش `formula_version` است. | **ماژول:** `Reporting`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| report_definitions | id | شناسه تعریف گزارش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193rd00-...-0001` |
| report_definitions | report_code | کد یکتای گزارش | VARCHAR(60) | NO | NO | - | - | UNIQUE | UQ | Internal | System | uppercase | `RPT_AR_AGING` |
| report_definitions | name_fa | عنوان فارسی گزارش | VARCHAR(150) | NO | NO | - | - | - | - | Public | System | non-empty | `گزارش سنی مطالبات مشتریان` |
| report_definitions | service_id | خدمت مرتبط | UUID | NO | NO | service_definitions(id) | - | ON DELETE RESTRICT | - | Internal | System | valid service | `0193sd00-...-0003` |
| report_definitions | formula_version | نسخه فرمول محاسباتی | VARCHAR(20) | NO | NO | - | `'1.0.0'` | - | - | Provenance | System | semver | `1.0.0` |

### ۸۹. جدول `report_data_snapshots`
* **مسئولیت:** فریز کردن وضعیت و تعداد اسناد تاییدشده/معلق در لحظه تولید گزارش تا گزارش قبلی با ورود اسناد جدید بی‌صدا تغییر نکند. | **ارتباط:** متصل به `fiscal_periods`؛ والد `report_executions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ضامن بازتولیدپذیری نتایج گزارش. | **ماژول:** `Reporting`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| report_data_snapshots | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_rds_org | Financial | System | valid org | `0193a000-...-0001` |
| report_data_snapshots | id | شناسه اسنپ‌شات داده | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193rds0-...-0001` |
| report_data_snapshots | as_of_timestamp | لحظه برش زمانی داده‌ها | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Provenance | Engine | UTC | `2026-11-13T10:00Z` |
| report_data_snapshots | fiscal_period_id | دوره مالی هدف (اختیاری) | UUID | YES | NO | fiscal_periods(organization_id,id) | NULL | Composite FK | - | Financial | Engine | same org | `0193fp00-...-08` |
| report_data_snapshots | included_document_count | تعداد اسناد `Posted` لحاظ‌شده | INTEGER | NO | NO | - | 0 | >= 0 | - | Quality | Engine | >= 0 | `40` |
| report_data_snapshots | pending_document_count | تعداد اسناد `Needs Review` لحاظ‌نشده در لحظه اجرا | INTEGER | NO | NO | - | 0 | >= 0 | - | Quality | Engine | >= 0 | `2` |
| report_data_snapshots | snapshot_hash | هش مجموعه رکوردهای ورودی | CHAR(64) | NO | NO | - | - | - | - | Provenance | Engine | 64 hex | `9b74c989...` |

### ۹۰. جدول `report_executions`
* **مسئولیت:** ثبت هر بار درخواست اجرای گزارش با پارامترهای دقیق، سطح اطمینان و ارجاع به Snapshot. | **ارتباط:** متصل به `report_definitions`, `report_data_snapshots`, `workflow_executions`, `organization_memberships`؛ والد `report_versions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Reporting Engine. | **چرخه عمر:** `COMPLETED | PARTIAL | FAILED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `Reporting`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| report_executions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_rex_org | Financial | System | valid org | `0193a000-...-0001` |
| report_executions | id | شناسه اجرای گزارش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193rex0-...-0001` |
| report_executions | report_definition_id | الگوی گزارش | UUID | NO | NO | report_definitions(id) | - | ON DELETE RESTRICT | - | Internal | System | valid def | `0193rd00-...-0001` |
| report_executions | data_snapshot_id | اسنپ‌شات داده‌ای قفل‌شده | UUID | NO | NO | report_data_snapshots(organization_id,id) | - | Composite FK | - | Provenance | Engine | same org | `0193rds0-...-0001` |
| report_executions | workflow_execution_id | گردشکار مرتبط (اختیاری) | UUID | YES | NO | workflow_executions(organization_id,id) | NULL | Composite FK | - | Internal | System | same org | `0193we00-...-0001` |
| report_executions | requested_by_membership_id | کاربر درخواست‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| report_executions | parameters_json | فیلترهای درخواستی کاربر | JSONB | NO | NO | - | `'{}'::jsonb` | - | - | Internal | User | valid JSON | `{"as_of":"1405/08/22"}` |
| report_executions | confidence_level | سطح اطمینان کلی گزارش (`HIGH`, `MEDIUM`, `LOW`) | VARCHAR(10) | NO | NO | - | - | IN('HIGH','MEDIUM','LOW') | - | Quality | Engine | enum | `MEDIUM` |
| report_executions | executed_at | زمان اجرا | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_rex_time | Audit | System | UTC | `2026-11-13T10:00Z` |

### ۹۱. جدول `report_versions`
* **مسئولیت:** مدیریت نسخه‌های متوالی یک گزارش برای امکان مقایسه `v1` و `v2` پس از تکمیل اسناد جدید. | **ارتباط:** فرزند `report_executions`؛ والد `report_metrics`, `report_evidences`, `report_outputs`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** نسخه قبلی هرگز بازنویسی نمی‌شود. | **ماژول:** `Reporting`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| report_versions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Financial | System | valid org | `0193a000-...-0001` |
| report_versions | id | شناسه نسخه گزارش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193rv00-...-0001` |
| report_versions | report_execution_id | اجرای گزارش والد | UUID | NO | NO | report_executions(organization_id,id) | - | Composite FK, UQ(organization_id,report_execution_id,version_number) | UQ | Financial | System | same org | `0193rex0-...-0001` |
| report_versions | version_number | شماره نسخه (`1, 2, ...`) | INTEGER | NO | NO | - | 1 | >= 1 | UQ | Provenance | Engine | >= 1 | `1` |
| report_versions | supersedes_report_version_id | ارجاع به نسخه قبلی جایگزین‌شده | UUID | YES | NO | report_versions(organization_id,id) | NULL | Composite FK | - | Provenance | Engine | same org | `NULL` |
| report_versions | is_latest | نشانگر جدیدترین نسخه | BOOLEAN | NO | NO | - | true | - | - | Internal | Engine | boolean | `true` |

### ۹۲. جدول `report_metrics`
* **مسئولیت:** ذخیره شاخص‌های عددی خروجی هر نسخه گزارش به صورت رابطه‌ای و دقیق (به جای حبس کردن عدد فقط در فایل PDF). | **ارتباط:** فرزند `report_versions`؛ والد `report_evidences`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** ذخیره با `NUMERIC(20,4)`. | **ماژول:** `Reporting`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| report_metrics | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Financial | System | valid org | `0193a000-...-0001` |
| report_metrics | id | شناسه شاخص گزارش | UUID | NO | YES | - | gen_random_uuid() | - | PK | Financial | System | UUID | `0193rmt0-...-0001` |
| report_metrics | report_version_id | نسخه گزارش والد | UUID | NO | NO | report_versions(organization_id,id) | - | Composite FK | idx_rmt_rv | Financial | System | same org | `0193rv00-...-0001` |
| report_metrics | metric_key | کلید استاندارد شاخص (`total_overdue_ar`, `net_sales`, ...) | VARCHAR(60) | NO | NO | - | - | - | - | Financial | Engine | snake_case | `total_overdue_ar` |
| report_metrics | metric_label_fa | برچسب فارسی شاخص | VARCHAR(120) | NO | NO | - | - | - | - | Public | Engine | non-empty | `جمع بدهی معوق مشتریان` |
| report_metrics | numeric_value | مقدار دقیق محاسبه‌شده | NUMERIC(20,4) | NO | NO | - | - | - | - | Financial | Deterministic Engine | decimal | `450000000.0000` |
| report_metrics | currency_code | واحد پول (در شاخص‌های پولی) | CHAR(3) | YES | NO | currencies(code) | `'IRR'` | - | - | Financial | Engine | valid currency | `IRR` |
| report_metrics | formula_code | کد فرمول استفاده‌شده | VARCHAR(50) | NO | NO | - | - | - | - | Provenance | Engine | uppercase | `AR_OVERDUE_FIFO_V1` |

### ۹۳. جدول `report_evidences`
* **مسئولیت:** اتصال مستقیم هر عدد و سطر گزارش به رکوردهای مالی و تصاویر اسناد تشکیل‌دهنده آن (`Drill-down Evidence`). | **ارتباط:** فرزند `report_versions` و `report_metrics`، متصل به `documents`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** مجموع `contribution_amount_irr` قابل تطبیق با شاخص است. | **ماژول:** `Reporting/Provenance`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| report_evidences | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Provenance | System | valid org | `0193a000-...-0001` |
| report_evidences | id | شناسه رکورد شاهد | UUID | NO | YES | - | gen_random_uuid() | - | PK | Provenance | System | UUID | `0193rev0-...-0001` |
| report_evidences | report_version_id | نسخه گزارش | UUID | NO | NO | report_versions(organization_id,id) | - | Composite FK | idx_rev_rv | Provenance | Engine | same org | `0193rv00-...-0001` |
| report_evidences | report_metric_id | شاخص متناظر در گزارش | UUID | YES | NO | report_metrics(organization_id,id) | NULL | Composite FK | idx_rev_met | Provenance | Engine | same org | `0193rmt0-...-0001` |
| report_evidences | source_entity_type | نوع رکورد منبع (`INVOICE`, `PAYMENT`, `CHECK`) | VARCHAR(30) | NO | NO | - | - | - | - | Provenance | Engine | enum | `INVOICE` |
| report_evidences | source_entity_id | شناسه رکورد منبع | UUID | NO | NO | - | - | - | - | Provenance | Engine | valid UUID | `0193iv00-...-0001` |
| report_evidences | source_document_id | سند تصویری/PDF مبدأ | UUID | YES | NO | documents(organization_id,id) | NULL | Composite FK | - | Provenance | Engine | same org | `0193d000-...-0001` |
| report_evidences | contribution_amount_irr | سهم عددی این رکورد در شاخص | NUMERIC(18,0) | YES | NO | - | NULL | - | - | Financial | Engine | decimal | `120000000` |

### ۹۴. جدول `report_outputs`
* **مسئولیت:** نگهداری فایل‌های خروجی تولیدشده (`Excel`, `PDF`, `CSV`, `JSON`) هر نسخه گزارش در Object Storage. | **ارتباط:** فرزند `report_versions`, متصل به `document_storage_objects`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Export Worker. | **چرخه عمر:** قابل تولید مجدد. | **حذف:** مطابق سیاست نگهداری. | **محدودیت مالی:** ندارد. | **ماژول:** `Reporting`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| report_outputs | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| report_outputs | id | شناسه فایل خروجی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ro00-...-0001` |
| report_outputs | report_version_id | نسخه گزارش | UUID | NO | NO | report_versions(organization_id,id) | - | Composite FK | idx_ro_rv | Internal | System | same org | `0193rv00-...-0001` |
| report_outputs | output_format | فرمت فایل (`EXCEL`, `PDF`, `CSV`, `JSON`) | VARCHAR(10) | NO | NO | - | - | IN('EXCEL','PDF','CSV','JSON') | - | Internal | User/Engine | enum | `EXCEL` |
| report_outputs | storage_object_id | فایل ذخیره‌شده در Storage | UUID | NO | NO | document_storage_objects(organization_id,id) | - | Composite FK | - | Confidential | Worker | same org | `0193dso0-...-0050` |
| report_outputs | generated_at | زمان تولید فایل | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T10:01Z` |

---

# بخش ۱۲: `AI Assistant & Conversation` (جداول ۹۵ تا ۱۰۰)

### ۹۵. جدول `conversations`
* **مسئولیت:** نگهداری نشست‌های گفتگوی کاربر با دستیار هوشمند (جدا از داده‌های مالی). | **ارتباط:** متصل به `organization_memberships`, `workflow_executions`؛ والد `conversation_contexts`, `conversation_messages`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام شروع مکالمه. | **چرخه عمر:** `ACTIVE -> ARCHIVED`. | **حذف:** `RESTRICT` در صورت وجود Audit مرتبط. | **محدودیت مالی:** متن چت هیچ اثر مالی مستقیمی ندارد. | **ماژول:** `AI Assistant`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| conversations | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_conv_org | Internal | System | valid org | `0193a000-...-0001` |
| conversations | id | شناسه مکالمه | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193cv00-...-0001` |
| conversations | membership_id | عضو مالک مکالمه | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | idx_conv_mem | Internal | System | same org | `0193m000-...-0001` |
| conversations | title | عنوان خلاصه مکالمه | VARCHAR(200) | YES | NO | - | NULL | - | - | Internal | AI/User | - | `بررسی بدهی مشتریان آبان` |
| conversations | active_workflow_execution_id | گردشکار جاری در مکالمه | UUID | YES | NO | workflow_executions(organization_id,id) | NULL | Composite FK | - | Internal | Orchestrator | same org | `0193we00-...-0001` |
| conversations | status | وضعیت مکالمه | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('ACTIVE','ARCHIVED') | - | Internal | User | enum | `ACTIVE` |
| conversations | last_message_at | زمان آخرین پیام | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_conv_last | Internal | System | UTC | `2026-11-13T12:12Z` |

### ۹۶. جدول `conversation_contexts`
* **مسئولیت:** نگهداری زمینه فعال نشست گفتگو (شعبه فعال، دوره مالی انتخابی، ارز نمایش). | **ارتباط:** `1:1` با `conversations`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** با تغییر فیلتر کاربر در چت. | **چرخه عمر:** همراه مکالمه. | **حذف:** `CASCADE` با حذف مکالمه آرشیوی بدون ممیزی. | **محدودیت مالی:** ندارد. | **ماژول:** `AI Assistant`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| conversation_contexts | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| conversation_contexts | conversation_id | شناسه مکالمه | UUID | NO | YES | conversations(organization_id,id) | - | Composite FK, PK | PK | Internal | System | same org | `0193cv00-...-0001` |
| conversation_contexts | active_branch_id | شعبه فیلترشده فعلی | UUID | YES | NO | branches(organization_id,id) | NULL | Composite FK | - | Internal | User | same org | `NULL` |
| conversation_contexts | active_fiscal_period_id | دوره مالی جاری زمینه | UUID | YES | NO | fiscal_periods(organization_id,id) | NULL | Composite FK | - | Internal | User/System | same org | `0193fp00-...-08` |
| conversation_contexts | display_currency_code | ارز ترجیحی در این مکالمه | CHAR(3) | NO | NO | currencies(code) | `'IRT'` | IN('IRR','IRT') | - | Internal | User | IRR/IRT | `IRT` |
| conversation_contexts | updated_at | زمان آخرین بروزرسانی زمینه | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T12:12Z` |

### ۹۷. جدول `conversation_messages`
* **مسئولیت:** ذخیره پیام‌های متنی کاربر و پاسخ دستیار با پیوند به Intent و خروجی گزارش/گردشکار. | **ارتباط:** فرزند `conversations`، والد `tool_invocations`, `user_feedback`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** `RESTRICT`. | **محدودیت مالی:** پیام دستیار صرفاً توضیح/رندر خروجی ابزارهای قطعی است. | **ماژول:** `AI Assistant`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| conversation_messages | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | - | Internal | System | valid org | `0193a000-...-0001` |
| conversation_messages | id | شناسه پیام | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193cm00-...-0001` |
| conversation_messages | conversation_id | مکالمه والد | UUID | NO | NO | conversations(organization_id,id) | - | Composite FK | idx_cm_conv | Internal | System | same org | `0193cv00-...-0001` |
| conversation_messages | sender_role | فرستنده (`USER`, `ASSISTANT`, `SYSTEM_WIDGET`) | VARCHAR(20) | NO | NO | - | - | IN('USER','ASSISTANT','SYSTEM_WIDGET') | - | Internal | System | enum | `USER` |
| conversation_messages | message_text | متن پیام | TEXT | NO | NO | - | - | - | - | Confidential | User/AI | non-empty | `کدام مشتری‌ها بدهی معوق دارند؟` |
| conversation_messages | detected_intent | Intent تشخیص‌داده‌شده | VARCHAR(60) | YES | NO | - | NULL | - | - | Internal | AI | uppercase | `AR_OVERDUE_ANALYSIS` |
| conversation_messages | linked_report_version_id | گزارش متصل به این پاسخ | UUID | YES | NO | report_versions(organization_id,id) | NULL | Composite FK | - | Provenance | Orchestrator | same org | `0193rv00-...-0001` |
| conversation_messages | created_at | زمان ثبت پیام | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_cm_conv | Internal | System | UTC | `2026-11-13T12:10Z` |

### ۹۸. جدول `tool_invocations`
* **مسئولیت:** ثبت ممیزی تمام فراخوانی‌های ابزارهای کنترل‌شده توسط دستیار هوشمند (با بررسی مجوز کاربر). | **ارتباط:** فرزند `conversation_messages`, متصل به `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only توسط AI Orchestrator. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** هیچ Toolای بدون `authorized_membership_id` اجرا نمی‌شود. | **ماژول:** `AI/Security`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tool_invocations | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_ti_org | Security | System | valid org | `0193a000-...-0001` |
| tool_invocations | id | شناسه اجرای ابزار | UUID | NO | YES | - | gen_random_uuid() | - | PK | Security | System | UUID | `0193ti00-...-0001` |
| tool_invocations | conversation_message_id | پیام محرک | UUID | NO | NO | conversation_messages(organization_id,id) | - | Composite FK | idx_ti_cm | Audit | Orchestrator | same org | `0193cm00-...-0001` |
| tool_invocations | tool_name | نام ابزار (`get_receivables`, `get_inventory_balance`, ...) | VARCHAR(60) | NO | NO | - | - | - | idx_ti_tool | Security | Orchestrator | allowlist | `get_receivables` |
| tool_invocations | authorized_membership_id | عضوی که ابزار با مجوز او اجرا شده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Security | AuthGuard | same org | `0193m000-...-0001` |
| tool_invocations | input_params_json | پارامترهای ارسال‌شده به ابزار | JSONB | NO | NO | - | `'{}'::jsonb` | - | - | Internal | Orchestrator | valid JSON | `{"overdue_days":30}` |
| tool_invocations | output_status | وضعیت پاسخ (`SUCCESS`, `DENIED`, `ERROR`) | VARCHAR(20) | NO | NO | - | - | IN('SUCCESS','DENIED','ERROR') | - | Security | Engine | enum | `SUCCESS` |
| tool_invocations | latency_ms | زمان اجرا به میلی‌ثانیه | INTEGER | YES | NO | - | NULL | >= 0 | - | Internal | System | >= 0 | `85` |
| tool_invocations | invoked_at | زمان فراخوانی | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Audit | System | UTC | `2026-11-13T12:10Z` |

### ۹۹. جدول `assistant_recommendations`
* **مسئولیت:** نگهداری پیشنهادهای پیش‌دستانه استخراج‌شده از داده‌های تأییدشده همراه با مکانیزم ضدتکرار (`fingerprint_hash` + `cooldown_until`). | **ارتباط:** متصل به `organization_memberships`, `service_definitions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Proactive Engine ایجاد و کاربر وضعیت را تغییر می‌دهد. | **چرخه عمر:** `ACTIVE -> DISMISSED | SNOOZED | ACTED_UPON`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** صرفاً از داده‌های `Posted` تولید می‌شود. | **ماژول:** `Proactive Intelligence`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| assistant_recommendations | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_rec_org | Internal | System | valid org | `0193a000-...-0001` |
| assistant_recommendations | id | شناسه پیشنهاد | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193rec0-...-0001` |
| assistant_recommendations | target_membership_id | کاربر مخاطب متناسب با نقش | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | idx_rec_mem | Internal | Engine | same org | `0193m000-...-0001` |
| assistant_recommendations | rule_code | کد قاعده تشخیص | VARCHAR(50) | NO | NO | - | - | - | - | Internal | Engine | uppercase | `PROACTIVE_AR_OVERDUE_30D` |
| assistant_recommendations | fingerprint_hash | هش ضدتکرار هشدار | CHAR(64) | NO | NO | - | - | UQ(organization_id,target_membership_id,fingerprint_hash) | UQ | System | Engine | 64 hex | `4a7d1ed4...` |
| assistant_recommendations | title_fa | عنوان پیشنهادی فارسی | VARCHAR(200) | NO | NO | - | - | - | - | Internal | Engine | non-empty | `۳ مشتری بیش از ۳۰ روز بدهی معوق دارند` |
| assistant_recommendations | suggested_service_id | خدمت ادامه پیشنهادی | UUID | YES | NO | service_definitions(id) | NULL | ON DELETE RESTRICT | - | Internal | Engine | valid service | `0193sd00-...-0003` |
| assistant_recommendations | status | وضعیت تعامل کاربر | VARCHAR(20) | NO | NO | - | `'ACTIVE'` | IN('ACTIVE','DISMISSED','SNOOZED','ACTED_UPON') | idx_rec_stat | Internal | User | enum | `ACTIVE` |
| assistant_recommendations | cooldown_until | تاریخ پایان سکوت هشدار | TIMESTAMPTZ | YES | NO | - | NULL | - | - | Internal | Engine | UTC | `2026-11-20T12:00Z` |

### ۱۰۰. جدول `user_feedback`
* **مسئولیت:** ثبت بازخورد کاربر روی کیفیت پاسخ دستیار یا پیشنهادها. | **ارتباط:** فرزند `conversation_messages`, `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** ندارد. | **ماژول:** `AI Assistant`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| user_feedback | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| user_feedback | id | شناسه بازخورد | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193uf00-...-0001` |
| user_feedback | conversation_message_id | پیام هدف | UUID | NO | NO | conversation_messages(organization_id,id) | - | Composite FK | - | Internal | User | same org | `0193cm00-...-0002` |
| user_feedback | membership_id | کاربر ثبت‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0001` |
| user_feedback | rating | امتیاز (`HELPFUL`, `INACCURATE`, `UNCLEAR`) | VARCHAR(20) | NO | NO | - | - | IN('HELPFUL','INACCURATE','UNCLEAR') | - | Quality | User | enum | `HELPFUL` |
| user_feedback | feedback_note | توضیح اختیاری | TEXT | YES | NO | - | NULL | - | - | Internal | User | - | `پاسخ دقیق و مستند بود` |

---

# بخش ۱۳: `Audit, Security, Notification & Subscription` (جداول ۱۰۱ تا ۱۰۹)

### ۱۰۱. جدول `audit_logs`
* **مسئولیت:** ثبت تغییرناپذیر تمام عملیات حساس مالی، امنیتی، تغییر دسترسی و تاییدها. | **ارتباط:** متصل به `organizations`, `organization_memberships`, `documents`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only (بدون مجوز UPDATE/DELETE). | **چرخه عمر:** دائمی (آماده Range Partitioning). | **حذف:** مطلقاً ممنوع. | **محدودیت مالی:** ثبت مقدار قبل و بعد (`before/after_state_json`) برای عملیات مالی الزامی است. | **ماژول:** `Audit`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| audit_logs | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_al_entity | Audit | System | valid org | `0193a000-...-0001` |
| audit_logs | id | شناسه لاگ ممیزی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Audit | System | UUID | `0193al00-...-0001` |
| audit_logs | actor_membership_id | عضو اجراکننده (NULL برای سیستم) | UUID | YES | NO | organization_memberships(organization_id,id) | NULL | Composite FK | idx_al_act | Audit | System | same org | `0193m000-...-0001` |
| audit_logs | action_code | کد رویداد (`INVOICE_POSTED`, `ROLE_CHANGED`, `PERIOD_CLOSED`) | VARCHAR(60) | NO | NO | - | - | - | idx_al_act | Audit | System | uppercase | `INVOICE_POSTED` |
| audit_logs | entity_type | نوع موجودیت هدف | VARCHAR(40) | NO | NO | - | - | - | idx_al_entity | Audit | System | uppercase | `INVOICE` |
| audit_logs | entity_id | شناسه رکورد هدف | UUID | NO | NO | - | - | - | idx_al_entity | Audit | System | valid UUID | `0193iv00-...-0001` |
| audit_logs | before_state_json | وضعیت فیلدهای کلیدی پیش از تغییر | JSONB | YES | NO | - | NULL | - | - | Audit | System | valid JSON | `{"status":"Verified"}` |
| audit_logs | after_state_json | وضعیت پس از تغییر | JSONB | YES | NO | - | NULL | - | - | Audit | System | valid JSON | `{"status":"Posted"}` |
| audit_logs | source_document_id | سند پشتیبان مرتبط | UUID | YES | NO | documents(organization_id,id) | NULL | Composite FK | - | Provenance | System | same org | `0193d000-...-0001` |
| audit_logs | occurred_at | زمان وقوع دقیق | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_al_entity | Audit | System | UTC | `2026-11-13T11:00Z` |

### ۱۰۲. جدول `security_events`
* **مسئولیت:** پایش تلاش‌های مشکوک (ورود ناموفق، تلاش دسترسی بین‌سازمانی، فایل مخرب). | **ارتباط:** اختیاری با `organizations`, `users`. | **مالکیت:** Hybrid (`organization_id NULL` در حملات پیش از انتخاب سازمان). | **ایجاد/اصلاح:** Append-only. | **چرخه عمر:** دائمی. | **حذف:** ممنوع. | **محدودیت مالی:** ندارد. | **ماژول:** `Security`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| security_events | id | شناسه رویداد امنیتی | UUID | NO | YES | - | gen_random_uuid() | - | PK | Security | System | UUID | `0193sev0-...-0001` |
| security_events | organization_id | سازمان هدف (در صورت مشخص بودن) | UUID | YES | NO | organizations(id) | NULL | - | idx_sev_org | Security | System | valid org/null | `0193a000-...-0001` |
| security_events | user_id | کاربر درگیر | UUID | YES | NO | users(id) | NULL | - | - | Security | System | valid user/null | `0193u000-...-0001` |
| security_events | event_type | نوع رویداد (`CROSS_TENANT_ATTEMPT`, `LOGIN_FAIL`, `PERMISSION_DENIED`, `SUSPICIOUS_FILE`) | VARCHAR(40) | NO | NO | - | - | - | idx_sev_type | Security | SecurityGuard | uppercase | `CROSS_TENANT_ATTEMPT` |
| security_events | severity | شدت (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) | VARCHAR(15) | NO | NO | - | - | IN('LOW','MEDIUM','HIGH','CRITICAL') | - | Security | System | enum | `HIGH` |
| security_events | ip_address | IP مبدأ | INET | YES | NO | - | NULL | - | - | Security | System | valid IP | `192.0.2.10` |
| security_events | detail_text | جزئیات فنی بدون افشای رمز | TEXT | NO | NO | - | - | - | - | Security | System | non-empty | `Blocked read attempt for Org-B invoice` |
| security_events | occurred_at | زمان رویداد | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_sev_org | Security | System | UTC | `2026-11-13T12:30Z` |

### ۱۰۳. جدول `notifications`
* **مسئولیت:** ارسال اعلان‌های درون‌برنامه‌ای/ایمیل/پیامک برای سررسید چک، اتمام OCR و درخواست تأیید. | **ارتباط:** متصل به `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Notification Engine. | **چرخه عمر:** `unread -> read`. | **حذف:** قابل پاک‌سازی پس از انقضا. | **محدودیت مالی:** ندارد. | **ماژول:** `Notifications`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| notifications | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| notifications | id | شناسه اعلان | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193nt00-...-0001` |
| notifications | recipient_membership_id | عضو گیرنده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | idx_nt_rec | Internal | System | same org | `0193m000-...-0001` |
| notifications | notification_type | دسته اعلان (`CHEQUE_DUE`, `OCR_READY`, `APPROVAL_NEEDED`) | VARCHAR(40) | NO | NO | - | - | - | - | Internal | Engine | uppercase | `APPROVAL_NEEDED` |
| notifications | title_fa | تیتر اعلان | VARCHAR(180) | NO | NO | - | - | - | - | Internal | Engine | non-empty | `درخواست تایید فاکتور شماره ۴۰۲۱` |
| notifications | read_at | زمان خوانده‌شدن (NULL = خوانده‌نشده) | TIMESTAMPTZ | YES | NO | - | NULL | - | idx_nt_rec | Internal | User | UTC | `NULL` |
| notifications | created_at | زمان ایجاد | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Internal | System | UTC | `2026-11-13T11:50Z` |

### ۱۰۴. جدول `notification_preferences`
* **مسئولیت:** تنظیمات ترجیحی هر کاربر برای دریافت اعلان در هر کانال. | **ارتباط:** فرزند `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** کاربر. | **چرخه عمر:** فعال. | **حذف:** `CASCADE` با حذف تنظیمات. | **محدودیت مالی:** ندارد. | **ماژول:** `Notifications`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| notification_preferences | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| notification_preferences | id | شناسه تنظیم | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193np00-...-0001` |
| notification_preferences | membership_id | عضو | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK, UQ(organization_id,membership_id,channel,event_category) | UQ | Internal | System | same org | `0193m000-...-0001` |
| notification_preferences | channel | کانال (`IN_APP`, `EMAIL`, `SMS`) | VARCHAR(20) | NO | NO | - | - | IN('IN_APP','EMAIL','SMS') | UQ | Internal | User | enum | `IN_APP` |
| notification_preferences | event_category | دسته رویداد | VARCHAR(40) | NO | NO | - | - | - | UQ | Internal | User | uppercase | `TREASURY_ALERTS` |
| notification_preferences | is_enabled | فعال یا غیرفعال | BOOLEAN | NO | NO | - | true | - | - | Internal | User | boolean | `true` |

### ۱۰۵. جدول `subscription_plans`
* **مسئولیت:** تعریف بسته‌های تجاری پلتفرم (`Personal`, `Starter Business`, `Pro Distribution`, `Enterprise`). | **ارتباط:** والد `subscriptions`. | **مالکیت:** سیستمی. | **ایجاد/اصلاح:** Product Admin/Seed. | **چرخه عمر:** `is_active`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** محدودیت‌ها غیرمنفی باشند. | **ماژول:** `Subscription`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| subscription_plans | id | شناسه پلن | UUID | NO | YES | - | gen_random_uuid() | - | PK | Public | System | UUID | `0193sp00-...-0003` |
| subscription_plans | plan_code | کد یکتا | VARCHAR(40) | NO | NO | - | - | UNIQUE | UQ | Public | System | uppercase | `PRO_DISTRIBUTION` |
| subscription_plans | name_fa | نام فارسی پلن | VARCHAR(100) | NO | NO | - | - | - | - | Public | System | non-empty | `حرفه‌ای شرکت‌های پخش` |
| subscription_plans | max_users | سقف کاربران مجاز | INTEGER | NO | NO | - | 1 | >= 1 | - | Commercial | System | >= 1 | `15` |
| subscription_plans | monthly_ocr_pages | سهمیه ماهانه صفحات OCR | INTEGER | NO | NO | - | 50 | >= 0 | - | Commercial | System | >= 0 | `2000` |
| subscription_plans | features_json | لیست پرچم‌های قابلیت پلن | JSONB | NO | NO | - | `'{}'::jsonb` | - | - | Commercial | System | valid JSON | `{"multi_warehouse":true}` |
| subscription_plans | is_active | عرضه برای خرید جدید | BOOLEAN | NO | NO | - | true | - | - | Public | System | boolean | `true` |

### ۱۰۶. جدول `subscriptions`
* **مسئولیت:** اتصال هر سازمان به پلن اشتراک فعال و دوره اعتبار آن. | **ارتباط:** متصل به `organizations`, `subscription_plans`؛ والد `usage_records`, `usage_limits`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** هنگام ساخت سازمان و تمدید/ارتقا. | **چرخه عمر:** `TRIAL -> ACTIVE -> PAST_DUE -> CANCELLED`. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `ends_at > starts_at`. | **ماژول:** `Subscription`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| subscriptions | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | UQ(organization_id,id) | idx_sub_org | Commercial | System | valid org | `0193a000-...-0001` |
| subscriptions | id | شناسه اشتراک | UUID | NO | YES | - | gen_random_uuid() | - | PK | Commercial | System | UUID | `0193sub0-...-0001` |
| subscriptions | plan_id | پلن انتخابی | UUID | NO | NO | subscription_plans(id) | - | ON DELETE RESTRICT | - | Commercial | System | valid plan | `0193sp00-...-0003` |
| subscriptions | status | وضعیت اشتراک | VARCHAR(20) | NO | NO | - | `'TRIAL'` | IN('TRIAL','ACTIVE','PAST_DUE','CANCELLED') | idx_sub_stat | Commercial | Billing | enum | `ACTIVE` |
| subscriptions | starts_at | شروع دوره | TIMESTAMPTZ | NO | NO | - | NOW() | - | - | Commercial | System | UTC | `2026-11-01T00:00Z` |
| subscriptions | ends_at | پایان دوره | TIMESTAMPTZ | NO | NO | - | - | CHECK(ends_at > starts_at) | - | Commercial | Billing | > starts_at | `2026-12-01T00:00Z` |

### ۱۰۷. جدول `usage_records`
* **مسئولیت:** ثبت مصرف واقعی سازمان در هر دوره (صفحات OCR، تعداد اسناد، اجراهای پردازش، توکن AI و فضا). | **ارتباط:** فرزند `subscriptions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** Append-only توسط مصرف‌کننده‌ها. | **چرخه عمر:** دوره‌ای. | **حذف:** ممنوع. | **محدودیت مالی:** `quantity_used >= 0`. | **ماژول:** `Metering`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| usage_records | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | idx_ur_org | Internal | System | valid org | `0193a000-...-0001` |
| usage_records | id | شناسه رکورد مصرف | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ur00-...-0001` |
| usage_records | subscription_id | اشتراک فعال | UUID | NO | NO | subscriptions(organization_id,id) | - | Composite FK | idx_ur_sub | Commercial | System | same org | `0193sub0-...-0001` |
| usage_records | metric_code | سنجه مصرف (`OCR_PAGES`, `DOCUMENTS`, `WORKFLOW_RUNS`, `AI_TOKENS`, `STORAGE_MB`) | VARCHAR(30) | NO | NO | - | - | enum | idx_ur_met | Commercial | System | enum | `OCR_PAGES` |
| usage_records | quantity_used | مقدار مصرف ثبت‌شده | NUMERIC(18,2) | NO | NO | - | - | >= 0 | - | Commercial | Meter | >= 0 | `3.00` |
| usage_records | recorded_at | زمان ثبت | TIMESTAMPTZ | NO | NO | - | NOW() | - | idx_ur_met | Audit | System | UTC | `2026-11-13T10:16Z` |

### ۱۰۸. جدول `usage_limits`
* **مسئولیت:** نگهداری سقف‌های هشدار و مسدودسازی (`Soft/Hard Limit`) متناسب با اشتراک هر سازمان. | **ارتباط:** فرزند `subscriptions`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** همگام با فعال‌سازی اشتراک یا افزونه. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** `hard_limit >= soft_limit`. | **ماژول:** `Metering`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| usage_limits | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Internal | System | valid org | `0193a000-...-0001` |
| usage_limits | id | شناسه سقف مصرف | UUID | NO | YES | - | gen_random_uuid() | - | PK | Internal | System | UUID | `0193ul00-...-0001` |
| usage_limits | subscription_id | اشتراک والد | UUID | NO | NO | subscriptions(organization_id,id) | - | Composite FK, UQ(organization_id,subscription_id,metric_code) | UQ | Commercial | System | same org | `0193sub0-...-0001` |
| usage_limits | metric_code | سنجه محدودیت | VARCHAR(30) | NO | NO | - | - | - | UQ | Commercial | System | enum | `OCR_PAGES` |
| usage_limits | soft_limit | آستانه ارسال هشدار (مثلاً ۸۵٪) | NUMERIC(18,2) | NO | NO | - | - | >= 0 | - | Commercial | Billing | >= 0 | `1700.00` |
| usage_limits | hard_limit | سقف توقف عملیات | NUMERIC(18,2) | NO | NO | - | - | CHECK(hard_limit >= soft_limit) | - | Commercial | Billing | >= soft | `2000.00` |
| usage_limits | enforcement_mode | رفتار هنگام رسیدن به سقف (`WARN`, `BLOCK`) | VARCHAR(15) | NO | NO | - | `'BLOCK'` | IN('WARN','BLOCK') | - | Commercial | Billing | enum | `BLOCK` |

### ۱۰۹. جدول `data_retention_policies`
* **مسئولیت:** تعیین سیاست نگهداری و حذف فایل‌ها بر اساس نوع سند و قفل قانونی (`Legal Hold`). | **ارتباط:** متصل به `organizations`, `organization_memberships`. | **مالکیت:** Tenant-owned. | **ایجاد/اصلاح:** مدیر سیستم/مالی. | **چرخه عمر:** فعال. | **حذف:** `RESTRICT`. | **محدودیت مالی:** اسناد متصل به فاکتورهای `Posted` تا پایان مدت قانونی نگهداری غیرقابل حذف‌اند. | **ماژول:** `Governance`.

| table_name | field_name | business_definition | data_type | nullable | primary_key | foreign_key | default_value | constraints | index | sensitivity | source | validation_rule | example |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| data_retention_policies | organization_id | شناسه سازمان | UUID | NO | NO | organizations(id) | - | - | - | Governance | System | valid org | `0193a000-...-0001` |
| data_retention_policies | id | شناسه سیاست نگهداری | UUID | NO | YES | - | gen_random_uuid() | - | PK | Governance | System | UUID | `0193drp0-...-0001` |
| data_retention_policies | document_category | دسته سند (`POSTED_FINANCIAL`, `REJECTED_RAW`, `TEMP_UPLOAD`) | VARCHAR(30) | NO | NO | - | - | UQ(organization_id,document_category) | UQ | Governance | Admin | enum | `POSTED_FINANCIAL` |
| data_retention_policies | retain_raw_days | حداقل روزهای نگهداری اجباری | INTEGER | NO | NO | - | 3650 | >= 30 | - | Governance | Admin | >= 30 | `3650` |
| data_retention_policies | legal_hold_enabled | قفل قانونی مانع از حذف خودکار | BOOLEAN | NO | NO | - | true | - | - | Security | CFO/Admin | boolean | `true` |
| data_retention_policies | updated_by_membership_id | عضو آخرین تنظیم‌کننده | UUID | NO | NO | organization_memberships(organization_id,id) | - | Composite FK | - | Audit | System | same org | `0193m000-...-0002` |
