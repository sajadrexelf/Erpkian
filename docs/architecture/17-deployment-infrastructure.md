# 17 — معماری استقرار، زیرساخت و ملاحظات بومی ایران (`Deployment & Infrastructure Architecture`)

**نمودار مرجع:** [`diagrams/deployment-architecture.mmd`](./diagrams/deployment-architecture.mmd)

این سند سه سناریوی استقرار (از راه‌اندازی اولیه MVP تا دسترس‌پذیری بالا)، استراتژی CI/CD و الزامات زیرساختی ویژه بازار ایران (شبکه، تحریم، ابر بومی، پیامک و پرداخت) را تدوین می‌کند.

---

## ۱. سه سناریوی استقرار زیرساخت (`3 Deployment Topologies`)

| ویژگی | سناریو ۱: **MVP / Lean Launch** | سناریو ۲: **Growth / Mid-Scale** | سناریو ۳: **Enterprise / High Availability (HA)** |
| :--- | :--- | :--- | :--- |
| **مقیاس مناسب** | ۱۰ تا ۱۰۰ سازمان (فاز پایلوت و عرضه اولیه) | ۱۰۰ تا ۱,۵۰۰ سازمان (رشد فعال پخش) | ۱,۵۰۰+ سازمان یا مشتریان سازمانی حساس |
| **ارکستراسیون** | Docker Compose / تک‌نود + سرور مجزای دیتابیس | Kubernetes (K3s/RKE2) یا Docker Swarm روی ۳+ نود | Kubernetes Multi-AZ Cluster |
| **Frontend & API** | ۱ کانتینر `Next.js` + ۱-۲ کانتینر `NestJS API` | ۲ تا ۴ پاد `Next.js` و `NestJS API` (Auto-scale) | ۴+ پاد با Rolling Zero-Downtime + WAF اختصاصی |
| **Worker & OCR** | ۱ کانتینر `BullMQ Worker` + ۱ کانتینر `FastAPI OCR (CPU)` | ۲+ `Worker` (تفکیک Export Worker) + ۲+ `FastAPI OCR (CPU/GPU)` | Node Pool مجزا برای OCR GPU + Export Pool ایزوله |
| **PostgreSQL** | ۱ سرور PostgreSQL 16 + PgBouncer + بکاپ روزانه S3 | Primary + १ Read Replica (برای گزارش‌ها) + WAL-G پیوسته | Patroni Primary + Sync Standby + Async Read Replica |
| **Redis & Storage** | ۱ نود Redis (AOF) + ۱ نود MinIO | Redis Sentinel (Master/Replica) + MinIO 4-Drive | Redis Cluster/Sentinel HA + MinIO Distributed Erasure Coding |
| **هزینه و پیچیدگی** | کمترین هزینه ثابت، راه‌اندازی سریع | تعادل بهینه کارایی، تاب‌آوری و هزینه | بالاترین SLA و تحمل خرابی کامل یک سرور |

---

## ۲. چالش‌های ویژه ایران و راهکارهای مهندسی (`Iran Network, Sanctions & Local Cloud`)

| حوزه چالش | ریسک عملیاتی | راه‌حل قطعی معماری در Erpkian |
| :--- | :--- | :--- |
| **تحریم ابرهای بین‌المللی (AWS/GCP/Azure)** | مسدودشدن حساب، تاخیر شبکه و خروج داده مالی شرکت‌های ایرانی | استقرار ۱۰۰٪ روی مراکز داده داخل ایران یا ابرهای بومی سازگار با Kubernetes/Docker (نظیر ArvanCloud, ParsPack یا سرور اختصاصی Bare-Metal). |
| **تحریم Registryها (Docker Hub, npm, PyPI)** | شکست CI/CD یا عدم امکان Pull ایمیج و نصب پکیج در سرور تولید | راه‌اندازی **Private Harbor Docker Registry**، کش محلی `Verdaccio` (npm) و آینه `PyPI / HuggingFace / PaddleOCR Models` داخل شبکه داخلی؛ بیلد ایمیج‌ها به صورت Self-Contained بدون دانلود مدل در Runtime. |
| **اختلال یا تحریم در APIهای خارجی LLM** | قطع ناگهانی دستیار مکالمه‌ای یا تایم‌اوت درخواست‌ها | `Provider-Agnostic AI Gateway` با قابلیت Routing بین چند ارائه‌دهنده مجاز، Timeout کوتاه (`8-12s`)، امکان اتصال به مدل‌های Self-Hosted روی GPU داخلی (`vLLM` با `Qwen2.5`) و حالت Fallback قطعی بدون AI. |
| **ابزارهای مانیتورینگ SaaS (Datadog/Sentry)** | عدم دسترسی یا خروج لاگ‌های حساس مالی به خارج | استفاده ۱۰۰٪ از پشته Self-Hosted: **OpenTelemetry Collector + Prometheus + Grafana + Loki + GlitchTip/Self-Hosted Sentry** (همراه با فیلتر حذف PII از لاگ‌ها). |
| **درگاه پیامک و پرداخت اشتراک** | نیاز به اتصال بومی برای OTP و تمدید اشتراک | آداپتور مستقل پیامک بومی (`Kavenegar / Ghasedak`) و درگاه پرداخت شاپرکی (`Zarinpal / Direct IPG`) پشت رابط استاندارد `INotificationProvider` و `IPaymentGateway`. |
| **عدم دسترسی سرور مشتری به اینترنت پاک برای Agent** | مسدود بودن پورت ورودی هلو/سپیدار در دفتر مشتری | `.NET Windows Agent` فقط از طریق **Outbound HTTPS (Port 443)** به دامین داخلی Erpkian متصل می‌شود. |

---

## ۳. استراتژی CI/CD و مهاجرت ایمن (`Zero-Surprise Release Pipeline`)

1. **مراحل Pipeline در CI:** `Lint & Boundary Check -> Unit & Golden Formula Tests -> Testcontainers Postgres Migration & RLS Tests (NST-01..08) -> Security Secret Scan -> Build Docker Images (API, Web, Worker, OCR) -> Push to Private Registry`.
2. **استقرار Migration دیتابیس (`erpkian_migrator`):** پیش از تغییر ترافیک کانتینرها، یک Job موقت با نقش `erpkian_migrator` صرفاً Migrationهای SQL-first (مطابق الگوی `Expand -> Backfill -> Validate -> Contract`) را روی دیتابیس اجرا می‌کند؛ پادهای اجرایی هرگز مجوز DDL ندارند.
3. **بکاپ پیش از انتشار:** پیش از هر Migration عمده در محیط تولید، Snapshot خودکار PostgreSQL گرفته می‌شود.
