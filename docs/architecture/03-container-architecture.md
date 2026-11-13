# 03 — معماری کانتینرها (`Container Architecture — C4 Level 2`)

**نمودار مرجع:** [`diagrams/container-architecture.mmd`](./diagrams/container-architecture.mmd)

این سند کانتینرهای اجرایی (`Runtime Containers`) پلتفرم Erpkian، مسئولیت هر کانتینر، پروتکل ارتباطی، مدل مقیاس‌پذیری و رفتار در زمان خطا را تعریف می‌کند.

---

## ۱. جدول جامع کانتینرهای معماری

| شناسه | نام کانتینر | فناوری | مسئولیت دقیق | پروتکل ارتباطی | وضعیت (`Stateless/Stateful`) | واحد مقیاس‌پذیری |
| :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| **C-01** | **Edge Reverse Proxy / WAF** | Nginx یا Traefik | خاتمه TLS 1.3، محافظت WAF، Rate Limiting، هدایت `/api/*` به Backend و بقیه به Next.js، محدودیت سایز آپلود | HTTPS (443) -> HTTP داخلی | Stateless | Horizontal / Edge Pair |
| **C-02** | **Web Frontend** | Next.js (App Router + TS) | رندر صفحات RTL، Workspace مکالمه‌ای، نمایش اسناد و ویجت‌های اعلامی؛ بدون منطق مالی و بدون کلید محرمانه | HTTP (`3000`) / REST & SSE با C-03 | Stateless | Replica Pods (`CPU/Req`) |
| **C-03** | **Backend Core API (Modular Monolith)** | NestJS + TS + Drizzle | Auth/RBAC، Validation، موتور محاسبات قطعی، Workflow، AI Orchestration، نوشتن Outbox و Endpointهای Agent | REST JSON (`/api/v1/*`) + SSE | Stateless | Replica Pods (`CPU/Req`) |
| **C-04** | **Background Job Worker** | NestJS Worker (`BullMQ`) | Relay جدول Outbox، تولید گزارش‌های سنگین، رندر PDF/Excel، مغایرت‌گیری دسته‌ای، پردازش Sync ERP و اعلان‌ها | Redis RESP + PostgreSQL | Stateless | Worker Pool بر اساس عمق صف |
| **C-05** | **OCR & Document Intelligence Service** | Python 3.12 + FastAPI | پیش‌پردازش تصویر، تبدیل چندصفحه به PDF، سنجش وضوح، OCR فارسی، استخراج جدول/BBox، طبقه‌بندی اولیه سند | BullMQ (Redis) + Internal HTTP (`HMAC/mTLS`) + S3 | Stateless *(مدل‌ها در Volume/Image)* | Worker Pods (`CPU/GPU`) |
| **C-06** | **Connection Pooler** | PgBouncer (`Transaction Mode`) | مدیریت کانکشن‌های PostgreSQL برای ده‌ها Worker و Pod بدون اتلاف حافظه؛ سازگار با `SET LOCAL` | PostgreSQL Wire Protocol (`6432`) | Stateless | Per-DB Node |
| **C-07** | **Primary Relational DB** | PostgreSQL 16+ (`pg_trgm`) | ذخیره ۱۰۹ جدول دامنه و Outbox، اجرای `FORCE RLS`، تراکنش‌های ACID، `Composite FKs` و Read Replica در فاز رشد | PostgreSQL Wire (`5432`) | **Stateful** | Vertical + Read Replica + WAL |
| **C-08** | **Queue & Cache Store** | Redis 7+ (AOF + Sentinel در HA) | صف‌های `BullMQ`، قفل توزیع‌شده، Cache غیرحساس (Catalogs/Permissions) و Rate Limit Counters | RESP3 (`6379`) | **Stateful** | Primary + Replica / Sentinel |
| **C-09** | **Object Storage** | MinIO / S3-Compatible | نگهداری تغییرناپذیر فایل اصلی اسناد (`v1`)، صفحات بهبودیافته، و خروجی‌های تولیدی PDF/Excel/CSV | S3 HTTPS API (`9000`) | **Stateful** | Distributed Erasure Coding |
| **C-10** | **Windows Local Agent** | .NET 8 Windows Service | استخراج امن و خواندنی (`Read-Only`) از هلو/سپیدار/پوشه منتخب روی سیستم مشتری و ارسال به C-03 | Outbound HTTPS (TLS 1.3) | Stateful *(Cursor محلی + Device Key)* | Per-Customer Machine |

---

## ۲. قواعد ارتباطی بین کانتینرها (`Inter-Container Communication Rules`)

1. **منع دسترسی مستقیم Frontend یا Python OCR به PostgreSQL مالی:**
   - کانتینر `C-02 (Next.js)` و `C-05 (FastAPI OCR)` **هرگز** اتصال مستقیم به دیتابیس `PostgreSQL` ندارند. تنها `C-03 (NestJS API)` و `C-04 (NestJS Worker)` تحت نقش `erpkian_app_runtime` و از مسیر `TenantTransactionRunner` مجاز به اجرای کوئری روی دیتابیس هستند.
2. **انتقال فایل بزرگ بدون عبور از بدنه RAM سرور API (در مقیاس رشد) یا کنترل Streaming:**
   - آپلود فایل از مرورگر یا به صورت Multipart Streaming با محاسبه برخط SHA-256 به `C-03` و درج مستقیم به `C-09 (MinIO/S3)` انجام می‌شود، یا برای فایل‌های حجیم (`ZIP/PDF` بزرگ) از طریق `Upload Ticket + Pre-signed PUT` و تایید نهایی Hash انجام می‌گیرد.
3. **ارتباط امن `NestJS <-> Python OCR`:**
   - ارسال کار از طریق صف Redis (`q.ocr.preprocess` و `q.ocr.extract`) یا Internal Call دارای امضای `HMAC-SHA256` و `internal_service_token` انجام می‌شود. کانتینر OCR هیچ‌گاه در اینترنت عمومی (`Public Internet`) اکسپوز نمی‌شود.

---

## ۳. الگوی شکست ایمن و تاب‌آوری (`Failure Isolation Matrix`)

| سناریوی خطا | اثر بر سایر کانتینرها | رفتار جبرانی معماری |
| :--- | :--- | :--- |
| **خرابی موقت `C-05 (Python OCR)`** | ثبت دستی فاکتور، گزارش‌ها، خزانه و مشاهده اسناد کاملاً فعال می‌مانند | آپلود سند ذخیره می‌شود (`Uploaded`)، کار در صف `BullMQ` منتظر می‌ماند و پس از بازگشت کانتینر با Backoff پردازش می‌شود. |
| **اختلال سرویس بیرونی `LLM Provider`** | تمام ۱۰ گردشکار اصلی، ۶۲ محاسبه قطعی و داشبوردهای عددی بدون توقف کار می‌کنند | AI Gateway به Provider پشتیبان سوئیچ می‌کند؛ اگر تمام مدل‌ها قطع شوند، UI حالت **Structured Deterministic Mode** (نمایش مستقیم جداول، فرم‌ها و گزارش‌ها) را بدون خطای مالی ارائه می‌دهد. |
| **از دست رفتن اتصال `C-10 (Windows Agent)`** | پلتفرم ابری بدون مشکل کار می‌کند | Agent با `Local Checkpoint Cursor` و `Exponential Backoff` در ویندوز صف محلی را حفظ کرده و پس از اتصال مجدد بدون تکرار (`row_hash / external_id`) همگام‌سازی را ادامه می‌دهد. |
| **ریستارت `C-08 (Redis)` با فعال‌سازی AOF** | درخواست‌های خواندنی و ثبت‌های فوری دیتابیس ادامه می‌یابند | `Outbox Relay Worker` رویدادهای منتشرنشده در `transactional_outbox` را مجدداً به BullMQ تزریق می‌کند تا هیچ کار مالی گم نشود. |
