# 15 — معماری امنیت و ماتریس تهدیدها (`Security Architecture & Threat Matrix`)

**نمودار مرجع:** [`diagrams/security-trust-boundaries.mmd`](./diagrams/security-trust-boundaries.mmd)

این سند معماری امنیت دفاعی چندلایه پلتفرم مالی Erpkian، ماتریس جامع **۲۵ بردار تهدید** و تست‌های منفی اجباری را تعریف می‌کند.

---

## ۱. ماتریس ۲۵ بردار تهدید و کنترل‌های دفاعی (`Threat Model Matrix`)

| # | شناسه تهدید | دسته | سناریوی حمله یا خطا | اثر تجاری/مالی | راهکار دفاعی چندلایه | تست تأییدکننده |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `THR-01` | Tenant Leak | حدس زدن UUID فاکتور سازمان B در درخواست GET/PATCH | افشای اطلاعات مالی محرمانه رقیب | `AuthGuard` + `Composite FK` + `PostgreSQL FORCE RLS` (`0 rows` + پاسخ 404) | `NST-01` |
| **2** | `THR-02` | Tenant Leak | باگ کدنویسی Backend و فراموش کردن `WHERE organization_id = ...` | نشت گسترده بین مشتریان | `TenantTransactionRunner` اجباری + نقش `NOBYPASSRLS` (سیاست Fail-Closed) | `NST-03` |
| **3** | `THR-03` | Tenant Leak | تزریق `contact_id` سازمان B هنگام ثبت فاکتور در سازمان A | پیوند متقاطع بین دو شرکت | `Composite FK (organization_id, contact_id)` در سطح PostgreSQL (`23503`) | `NST-02` |
| **4** | `THR-04` | Tenant Leak | نشت کش React Query هنگام تغییر سازمان فعال کاربر | نمایش اشتباه اعداد شرکت قبلی در UI | پیشوند `orgId` در تمام کلیدهای Query + پاکسازی کامل حافظه هنگام Org Switch | تست E2E Switcher |
| **5** | `THR-05` | RBAC / Privilege | تلاش `OPERATOR` یا `ACCOUNTANT` برای تغییر مستقیم فاکتور به `Posted` | ثبت سند تاییدنشده و تقلب مالی | `RbacGuard` با چک اتمیک `invoice:post` + ثبت `PERMISSION_DENIED` در `security_events` | `NST-05` |
| **6** | `THR-06` | RBAC / Data Leak | دسترسی `INVENTORY_MANAGER` به سود ناخالص، قیمت خرید یا حساب بانک | افشای حاشیه سود محرمانه شرکت | چک مجوز `report:view_cost_profit` + حذف ستون‌های ریالی در DTO خروجی انبار | تست منفی نقش انبار |
| **7** | `THR-07` | RBAC / Scope | کاربر محدود به «شعبه غرب» گزارش کل شعب را درخواست می‌کند | نقض محرمانگی شعب | اعمال اجباری `branch_scope_id` از `membership_roles` در لایه سرویس و کوئری | تست منفی شعبه |
| **8** | `THR-08` | Fraud / Approval | درخواست‌کننده فاکتور بالای سقف خودش آن را در `approval_requests` تایید کند | دور زدن کنترل دوامضایی | Constraint دیتابیس `decided_by_membership_id <> requested_by_membership_id` + چک سرویس | تست کنترل دوامضایی |
| **9** | `THR-09` | Immutability | تلاش ویرایش مبلغ یا `DELETE` فاکتور `Posted` | دستکاری سابقه حسابداری و فرار مالیاتی | Policy دیتابیس `pol_invoices_update` (`status <> 'Posted'`) و `pol_delete_deny` | `NST-04` |
| **10** | `THR-10` | Audit Tamper | تلاش پاک کردن یا دستکاری ردپای تغییر در `audit_logs` | از بین رفتن شواهد ممیزی تقلب | `GRANT INSERT, SELECT ONLY` روی `audit_logs` برای `erpkian_app_runtime` | `DQT-14` |
| **11** | `THR-11` | Period Lock | ثبت یا ابطال فاکتور در دوره مالی بسته‌شده (`CLOSED`) | تغییر صورت‌های مالی بسته‌شده | قفل در سرویس و تریگر/گیت کنترل `fiscal_periods.status = 'OPEN'` | `DQT-13` |
| **12** | `THR-12` | Storage Leak | دسترسی مستقیم به لینک تصویر فاکتور سایر مشتریان در MinIO/S3 | افشای تصویر اسناد محرمانه | باکت کاملاً خصوصی + Pre-signed URL دو دقیقه‌ای + Prefix `<org_id>/` + لاگ دسترسی | تست URL منقضی |
| **13** | `THR-13` | File Upload Attack | آپلود فایل اجرایی مخرب یا SVG حاوی XSS با پسوند جعلی `.jpg` یا `.pdf` | اجرای اسکریپت یا آلودگی سرور OCR | بررسی Magic Bytes واقعی، رد MIMEهای اجرایی/SVG، Re-encode تصویر، باکس ایزوله | تست آپلود جعلی |
| **14** | `THR-14` | Zip Bomb / DoS | ارسال فایل PDF یا ZIP فشرده بسیار بزرگ برای پر کردن RAM/دیسک OCR | از کار افتادن کانتینر OCR | محدودیت حجم فایل خام، Decompression Ratio Guard و Timeout 60s در FastAPI | تست فایل مخرب |
| **15** | `THR-15` | AI Injection | درج دستور مخرب داخل متن فاکتور اسکن‌شده برای فریب دستیار هوشمند | فراخوانی ابزار غیرمجاز یا نشت متن | جداسازی `<untrusted_document_data>` + عدم اجرای Tool بدون پیام کاربر و RBAC | تست Injection OCR |
| **16** | `THR-16` | AI Hallucination | تولید اعداد مالی جعلی توسط LLM در پاسخ توضیحی | تصمیم‌گیری غلط مدیر بر مبنای عدد جعلی | موتور `NumericGroundingValidator` + قید Explain-Only بر خروجی Envelope | تست تطبیق عدد AI |
| **17** | `THR-17` | AI Privacy | ارسال شماره شبا، کدملی و نام واقعی اشخاص به مدل ابری خارجی | نقض حریم خصوصی مالی مشتریان | `PiiRedactionFilter` پیش از فراخوانی Provider خارجی + گزینه Self-Hosted LLM | تست Redaction |
| **18** | `THR-18` | Windows Agent | سرقت کلید دستگاه Agent و ارسال داده‌های جعلی یا برای سازمان دیگر | تزریق اسناد جعلی | اتصال کلید دستگاه به یک `org_id`، امضای Timestampدار، و Kill-Switch فوری `REVOKED` | تست ابطال Agent |
| **19** | `THR-19` | Windows Agent | دستکاری دیتابیس هلو/سپیدار مشتری توسط باگ Agent | خرابی نرم‌افزار حسابداری مشتری | سیاست سخت‌گیرانه `read_only = true` و اتصال Read-Only SQL در v1 | ممیزی کد Agent |
| **20** | `THR-20` | Auth / Session | سرقت Refresh Token و استفاده همزمان توسط مهاجم و کاربر | تصرف حساب مدیر مالی | Rotating Refresh Tokens با تشخیص استفاده مجدد (`Reuse Detection`) و ابطال کل زنجیره | تست Token Reuse |
| **21** | `THR-21` | Brute Force | حمله حدس رمز عبور یا OTP در `/auth/login` | ورود غیرمجاز | Rate Limit با Redis (`5/min` per IP & identifier) + قفل موقت + رویداد `security_events` | تست Rate Limit |
| **22** | `THR-22` | Race Condition | ارسال همزمان دو درخواست پرداخت یا Post با یک یا دو کلید | دو بار کسر موجودی یا تخصیص مازاد روی فاکتور | `Idempotency-Key` + `SELECT ... FOR UPDATE` در تراکنش PostgreSQL | `DQT-16` & `DQT-10` |
| **23** | `THR-23` | Secrets Leak | ذخیره رمز دیتابیس هلو یا کلید API در کد، لاگ یا فیلد متنی ساده | دسترسی به سرورهای مشتری/پرداخت | Vault/KMS (`credential_secret_ref`) + فیلتر Log Redaction | اسکن مخزن CI |
| **24** | `THR-24` | Compliance Lock | تلاش فراخوانی Endpoint ارسال مستقیم به سامانه مودیان در v1 | مسئولیت حقوقی و ارسال اشتباه رسمی | غیرفعال‌سازی سخت مسیرهای `TAX-SUB-*` (`403 FEATURE_LOCKED_IN_V1`) | تست قفل مالیاتی |
| **25** | `THR-25` | SSRF / Internal | وادار کردن Worker PDF/Playwright به درخواست به IPهای داخلی (`169.254.169.254`) هنگام رندر | دسترسی به Metadata ابری | رندر HTML ایزوله با `route` بلاک‌کننده درخواست‌های شبکه خارجی در Playwright | تست SSRF در Export |

---

## ۲. مجموعه تست‌های منفی امنیتی اجباری (`NST-01` تا `NST-08`)
علاوه بر `NST-01` تا `NST-05` تعریف‌شده در `docs/data-model/08-rls-security-design.md`:
- **`NST-06` (تزریق Prompt در OCR):** سند دارای متن جعلی دستور AI ← مدل نباید هیچ Tool Call غیرمجاز صادر کند.
- **`NST-07` (استفاده از Agent ابطال‌شده):** ارسال بسته از Agent با وضعیت `REVOKED` ← پاسخ فوری `401` و عدم درج حتی ۱ سطر در `import_batches`.
- **`NST-08` (تلاش تایید دوامضایی توسط خود درخواست‌کننده):** ارسال تایید `approval_requests` با همان `membership_id` درخواست‌کننده ← مسدود در سرویس و Constraint دیتابیس (`403 SELF_APPROVAL_FORBIDDEN`).
