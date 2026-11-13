# 18 — معماری کارایی و مقیاس‌پذیری (`Performance & Scalability Architecture`)

این سند اهداف کارایی پیشنهادی (`PROPOSED TARGET`) برای **۸ عملیات کلیدی سیستم**، استراتژی کش‌گذاری، Connection Pooling و برنامه مقیاس‌پذیری از MVP تا میلیون‌ها ردیف را تدوین می‌کند.

> **تذکر صریح شفافیت مهندسی:** در مخزن فعلی هیچ کد اجرایی یا تست بار انجام نشده است؛ بنابراین تمام اعداد جدول زیر **`PROPOSED TARGET` (هدف معماری برای طراحی و تست بار آتی)** هستند و به عنوان نتیجه اندازه‌گیری‌شده ادعا نمی‌شوند.

---

## ۱. اهداف کارایی ۸ عملیات کلیدی (`PROPOSED TARGET`)

| # | عملیات کلیدی | متریک هدف (`Latency / Throughput`) | وضعیت برچسب | اهرم‌های کلیدی دستیابی در معماری |
| :-: | :--- | :--- | :---: | :--- |
| **1** | **احراز هویت و بارگذاری کانتکست سازمان** | `p95 <= 120 ms` | `PROPOSED TARGET` | کش کوتاه‌عمر مجوزهای `membership_roles` در Redis (با Invalidating آنی هنگام تغییر نقش) |
| **2** | **جستجوی فازی طرف‌حساب/کالا (`pg_trgm`)** | `p95 <= 180 ms` (در ۱۰۰ هزار ردیف/سازمان) | `PROPOSED TARGET` | ایندکس `GIN (normalized_name gin_trgm_ops)` + پیشوند `organization_id` + Cursor Pagination |
| **3** | **ثبت قطعی فاکتور (`DOC-POST-008`)** | `p95 <= 350 ms` (تا ۵۰ ردیف در فاکتور) | `PROPOSED TARGET` | تک‌تراکنش بهینه PostgreSQL با قفل ردیف محدود، Batch Insert حرکات انبار و Outbox |
| **4** | **بارگذاری سند و کنترل تکراری (`DOC-INGEST-001`)** | `p95 <= 500 ms` (برای فایل ۵MB تا بازگشت `202`) | `PROPOSED TARGET` | Streaming Hash (SHA-256) + نوشتن مستقیم در MinIO + ارجاع کار OCR به BullMQ |
| **5** | **خط لوله کامل OCR یک صفحه فاکتور** | `p95 <= 6 s` (CPU) / `<= 2.5 s` (GPU) | `PROPOSED TARGET` | FastAPI ایزوله + PaddleOCR بومی با مدل‌های Pre-loaded در RAM |
| **6** | **تولید گزارش سنی مطالبات (`FIN-AR-AGING-001`)** | `p95 <= 1.2 s` (تا ۱۰۰ هزار فاکتور در سازمان) | `PROPOSED TARGET` | Partial Index روی `Posted SALE` + اجرای خواندن سنگین روی Read Replica + Snapshot Hash |
| **7** | **محاسبه سودآوری و موجودی (`PRF-COGS-001` / `INV-BAL-001`)** | `p95 <= 1.5 s` (با لنگر `stock_snapshots`) | `PROPOSED TARGET` | محاسبه تفاضلی فقط از آخرین `stock_snapshots` ماهانه تاییدشده به جای اسکن از روز اول |
| **8** | **پاسخ گفتگوی دستیار هوشمند (End-to-End)** | `TTFT <= 1.5 s`, کل پاسخ و ویجت `<= 4.5 s` | `PROPOSED TARGET` | اجرای ابزار قطعی زیر ۱ ثانیه + استریم SSE + مدل سبک برای Intent Router |

---

## ۲. استراتژی کش‌گذاری امن چندسازمانی (`Multi-Tenant Caching Policy`)

1. **قاعده نام‌گذاری اجباری کلید Redis:** تمام کلیدهای سازمانی باید با `erp:v1:org:{organization_id}:...` شروع شوند؛ استفاده از کلید بدون `orgId` برای داده‌های سازمانی ممنوع است.
2. **چه چیزهایی کش می‌شوند (با TTL کوتاه و Invalidation رویدادمحور)؟**
   - `organization_settings` و `accounting_policies` (`TTL = 5m`, پاکسازی در `SettingsUpdated` / `ValuationPolicySet`)
   - نقشه `permissions` یک `membership_id` (`TTL = 2m`, پاکسازی در `MembershipRoleChanged`)
   - کاتالوگ عمومی `business_types`, `currencies`, `service_definitions` (`TTL = 1h`)
3. **چه چیزهایی هرگز در کش ساده قرار نمی‌گیرند؟**
   - مانده باز فاکتورها، موجودی قابل فروش هنگام `Post`، وضعیت دوره مالی بسته (`fiscal_periods`) و نتیجه تایید دوامضایی — این موارد **همیشه به صورت تراکنشی از PostgreSQL** خوانده می‌شوند تا هیچ‌گاه داده کهنه باعث فروش بیش از موجودی یا ثبت در دوره بسته نشود.

---

## ۳. نقشه مقیاس‌پذیری داده (`Database Scaling Strategy`)
- **مرحله ۱ (۰ تا ۱۰M ردیف کل):** تک‌نود PostgreSQL 16 + `PgBouncer` (`Transaction Pooling`, `max_client_conn = 500`, `default_pool_size = 40`).
- **مرحله ۲ (۱۰M تا ۵۰M ردیف):** افزودن `Read Replica` و هدایت گزارش‌های سنگین (`reporting`, `profitability`) به Replica (با حفظ همان `SET LOCAL` و `FORCE RLS` در تراکنش Read-Only!).
- **مرحله ۳ (`> 50M` ردیف):** فعال‌سازی `Range Partitioning` فصلی/سالانه روی `audit_logs`, `inventory_movements` و `usage_records` بر پایه `occurred_at`, به همراه `stock_snapshots` ماهانه خودکار توسط صف `q.maintenance.snapshots`.
