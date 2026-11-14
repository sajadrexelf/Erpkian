# 00 — گزارش ممیزی وضعیت واقعی پروژه پیش از پیاده‌سازی (`Current State Audit — Stage 6`)

**تاریخ ممیزی:** ۱۴۰۵/۰۸/۲۴ (`2026-11-14`)  
**دامنه:** ممیزی کامل فایل‌های مخزن، ابزارهای محیط اجرای Google AI Studio، تطبیق با اسناد مراحل ۲ تا ۵، و تعیین معماری اجرایی سازگار.

---

## ۱. ممیزی فایل‌ها و ساختار فعلی مخزن

بررسی مستقیم فایل‌های ریشه و زیرشاخه‌ها پیش از هرگونه تغییر در Stage 6:

- **ساختار پوشه‌ها و فایل‌های موجود:**
  - ریشه (`/`): `.env.example`, `.gitignore`, `bun.lock`, `index.html`, `metadata.json`, `package.json`, `tsconfig.json`, `vite.config.ts`
  - کد برنامه (`src/`): `src/App.tsx` *(۹ خط — صرفاً `export default function App() { return <div></div>; }`)`, `src/main.tsx` *(۶ خط)*, `src/index.css` *(۲ خط — `@import "tailwindcss";`)*
  - دارایی عمومی (`public/assets/`): فایل پیوست اولیه PRD
  - مستندات (`docs/`):
    - `docs/PRD.md` (مرحله ۲)
    - `docs/data-model/` (۱۶ فایل سند معماری داده ۱۰۹ جدولی — مرحله ۳)
    - `docs/processing/` (۱۳ سند + ۶ نمودار `.mmd` — مرحله ۴)
    - `docs/architecture/` (۲۵ سند + ۱۰ نمودار `.mmd` — مرحله ۵)
- **فایل‌های ناقص/خالی یا قالب اولیه:** `src/App.tsx` کاملاً خالی از منطق محصول است؛ `metadata.json` دارای `name: ""` و `description: ""` است؛ `index.html` دارای عنوان پیش‌فرض `My Google AI Studio App` است.
- **وابستگی‌های نصب‌شده (`package.json` پیش از Stage 6):**
  - Runtime: `react ^19.0.1`, `react-dom ^19.0.1`, `vite ^8.3.0`, `express ^4.21.2`, `@google/genai ^2.4.0`, `dotenv ^17.2.3`, `lucide-react ^0.546.0`, `motion ^12.23.24`, `@tailwindcss/vite ^4.3.3`
  - DevDependencies: `typescript ^7.0.2`, `tsx ^4.21.0`, `esbuild ^0.25.0`, `tailwindcss ^4.3.3`, `autoprefixer ^10.4.21`, `@types/node ^22.14.0`, `@types/react ^19.3.0`, `@types/react-dom ^19.3.0`, `@types/express ^4.17.21`
- **تست‌های موجود:** **صفر** (`0` فایل تست در مخزن وجود داشت).
- **نتیجه بررسی اجرا و Build اولیه:**
  - `npm run lint` (`tsc --noEmit`): موفق (`exit 0` روی قالب خالی).
  - `npm run build` (`vite build`): موفق (`271ms`؛ هشدار Vite درباره `__dirname` در `vite.config.ts:11`).
  - قابلیت‌های واقعی کسب‌وکار قابل اجرا در شروع Stage 6: **هیچ‌کدام (`0`)**.

---

## ۲. ممیزی تطبیق مستندات با کد (`DESIGNED / IMPLEMENTED / TESTED / VERIFIED`)

| حوزه قابلیت (مراحل ۲ تا ۵) | `DESIGNED` | `IMPLEMENTED` | `TESTED` | `VERIFIED` | توضیح وضعیت پیش از Stage 6 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| احراز هویت و چندسازمانی (`auth`, `organizations`, `rbac`) | `YES` | `NO` | `NO` | `NO` | صرفاً در اسناد مراحل ۳ تا ۵ طراحی شده است |
| تقویم شمسی کبیسه، ارز `IRR/IRT` و قفل دوره (`fiscal`) | `YES` | `NO` | `NO` | `NO` | نیاز به پیاده‌سازی موتور قطعی سرور |
| مدیریت اسناد و نسخه اصلی تغییرناپذیر (`DOC-INGEST-001`, `DOC-MERGE-002`) | `YES` | `NO` | `NO` | `NO` | نیاز به آپلود واقعی + SHA-256 + ذخیره‌سازی دیسک |
| خط لوله استخراج و OCR (`DOC-OCR-003`, `DOC-CLASS-004`) | `YES` | `NO` | `NO` | `NO` | نیاز به Adapter واقعی و کنترل نبود ابزار/کلید |
| بازبینی انسانی Split-Screen (`DOC-REVIEW-007`) | `YES` | `NO` | `NO` | `NO` | وجود ندارد |
| موتور اعتبارسنجی و محاسبات مالی (`DOC-MATH-005`, `CF-*`) | `YES` | `NO` | `NO` | `NO` | وجود ندارد |
| چرخه فاکتور، تطبیق موجودیت و ثبت قطعی (`DOC-ENTITY-006`, `DOC-POST-008`) | `YES` | `NO` | `NO` | `NO` | وجود ندارد |
| گزارش سنی مطالبات، داشبورد و خروجی (`FIN-AR-AGING-001`, `RPT-DASH-001`, `RPT-EXPORT-001`) | `YES` | `NO` | `NO` | `NO` | وجود ندارد |
| دستیار هوشمند ارکستراتور (`ai-orchestration`) | `YES` | `NO` | `NO` | `NO` | وجود ندارد |
| یکپارچه‌سازی هلو/سپیدار، Windows Agent و مالیات (`INT-*`, `TAX-*`) | `YES` | `NO` | `NO` | `NO` | `TAX-SUB-*` در v1 قفل و `INT-SYNC` نیازمند نمونه واقعی است |

---

## ۳. محدودیت‌های واقعی محیط Google AI Studio و تفکیک معماری

بررسی مستقیم محیط اجرای کانتینر:
- **موجود در محیط:** Node.js `v22.23.2`، npm `10.9.8`، Express + `tsx`، Python `3.10.12` (بدون کتابخانه‌های OCR/تصویر مثل `PIL`/`cv2`/`pytesseract`/`pypdf`)، و `playwright-cli` (Chromium Headless برای تست مرورگر).
- **ناموجود در محیط:** PostgreSQL (`psql: not found`)، Docker (`docker: not found`)، Redis (`redis-server: not found`)، .NET SDK، و در لحظه ممیزی متغیر `GEMINI_API_KEY` در کانتینر ست نشده بود (`GEMINI_API_KEY set? false`).
- **الزام پورت و پیش‌نمایش:** تمام سرویس وب و API باید از پورت `3000` (Express + Vite middlewares در حالت Dev) سرو شود.

### تفکیک شفاف: معماری هدف محصول vs معماری اجرایی سازگار در AI Studio

| لایه | معماری نهایی هدف (`docs/architecture/`) | معماری اجرایی سازگار در محیط فعلی (Modular & Portable) | وضعیت انتقال‌پذیری |
| :--- | :--- | :--- | :--- |
| **Backend API** | NestJS Modular Monolith (پورت ۴۰۰۰/۳۰۰۰) | سرور **Express + TypeScript (`server.ts`)** با مرزبندی ماژولار (`kernel`, `modules/*`, `coordinators/*`) و Middlewareهای `Auth`, `RBAC`, `Idempotency` و `TenantContext` | قرارداد API (`/api/v1/*`)، کد خطاها و Use-Caseها یکسان‌اند |
| **پایگاه داده** | PostgreSQL 16 + PgBouncer + `FORCE RLS` (۱۰۹ جدول) | **SQLite واقعی با `better-sqlite3`** روی دیسک (`data/erpkian.sqlite`, WAL + `PRAGMA foreign_keys = ON`) با جداسازی سازمانی در لایه `TenantRepositoryContext` | **`PostgreSQL RLS` در این محیط اجرا نشده** و به عنوان محدودیت توسعه ثبت می‌شود؛ لایه Repository ایزوله است |
| **ذخیره‌سازی فایل** | MinIO / S3-Compatible | **Object Storage محلی روی دیسک (`storage/objects/<org_id>/<doc_id>/`)** با کلید یکتا، `sha256_hash`، نسخه `ORIGINAL` تغییرناپذیر و لینک دانلود دارای توکن کوتاه‌عمر/مجوز | رابط `IObjectStoragePort` آماده اتصال به S3/MinIO |
| **موتور OCR** | Python FastAPI + OpenCV + PaddleOCR + Vision Fallback | **Adapter چندگانه `IOcrEngineAdapter`** با پشتیبانی: (۱) آداپتور `GeminiMultimodalOcrAdapter` (سمت سرور با `@google/genai` در صورت وجود `GEMINI_API_KEY`)، (۲) استخراج متن ساختاریافته از فایل‌های متنی/JSON/CSV، و (۳) حالت صریح `OCR_ENGINE_UNAVAILABLE` برای تصاویر وقتی کلید API تنظیم نشده (بدون تولید خروجی جعلی!) | بدون کلید/موتور واقعی، OCR جعلی تولید نمی‌شود و وضعیت واقعی نمایش می‌یابد |
| **Frontend UI** | Next.js App Router RTL | **React 19 + TypeScript + Tailwind v4 RTL (`dir="rtl"`)** با ساختار ویوهای کامل و ویجت‌های اعلامی بدون محاسبه مالی در مرورگر | کامپوننت‌ها و قراردادهای DTO مستقیماً قابل انتقال به Next.js |
| **صف و Outbox** | Redis + BullMQ + Transactional Outbox | ثبت واقعی Jobها و `processing_jobs` در SQLite + پردازش ساختاریافته آسنکرون در سرور Node | رابط `IJobQueuePort` آماده اتصال به BullMQ |

---

## ۴. تصمیم‌های باز مؤثر بر پیاده‌سازی (`docs/architecture/23-open-decisions.md`)

تصمیم‌های دارای وضعیت **`PROPOSED_FOR_OWNER_APPROVAL`** در مرحله ۵ کماکان به عنوان فرض موقت قابل تعویض پیاده‌سازی می‌شوند و بدون تایید مالک محصول `CONFIRMED` اعلام نمی‌شوند:
1. **`OD-03` (`is_promotional_free_item`, `promo_reason`)** و **`OD-04` (`discount_pct`)**: پشتیبانی در اسکیما و موتور اعتبارسنجی (`VR-MATH-03`) به صورت پیکربندی‌پذیر.
2. **`OD-12` (آستانه‌های OCR `0.65`/`0.85` و Dual Approval بالای سقف)**: قابل تنظیم در جدول `organization_settings` و اعمال سخت عدم `Posted` خودکار از OCR.
3. **`AUDIT-S4-01/02/03` (اصلاحیه `CF-DOC-INV-01`, `CF-STK-01`, تفکیک `GrossMarginPct` از `TrueOperatingMarginPct` و `PRE_TAX_PRORATA`)**: پیاده‌سازی دقیق و قابل آزمون در `src/shared/decimal/` با حفظ قابلیت انتخاب `POST_TAX_DISCOUNT`.
4. **`BLOCKED-ERP` (`INT-SYNC` هلو/سپیدار)**: به دلیل نبود فایل نمونه واقعی، خارج از مسیر بحرانی Vertical Slice فعلی نگه داشته می‌شود.
5. **`TAX-SUB-*` (`TAX-SUB-MOADIAN-001`, `TAX-SUB-RETURN-001`)**: در API با کد `403 FEATURE_LOCKED_IN_V1` مسدود می‌ماند.

---

## ۵. اولویت‌بندی کارهای اجرایی در Stage 6

1. **ساخت هسته مشترک قطعی (`src/shared/`)**: موتور `Decimal.js` با `Half-to-Even`، تقویم شمسی کبیسه `JalaliCalendar`، فرمول‌های `CF-DOC-INV-01`, `CF-AR-01..03`, `VR-MATH/DATE/CURR/DUP/PER` و قراردادهای `ApiResponseEnvelope` / `ErpkianReportEnvelope v1` + تست‌های واحد (`node:test`).
2. **لایه داده و ذخیره‌سازی واقعی (`src/server/db/`)**: اسکیمای SQLite منطبق با موجودیت‌های مسیر اصلی (`organizations`, `users`, `memberships`, `roles`, `permissions`, `fiscal_years`, `fiscal_periods`, `period_locks`, `contacts`, `products`, `documents`, `document_versions`, `document_pages`, `document_storage_objects`, `extraction_jobs`, `extraction_attempts`, `extracted_fields`, `extraction_reviews`, `extraction_corrections`, `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `checks`, `approval_requests`, `report_*`, `conversations`, `tool_invocations`, `audit_logs`, `security_events`) + Seed داده‌های پایه واقعی (نقش‌ها، مجوزها، سال مالی ۱۴۰۵، واحدهای سنجش، سازمان نمونه قابل تفکیک با برچسب `Demo / Synthetic`).
3. **سرویس‌های مسیر اصلی (`Vertical Slice`) در Express Backend**: احراز هویت واقعی/حالت توسعه شفاف، `DOC-INGEST-001`, `DOC-MERGE-002`, `DOC-OCR-003` (Adapter واقعی), `DOC-CLASS-004`, `DOC-MATH-005`, `DOC-ENTITY-006`, `DOC-REVIEW-007`, `DOC-POST-008`, `FIN-AR-INV-001`, `FIN-AR-PAY-002`, `FIN-AR-ALLOC-003`, `FIN-AR-AGING-001`, `RPT-DASH-001`, `RPT-EXPORT-001` (`.xlsx` ۴ شیتی واقعی + `.csv` BOM + `.json` + نسخه چاپی/PDF).
4. **دستیار ارکستراتور واقعی (`AI Orchestrator`)**: تشخیص نیت قطعی + اتصال اختیاری Gemini برای توضیح فارسی، بررسی آمادگی داده، گیت `RBAC`، ثبت `tool_invocations`، شواهد عددی قابل کلیک، و کارکرد کامل در نبود کلید API.
5. **رابط کاربری حرفه‌ای فارسی RTL (`src/client/`)**: داشبورد، میز کار مکالمه‌ای، مرکز اسناد و آپلود چندصفحه‌ای، صفحه بررسی Split-Screen OCR، فاکتورها و چرخه تایید دوامضایی، دریافت/پرداخت و تخصیص، گزارش سنی مطالبات و خروجی، کارتابل تایید، و مدیریت سازمان/دسترسی/دوره مالی.
6. **آزمون و راستی‌آزمایی جامع**: تست‌های واحد، تست‌های یکپارچه API + DB + امنیت، تست E2E مسیر کامل در مرورگر واقعی با `playwright-cli`، ثبت یافته‌ها و تکمیل `docs/implementation/01-stage6-implementation-report.md`.
