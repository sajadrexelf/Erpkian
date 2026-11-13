# 01 — تصمیم‌های معماری و انتخاب پشته فناوری (`Architecture Decisions & Tech Stack`)

این سند تمام **۱۴ تصمیم کلیدی معماری و فناوری (`ADR-01` تا `ADR-14`)** را بر اساس ۹ معیار ارزیابی رسمی بررسی می‌کند و وضعیت تایید هر تصمیم را صریحاً ثبت می‌نماید.

---

## ۱. ماتریس ارزیابی ۹معیاره فناوری‌های منتخب

**راهنمای امتیازدهی (`1` ضعیف تا `5` عالی):**  
`(1) کارایی` | `(2) مقیاس‌پذیری` | `(3) نگهداشت‌پذیری` | `(4) بهره‌وری توسعه` | `(5) سازگاری اکوسیستم ایران/فارسی` | `(6) امنیت` | `(7) پیچیدگی عملیاتی معکوس (۵=کم‌پیچیده)` | `(8) هزینه اجرا` | `(9) سهولت استقرار و مهاجرت`

| ADR | حوزه تصمیم | گزینه منتخب | گزینه‌های جایگزین بررسی‌شده | (1) | (2) | (3) | (4) | (5) | (6) | (7) | (8) | (9) | وضعیت تصمیم |
| :---: | :--- | :--- | :--- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :--- |
| **ADR-01** | سبک معماری Backend | **Modular Monolith (`NestJS`)** | Microservices از روز اول، Monolith بی‌مرز | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | `CONFIRMED` |
| **ADR-02** | فریم‌ورک Backend API | **NestJS + TypeScript + Zod/Decimal** | Express خام، Fastify خام، Go Gin، Python Django | 4 | 4 | 5 | 5 | 4 | 5 | 4 | 4 | 5 | `CONFIRMED` |
| **ADR-03** | فریم‌ورک Frontend | **Next.js (App Router) + TS + Tailwind RTL** | Vite React SPA خام، Remix، Vue/Nuxt | 4 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 5 | `CONFIRMED` |
| **ADR-04** | پایگاه داده اصلی | **PostgreSQL 16+ (PgBouncer + `pg_trgm`)** | MySQL 8، SQL Server، MongoDB | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 5 | 4 | `CONFIRMED` |
| **ADR-05** | لایه ORM و Migration | **Drizzle ORM + SQL-first Migrations** | Prisma ORM، TypeORM، Knex خام | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 4 | `PROPOSED_FOR_OWNER_APPROVAL` *(OD-01)* |
| **ADR-06** | سرویس OCR و پردازش تصویر | **Python 3.12 + FastAPI (Isolated Service)** | Node.js Tesseract.js، Serverless Lambda فقط | 5 | 5 | 4 | 4 | 5 | 4 | 4 | 4 | 4 | `CONFIRMED` |
| **ADR-07** | موتور صف و کارهای پس‌زمینه | **Redis 7 + BullMQ + Transactional Outbox** | RabbitMQ، Kafka، فقط DB Polling | 5 | 4 | 5 | 5 | 5 | 4 | 5 | 5 | 5 | `CONFIRMED` |
| **ADR-08** | ذخیره‌سازی فایل و اسناد | **MinIO (Self-Hosted) / S3-Compatible API** | فایل‌سیستم لوکال سرور، PostgreSQL BYTEA | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | `CONFIRMED` |
| **ADR-09** | عامل دسکتاپ محلی ERP | **.NET 8 Windows Service (Read-Only)** | Electron App، Python Exe، Node Windows Service | 5 | 4 | 4 | 4 | 5 | 5 | 4 | 5 | 5 | `CONFIRMED` |
| **ADR-10** | درگاه هوش مصنوعی | **Provider-Agnostic AI Gateway (Adapter)** | وابستگی مستقیم به یک SDK خاص در دامنه‌ها | 4 | 5 | 5 | 4 | 4 | 5 | 4 | 4 | 5 | `PROPOSED_FOR_OWNER_APPROVAL` |
| **ADR-11** | موتور تولید PDF فارسی RTL | **Playwright/Chromium HTML-to-PDF (با WeasyPrint در OCR Worker به عنوان Fallback)** | PDFKit مستقیم، JasperReports | 3 | 4 | 5 | 5 | 5 | 4 | 3 | 4 | 4 | `PROPOSED_FOR_OWNER_APPROVAL` |
| **ADR-12** | موتور تولید Excel و CSV | **ExcelJS (`Streaming`) + UTF-8 BOM CSV** | SheetJS CE (محدودیت استایل RTL)، Python openpyxl | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | `PROPOSED_FOR_OWNER_APPROVAL` |
| **ADR-13** | مدیریت نشست و احراز هویت | **Short-lived JWT + Rotating Refresh Token + Device Token** | Session Cookie تک‌سرور بدون Refresh، OAuth اجباری | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 5 | 5 | `PROPOSED_FOR_OWNER_APPROVAL` |
| **ADR-14** | پشته رصد و لاگینگ | **OpenTelemetry + Prometheus + Grafana + Loki (Self-Hosted)** | SaaS خارجی وابسته به اینترنت بین‌الملل | 4 | 5 | 5 | 4 | 5 | 5 | 3 | 4 | 4 | `PROPOSED_FOR_OWNER_APPROVAL` |

---

## ۲. شرح فنی و استدلال هر تصمیم (`ADR Details`)

### `ADR-01` & `ADR-02`: NestJS Modular Monolith (`CONFIRMED`)
- **دلیل:** پشتیبانی بومی از Dependency Injection، ماژول‌های مجزا (`@Module`)، گاردهای متوالی (`AuthGuard` -> `RbacGuard` -> `BranchScopeGuard`)، Interceptor برای `Idempotency` و `Audit`، و اشتراک‌گذاری یکپارچه موتور ریاضی قطعی (`Decimal/BigInt`) با قراردادهای TypeScript.
- **عواقب:** نیازمند اجرای سخت‌گیرانه قوانین عدم چرخه وابستگی در ESLint و ممنوعیت دسترسی مستقیم یک ماژول به Repository ماژول دیگر.

### `ADR-03`: Next.js App Router + TypeScript + Tailwind RTL (`CONFIRMED`)
- **دلیل:** رندر ترکیبی برای لود سریع صفحات داشبورد و گزارش‌ها، مدیریت تمیز Routing ۱۶ صفحه تخصصی، پشتیبانی از RTL فارسی، و ساختار ماژولار برای رندر **Declarative UI Widgets** از خروجی سرور بدون قرار دادن فرمول محاسباتی در کلاینت.

### `ADR-04`: PostgreSQL 16+ با PgBouncer (`CONFIRMED`)
- **دلیل:** تنها دیتابیس رابطه‌ای متن‌باز با پشتیبانی همزمان از `FORCE ROW LEVEL SECURITY`، کلیدهای خارجی مرکب `(organization_id, id)`، نوع دقیق `NUMERIC(18,0)` / `NUMERIC(20,4)`، جستجوی فازی فارسی `pg_trgm`، ایندکس‌های Partial و قابلیت Partitioning آینده.

### `ADR-05`: Drizzle ORM + SQL-first Migrations (`PROPOSED_FOR_OWNER_APPROVAL` — `OD-01`)
- **دلیل مقایسه با Prisma:** Prisma برای `Composite FKs` در ۱۰۹ جدول و تزریق `SET LOCAL app.current_organization_id` در ابتدای هر تراکنش زیر `PgBouncer` نیازمند Raw Workaround است؛ همچنین کنترل `CHECK` Constraints و `FORCE RLS` در فایل‌های SQL خالص تحت مدیریت Drizzle Migration بسیار شفاف‌تر و قابل حسابرسی‌تر است.
- **مستند مرجع:** `docs/data-model/11-orm-evaluation.md` و `docs/processing/11-open-decisions.md`.

### `ADR-06`: Python 3.12 + FastAPI برای Document Intelligence & OCR (`CONFIRMED`)
- **دلیل:** اکوسیستم پایتون برای پیش‌پردازش تصویر (`OpenCV`, `Pillow`, `pypdfium2`) و موتورهای OCR (`PaddleOCR` + خط لوله مدل‌های Vision) بی‌رقیب است. ایزولاسیون آن در کانتینر مستقل باعث می‌شود مصرف بالای CPU/RAM یا GPU در OCR به زمان پاسخ APIهای مالی NestJS آسیب نزند.

### `ADR-07`: Redis 7 + BullMQ + Transactional Outbox (`CONFIRMED`)
- **دلیل:** BullMQ روی Redis ساده‌ترین و پایدارترین انتخاب برای صف‌های اولویت‌دار، تاخیر زمانی (`Delayed Jobs`)، نرخ محدودیت، Retry با Exponential Backoff و `Dead-Letter Queue` است. افزودن **Transactional Outbox** در PostgreSQL ریسک از دست رفتن پیام صف هنگام Crash بین DB Commit و Redis Publish را صفر می‌کند.

### `ADR-08`: MinIO / S3-Compatible Storage (`CONFIRMED`)
- **دلیل:** امکان استقرار ۱۰۰٪ بومی (`Self-Hosted MinIO`) در مراکز داده داخل ایران بدون وابستگی به AWS S3، همراه با API استاندارد S3، رمزنگاری Server-Side (`SSE`)، سیاست‌های Immutability (Object Lock برای اسناد `Posted`) و صدور Pre-signed URL دو دقیقه‌ای.

### `ADR-09`: .NET 8 Windows Service (`CONFIRMED`)
- **دلیل:** ۹۰٪+ نصب‌های نرم‌افزارهای هلو، سپیدار و راهکاران روی ویندوز و SQL Server محلی شرکت‌ها قرار دارند. `.NET 8` با یک سرویس ویندوزی بومی، اتصال امن Read-Only به SQL Server محلی، کار با سیستم‌فایل ویندوز و ارسال فشرده امن به API ابری، کمترین اصطکاک نصبی را برای کاربر غیرمتخصص دارد.

### `ADR-10`: Provider-Agnostic AI Gateway (`PROPOSED_FOR_OWNER_APPROVAL`)
- **دلیل:** با توجه به نوسانات دسترسی به APIهای بین‌المللی در ایران، تغییر سریع مدل‌ها و هزینه توکن، لایه AI نباید مستقیماً به یک SDK خاص (مثل صرفاً OpenAI یا صرفاً Gemini) قفل شود. معماری Gateway با رابط `ILlmProviderAdapter` امکان سوئیچ یا Fallback بین مدل‌های ابری، پروکسی‌های مجاز یا مدل‌های Self-Hosted محلی (`vLLM / Ollama`) را بدون تغییر منطق کسب‌وکار فراهم می‌کند.

### `ADR-11`: موتور تولید PDF فارسی RTL (`PROPOSED_FOR_OWNER_APPROVAL`)
- **انتخاب:** استفاده از **Chromium Headless (Playwright)** با قالب‌های HTML/CSS استاندارد RTL و فونت `Vazirmatn` برای گزارش‌های رسمی چندصفحه‌ای، جداول پیچیده و باکس شواهد؛ با امکان پشتیبانی از Streaming Worker اختصاصی.
- **ملاحظه:** رندر با Playwright حدود ۱۵۰ تا ۴۰۰ مگابایت RAM به ازای Worker مصرف می‌کند؛ لذا تولید PDF همواره به صورت Async در `q.export.render` اجرا می‌شود، نه داخل درخواست HTTP اصلی.

### `ADR-12`: موتور Excel و CSV (`PROPOSED_FOR_OWNER_APPROVAL`)
- **انتخاب:** `ExcelJS` در حالت Streaming برای تولید فایل `.xlsx` چهار شیتی RTL با فرمول واقعی `SUM`، فریز سطر هدر، AutoFilter و فرمت عددی ریال/تومان؛ و تولید CSV با `UTF-8 BOM` جهت باز شدن صحیح فارسی در Excel ویندوز.

### `ADR-13` & `ADR-14`: امنیت نشست و رصد بومی (`PROPOSED_FOR_OWNER_APPROVAL`)
- استفاده از JWT کوتاه‌عمر (۱۵ دقیقه) + Refresh Token چرخشی ذخیره به صورت Hash در DB/Redis، و ابزارهای مانیتورینگ ۱۰۰٪ Self-Hosted برای استقلال کامل از سرویس‌های تحریم‌پذیر خارجی.
