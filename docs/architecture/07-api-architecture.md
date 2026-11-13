# 07 — معماری API و قراردادهای ارتباطی (`Backend API Architecture`)

این سند استانداردهای طراحی، امنیت، تراکنش، Idempotency و جداسازی ساختار پاسخ در APIهای پلتفرم Erpkian را مشخص می‌کند.

---

## ۱. استانداردهای عمومی REST API
- **پیشوند نسخه‌دار:** `/api/v1/...` (تغییرات ناسازگار در آینده فقط با `/api/v2/...`).
- **پروتکل و فرمت:** JSON با کدگذاری `UTF-8`، `Content-Type: application/json` (جز آپلود `multipart/form-data` و دانلود `application/pdf`, `xlsx`, `csv`).
- **هدرهای استاندارد درخواست:**
  - `Authorization: Bearer <access_token>` (یا `X-Agent-Device-Key` برای Windows Agent)
  - `X-Organization-Id: <uuid>` (تطبیق اجباری با سازمان مجاز داخل توکن JWT و عضویت فعال)
  - `Idempotency-Key: <uuid_v4_or_v7>` *(اجباری برای تمام عملیات `POST` / `PATCH` ایجادکننده سند، پرداخت، ثبت قطعی `Post`، ابطال، Import و اجرای گزارش)*
  - `X-Request-Id: <uuid>` *(تولید خودکار در Gateway در صورت نبود برای Traceability کامل)*
- **نمایش تاریخ و پول در JSON:**
  - تاریخ‌ها هم با استاندارد میلادی (`issue_date: "2026-11-15"`) و هم شمسی (`issue_jalali: "1405/08/24"`) برگردانده می‌شوند؛ زمان‌های سیستم `TIMESTAMPTZ` به صورت ISO-8601 UTC.
  - مبالغ پولی همیشه به صورت عدد صحیح/دقیق ریال (`*_irr: 12500000`) ارسال می‌شوند؛ در صورت نمایش تومانی، فیلد کمکی `*_display` در کنار `display_currency: "IRT"` قرار می‌گیرد (برای جلوگیری از سرریز `Number.MAX_SAFE_INTEGER` در مقادیر تریلیون ریالی، مبالغ بالای آستانه می‌توانند به صورت رشته دقیق نیز serialize شوند — `PROPOSED_FOR_OWNER_APPROVAL`).

---

## ۲. تفکیک اکید Envelope عمومی REST از `ErpkianReportEnvelope v1` (اصلاح ممیزی بخش ۲۲)

> **تثبیت اصلاحیه ممیزی مرحله چهارم:** پاسخ عمومی تمام Endpointهای REST از قرارداد **`ApiResponseEnvelope<T>`** پیروی می‌کند و هرگز با قرارداد گزارش تحلیلی **`ErpkianReportEnvelope v1`** (`docs/processing/09-output-contracts.md`) ادغام یا جایگزین نمی‌شود.

### الف) قرارداد عمومی API (`ApiResponseEnvelope<T>`)
```json
{
  "success": true,
  "data": { "...": "Payload اختصاصی منبع یا در گزارش‌ها برابر با ErpkianReportEnvelope v1" },
  "meta": {
    "request_id": "0193req0-0000-7000-8000-000000000001",
    "timestamp_utc": "2026-11-15T10:30:00Z",
    "timestamp_jalali": "1405/08/24 14:00",
    "organization_id": "0193org0-0000-7000-8000-000000000001",
    "branch_scope_id": null,
    "pagination": {
      "cursor": "eyJpZCI6IjAxOTMuLi4ifQ==",
      "limit": 50,
      "has_more": true
    }
  },
  "error": null
}
```
در خطاها: `success: false`، `data: null` و شیء `error` شامل `{ "code": "FISCAL_PERIOD_CLOSED", "message_fa": "...", "details": {...} }`.

### ب) قرارداد تخصصی خروجی پردازش و گزارش (`ErpkianReportEnvelope v1`)
- این ساختار دقیقاً مطابق `docs/processing/09-output-contracts.md` است و در دو حالت استفاده می‌شود:
  1. به عنوان محتوای فیلد `data` در Endpointهای گزارش و پردازش تحلیلی (مثل `GET /api/v1/reports/executions/:id` یا `POST /api/v1/reports/ar-aging`)؛
  2. به عنوان فایل مستقل `.json` در خروجی `RPT-EXPORT-001` (`report_outputs`).
- بدین ترتیب ساختار `meta` در REST از `execution_meta / data_snapshot / summary_metrics / evidences` در دامنه گزارش کاملاً تفکیک می‌ماند.

---

## ۳. چرخه اجرای یک درخواست در NestJS Pipeline

```text
HTTP Request
  -> [1] CorrelationId & RequestLogger Middleware (بدون لاگ PII یا بدنه فاکتور)
  -> [2] RateLimitGuard (Redis Token Bucket بر اساس IP / Org / Agent)
  -> [3] AuthGuard (بررسی JWT و عدم Revoke شدن نشست)
  -> [4] TenantMembershipGuard (چک X-Organization-Id در organization_memberships)
  -> [5] RbacGuard (بررسی permission_code اتمیک و استخراج branch_scope_id)
  -> [6] ZodValidationPipe (تبدیل ارقام فارسی، ولیدیشن کبیسه شمسی، رد کردن فیلد ناشناخته)
  -> [7] IdempotencyInterceptor (چک قفل Idempotency در Redis + DB برای POST/PATCH حساس)
  -> [8] Controller -> Application Handler -> TenantTransactionRunner (BEGIN + SET LOCAL)
  -> [9] ResponseSerializer -> ApiResponseEnvelope<T>
```

---

## ۴. سیاست Idempotency و همزمانی (`Concurrency Control`)
1. **کلید یکتایی در عملیات نوشتاری:** برای `POST /invoices`, `POST /invoices/:id/post`, `POST /payments`, `POST /documents/upload`, `POST /integrations/imports`:
   - کلید `(organization_id, endpoint_scope, idempotency_key)` هم در جدول دامنه (`UNIQUE INDEX`) و هم در کش ۲۴ ساعته قفل درخواست بررسی می‌شود.
   - اگر درخواست دوم همزمان در حال اجرا باشد: پاسخ `409 IDEMPOTENCY_IN_PROGRESS` برمی‌گردد.
   - اگر درخواست اول تکمیل شده باشد: عیناً پاسخ ذخیره شده (`200/201`) بدون اجرای مجدد تراکنش برگردانده می‌شود.
   - اگر همان `idempotency_key` با Payload متفاوت ارسال شود: `422 IDEMPOTENCY_PAYLOAD_MISMATCH`.
2. **کنترل همزمانی خوش‌بینانه (`Optimistic Locking`) و بدبینانه:**
   - پیش از `Post` کردن فاکتور یا تخصیص پرداخت، تراکنش با `SELECT ... FOR UPDATE` روی رکورد مادر قفل صف می‌گیرد تا از تخصیص همزمان دو پرداخت به مانده یک فاکتور (`Over-Allocation`) جلوگیری شود.
3. **صفحه‌بندی (`Pagination`):** استفاده از **Cursor-Based Pagination** (بر پایه `UUIDv7` یا `(issue_date, id)`) برای جداول بزرگ مالی و کاردکس جهت جلوگیری از کندی `OFFSET`.

---

## ۵. کدهای استاندارد خطا (`Error Taxonomy`)

| دسته خطا | HTTP Status | کد نمونه (`error.code`) | شرح رفتار |
| :--- | :---: | :--- | :--- |
| احراز هویت | `401` | `AUTH_TOKEN_EXPIRED`, `AGENT_DEVICE_REVOKED` | قطع فوری نشست یا دستگاه |
| دسترسی و شعبه | `403` | `RBAC_PERMISSION_DENIED`, `BRANCH_SCOPE_VIOLATION`, `FEATURE_LOCKED_IN_V1` | ثبت در `security_events` (از جمله برای `TAX-SUB-*`) |
| یافت‌نشدن / RLS | `404` | `RESOURCE_NOT_FOUND` | هم برای نبود واقعی و هم برای Cross-Tenant (عدم افشای وجود UUID در سازمان دیگر) |
| تعارض وضعیت / تکراری | `409` | `INVALID_LIFECYCLE_STATE`, `DUPLICATE_DOCUMENT_SHA256`, `DUPLICATE_EXTERNAL_ID` | هدایت به جریان بررسی یا بازگشت رکورد موجود |
| قواعد قطعی مالی | `422` | `FISCAL_PERIOD_CLOSED`, `INSUFFICIENT_STOCK`, `VR_MATH_MISMATCH`, `VALUATION_POLICY_UNSET`, `ALLOCATION_EXCEEDS_OPEN_BALANCE` | توقف تراکنش بدون هیچ تغییر جزئی |
| دروازه تایید دوامضایی | `202` | `APPROVAL_REQUIRED_ABOVE_THRESHOLD` | انتقال سند به `Awaiting Approval` و ایجاد `approval_requests` |
| محدودیت نرخ و سرویس | `429` / `503` | `RATE_LIMIT_EXCEEDED`, `OCR_QUEUE_BACKPRESSURE` | بازگشت هدر `Retry-After` |
