# 11 — معماری صف‌ها، کارهای پس‌زمینه و رویدادها (`Background Jobs & Event-Driven Architecture`)

**نمودار مرجع:** [`diagrams/event-driven-architecture.mmd`](./diagrams/event-driven-architecture.mmd)

این سند پردازش‌های آسنکرون، تضمین عدم از دست رفتن رویدادهای مالی و ساختار **۱۳ صف `BullMQ`** و **۱۲ رویداد دامنه** را مشخص می‌کند.

---

## ۱. الگوی `Transactional Outbox` برای یکپارچگی دیتابیس و صف

**مسئله:** اگر بک‌اند فاکتور را در PostgreSQL `COMMIT` کند و سپس هنگام ارسال پیام به `Redis / BullMQ` سرور کرش کند، کارهای بعدی (مثلاً بروزرسانی Snapshot گزارش، اعلان، یا همگام‌سازی کش) گم می‌شوند.

**راه‌حل معماری (`PROPOSED_FOR_OWNER_APPROVAL`):**
1. افزودن جدول زیرساختی **`transactional_outbox`** (`id`, `organization_id`, `event_id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload_json`, `status`, `created_at`, `published_at`, `retry_count`).
2. هر عملیات تغییردهنده وضعیت در پایان تراکنش PostgreSQL (داخل `TenantTransactionRunner`)، رکورد رویداد را در **همان تراکنش ACID** در `transactional_outbox` درج می‌کند.
3. سرویس **`OutboxRelayWorker`** (با `SKIP LOCKED` یا `LISTEN/NOTIFY` پشتیبان) رویدادهای منتشرنشده را خوانده و با `jobId = event_id` (برای Idempotency در Redis) وارد `BullMQ` می‌کند.
4. تمام مصرف‌کنندگان صف (`Consumers`) موظف‌اند Idempotent باشند و پیش از اجرا وضعیت فعلی رکورد و کانتکست `SET LOCAL app.current_organization_id` را بازیابی کنند.

---

## ۲. کاتالوگ ۱۳ صف استاندارد `BullMQ`

| # | نام صف (`Queue Name`) | مصرف‌کننده | اولویت | Concurrency پیشنهادی | سیاست Retry & Backoff | Timeout | مقصد شکست نهایی |
| :-: | :--- | :--- | :---: | :---: | :--- | :---: | :--- |
| **1** | `q.ocr.preprocess` | Python FastAPI OCR | بالا | `4` / Pod | `3` بار (Exponential: 10s, 30s, 90s) | 60s | `q.dead-letter` |
| **2** | `q.ocr.extract` | Python FastAPI OCR | بالا | `2-4` / Pod | `3` بار (30s, 2m, 5m) | 180s | `q.dead-letter` |
| **3** | `q.ocr.postprocess` | NestJS Worker (`ocr-ingestion`) | بالا | `8` | `5` بار (5s, 15s, 45s) | 30s | `q.dead-letter` |
| **4** | `q.finance.posting` | NestJS Worker (`coordinators`) | بحرانی | `4` *(با Lock سازمان)* | `3` بار (فقط خطاهای موقت DB؛ خطای `422` Retry ندارد) | 30s | `q.dead-letter` + Alert |
| **5** | `q.inventory.costing` | NestJS Worker (`profitability`) | متوسط | `4` | `3` بار | 120s | `q.dead-letter` |
| **6** | `q.reconciliation.bank` | NestJS Worker (`reconciliation`) | متوسط | `4` | `3` بار | 120s | `q.dead-letter` |
| **7** | `q.reconciliation.inventory` | NestJS Worker (`reconciliation`) | متوسط | `2` | `3` بار | 120s | `q.dead-letter` |
| **8** | `q.integration.sync` | NestJS Worker (`integrations`) | متوسط | `4` | `4` بار (15s, 60s, 5m) | 180s | `q.dead-letter` + `sync_errors` |
| **9** | `q.reporting.generate` | NestJS Worker (`reporting`) | بالا | `6` | `3` بار | 90s | `q.dead-letter` |
| **10** | `q.export.render` | NestJS Export Worker (Playwright/ExcelJS) | متوسط | `2-3` / Pod *(حافظه‌بر)* | `3` بار (20s, 60s) | 120s | `q.dead-letter` |
| **11** | `q.notifications.dispatch` | NestJS Worker (`notifications`) | پایین/فوری | `10` | `5` بار (10s..10m) | 20s | `q.dead-letter` |
| **12** | `q.maintenance.snapshots` | NestJS Cron Worker | پایین | `1` / Org | `2` بار (اجرای شبانه `stock_snapshots` و Retention) | 300s | لاگ عملیاتی + Alert |
| **13** | `q.dead-letter` | Admin Ops / Alert Monitor | ممیزی | دستی / Auto-Inspect | نگهداری ۳۰ روز با ابزار Replay دستی توسط Ops | — | ثبت در `processing_errors` |

---

## ۳. کاتالوگ ۱۲ رویداد دامنه (`Domain Events`)

| # | نام رویداد (`event_type`) | ناشر (`Producer`) | مصرف‌کنندگان (`Subscribers`) | کاربرد کلیدی |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `DocumentUploaded` | `documents` | `ocr-ingestion`, `subscriptions` | شروع خط لوله OCR و ثبت مصرف صفحات در سهمیه |
| **2** | `OcrExtractionCompleted` | `ocr-ingestion` | `workflow`, `contacts`, `products`, `notifications` | اجرای `VR-MATH`، ساخت `entity_match_candidates` و اعلان آماده بررسی |
| **3** | `InvoiceVerified` | `invoices` | `workflow`, `notifications` | بررسی نیاز به `approval_requests` بالای سقف و ارسال به کارتابل تایید |
| **4** | `InvoicePosted` | `invoices` | `reporting`, `contacts`, `notifications`, `audit-security` | نامعتبرسازی وضعیت تازگی گزارش‌های قبلی (اعلام امکان ساخت نسخه `v2`) |
| **5** | `InvoiceReversed` | `invoices` | `reporting`, `reconciliation`, `notifications` | به‌روزرسانی وضعیت مانده و هشدار به گزارش‌های متکی به نسخه قبل |
| **6** | `PaymentPosted` | `payments` | `treasury`, `reconciliation`, `reporting` | علامت‌گذاری برای دور بعدی تطبیق خودکار بانکی و به‌روزرسانی مانده |
| **7** | `ChequeStatusChanged` | `treasury` | `notifications`, `reporting` | ارسال هشدار فوری در صورت `BOUNCED` به `CFO`, `OWNER`, `SALES_MANAGER` |
| **8** | `StockMoved` | `inventory` | `products`, `profitability`, `notifications` | بررسی رسیدن موجودی به زیر `reorder_point_base_qty` |
| **9** | `NegativeStockOccurred` | `inventory` | `audit-security`, `notifications`, `reporting` | ثبت هشدار بحرانی برای مدیر مالی هنگام خروج در حالت `allow_negative_stock=true` |
| **10** | `ReconciliationRunCompleted` | `reconciliation` | `notifications`, `workflow` | اعلان تعداد تطبیق‌های نیازمند تایید و مغایرت‌های باز |
| **11** | `ReportVersionGenerated` | `reporting` | `export`, `notifications` | آماده‌سازی خروجی در صورت درخواست Export خودکار یا پایان کار کاربر |
| **12** | `ImportBatchCompleted` | `integrations` | `workflow`, `contacts`, `products`, `notifications` | نمایش خلاصه رکوردهای واردشده، تکراری‌ها و ردیف‌های خطادار هلو/سپیدار |

---

## ۴. کنترل بار و همزمانی per-Tenant (`Fair-Use Queuing`)
برای آنکه آپلود ۵۰۰ فاکتور توسط یک سازمان بزرگ صف OCR سایر مشتریان را مسدود نکند:
- استفاده از سیاست **BullMQ Group / Tenant Rate Limiter** یا چرخش وزن‌دار (`Fair Scheduling`) به گونه‌ای که هر سازمان حداکثر سهم مشخصی از Workerهای همزمان (مثلاً حداکثر ۲ جاب OCR همزمان در پلن Starter) را اشغال کند.
- هر جاب در Payload خود فقط شناسه‌های سبک (`organization_id`, `document_id`, `correlation_id`) را نگه می‌دارد و **هرگز** محتوای فایل یا کل جدول را در Redis ذخیره نمی‌کند.
