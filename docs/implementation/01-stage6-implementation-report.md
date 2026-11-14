# گزارش نهایی پیاده‌سازی مرحله ششم (Stage 6 Implementation Report) — پلتفرم Erpkian

**تاریخ:** ۱۴۰۵/۰۸/۲۴ (۱۴ نوامبر ۲۰۲۶)  
**وضعیت کلی:** پیاده‌سازی کامل Vertical Slice اصلی + لایه‌های امنیتی، ممیزی، گزارش‌گیری، خروجی رسمی و داشبورد فارسی راست‌به‌چپ (RTL)

---

## الف) تغییرات ایجادشده در کد و ساختار پروژه

تمامی مستندات طراحی مراحل ۲ تا ۵ (`docs/PRD.md`, `docs/data-model/*`, `docs/processing/*`, `docs/architecture/*`) دست‌نخورده حفظ شدند و پیاده‌سازی بر اساس نقشه فنی مرحله ۵ در ساختار ماژولار زیر انجام شد:

1. **هسته قطعی و قراردادهای مشترک (`src/shared/`)**
   - `src/shared/contracts.ts`: قراردادهای TypeScript برای `ApiResponseEnvelope<T>`، `ErpkianReportEnvelope<TRow>`، نقش‌ها (`RoleCode`)، مجوزها (`PermissionCode`)، وضعیت‌های چرخه حیات سند و فاکتور، و ویجت‌های اعلانی (`DeclarativeWidget`).
   - `src/shared/jalali.ts`: مبدل دقیق تقویم شمسی ↔ میلادی (الگوریتم بیرشک/بورکوفسکی)، اعتبارسنجی سال کبیسه (`1403/12/30` معتبر؛ `1404/12/30` و `1405/12/30` نامعتبر) و نرمال‌سازی ارقام و حروف فارسی/عربی.
   - `src/shared/decimal-math.ts`: موتور محاسباتی دقیق با `Decimal.js` و گردکردن بانکی `ROUND_HALF_EVEN` برای محاسبه فاکتور (`CF-DOC-INV-01`، تخفیف ردیفی و سرجمع `PRE_TAX_PRORATA` / `POST_TAX_DISCOUNT`، اقلام اشانتیون، تبدیل صریح ارز `VR-CURR-01..04`، تبدیل واحد `VR-UOM-02`، محاسبه مانده باز `CF-AR-01`، دسته‌بندی سنی `CF-AR-02`، تخصیص `FIFO_AUTO` `CF-AR-03`، تفکیک `GrossMarginPct` از `TrueOperatingMarginPct` و اعتبارسنجی کدملی و شناسه ۱۶ رقمی صیادی `VR-ENT-01`).

2. **لایه داده و پایدارسازی (`src/server/db/`)**
   - `src/server/db/schema.ts`: پیاده‌سازی اسکیمای رابطه‌ای در SQLite (`better-sqlite3`, حالت `WAL`, `foreign_keys = ON`) شامل ۳۵+ جدول، تریگرهای تغییرناپذیری `audit_logs` (`BEFORE UPDATE/DELETE RAISE ABORT`)، محافظت از حذف فیزیکی `invoices` و تغییرناپذیری فاکتورهای `Posted`، و قید پایگاه‌داده‌ای `CHECK` برای منع خودتاییدی در `approval_requests`.
   - `src/server/db/seed.ts`: بذرگذاری ۹ نقش، ۲۰ مجوز، ۱۶ تعریف سرویس (`TAX-SUB-*` با `is_locked_in_v1 = 1`)، دو سازمان ایزوله (`org-demo-aria` با برچسب صریح `is_demo_synthetic = 1` و `org-demo-beta` برای تست ایزولاسیون)، ۴ کاربر آزمایشی (`OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `INVENTORY_MANAGER`)، ۱۲ دوره مالی ۱۴۰۵، کالاهای چندواحدی، طرف‌حساب‌ها، فاکتورهای نمونه، دریافت و چک صیادی.

3. **هسته سرور، امنیت و ماژول‌های کسب‌وکار (`src/server/` & `server.ts`)**
   - `src/server/kernel/context.ts`: کنترل عضویت و ایزولاسیون سازمانی (`CROSS_TENANT_ACCESS_DENIED` همراه با ثبت در `security_events`)، گارد `requirePermission`، مدیریت یکتایی عملیات (`idempotency_records`)، و ثبت ممیزی تغییرناپذیر (`audit_logs`).
   - `src/server/infrastructure/object-storage.ts`: ذخیره‌سازی دیسکی تحت `storage/` با بررسی دقیق Magic Bytes (`PNG`, `JPG`, `WEBP`, `PDF`, `JSON`, `CSV`, `TXT` و مسدودسازی باینری‌های اجرایی `MZ`/`ELF` و محتوای فعال `HTML/SVG/Script`)، محاسبه `SHA-256` و تولید توکن امضاشده با اعتبار ۲ دقیقه برای پیش‌نمایش امن سند.
   - `src/server/modules/documents/document-service.ts`: پیاده‌سازی `DOC-INGEST-001` (تشخیص فایل تکراری SHA-256) و `DOC-MERGE-002` (ادغام چند سند/صفحه با حفظ نسخه ۱ اصلی).
   - `src/server/modules/ocr/ocr-adapter.ts` و `ocr-service.ts`: پیاده‌سازی `IOcrEngineAdapter` شامل `StructuredDocumentOcrAdapter` (استخراج قطعی JSON/CSV)، `GeminiMultimodalOcrAdapter` (با `gemini-4-hydrogen` در صورت وجود `GEMINI_API_KEY`)، و وضعیت صادقانه `OCR_ENGINE_UNAVAILABLE` برای تصاویر بدون کلید؛ همراه با `DOC-OCR-003`, `DOC-CLASS-004`, `DOC-MATH-005` و کارتابل بازبینی انسانی `DOC-REVIEW-007` (ثبت `extraction_corrections` قبل/بعد و انتقال به `Verified`، بدون ثبت قطعی خودکار).
   - `src/server/modules/contacts/entity-service.ts`: تطبیق و پیشنهاد فازی طرف‌حساب (`DOC-ENTITY-006`)، مدیریت طرف‌حساب‌ها و موجودی انبار کالاها.
   - `src/server/modules/invoices/invoice-service.ts`: `FIN-AR-INV-001` و گیت ثبت قطعی `DOC-POST-008` (کنترل دوره مالی قفل‌شده، کنترل موجودی منفی، جریان تایید دوامضایی با منع `SELF_APPROVAL_FORBIDDEN`، ثبت حرکات انبار `inventory_movements` و سند معکوس).
   - `src/server/modules/payments/payment-service.ts`: `FIN-AR-PAY-002`، تخصیص `EXPLICIT` / `FIFO_AUTO` با منع سرریز (`FIN-AR-ALLOC-003`)، و چرخه چک صیادی ۱۶ رقمی (`TRS-CHK-001`: چک در جریان وصول تا تغییر وضعیت به `CLEARED` از مانده باز بدهی کسر نمی‌شود).
   - `src/server/modules/reporting/reporting-service.ts`: `FIN-AR-AGING-001` با اسنپ‌شات تغییرناپذیر، نسخه‌بندی `v1 -> v2`، هشدار اسناد معلق و چک‌های در جریان، شواهد کامل (`evidences`) و خلاصه داشبورد `RPT-DASH-001`.
   - `src/server/modules/export/export-service.ts`: `RPT-EXPORT-001` تولیدکننده واقعی `.xlsx` (۴ شیت راست‌به‌چپ با فرمول‌های `SUM` از طریق `ExcelJS`)، `.pdf` فارسی راست‌به‌چپ (از طریق Headless Chromium با فونت `Noto Sans Arabic`)، `.csv` با `UTF-8 BOM` و `.json`.
   - `src/server/modules/ai/ai-orchestrator.ts`: ارکستراتور مکالمه‌ای با گیت پیش‌اجرای RBAC، قفل سرویس‌های مالیاتی نسخه ۱، فراخوانی سرویس قطعی سرور، روایت فارسی تاییدشده (با زمان‌سنج ۶ ثانیه‌ای برای `gemini-4-hydrogen` و بازگشت امن به قالب قطعی سرور) و ثبت در `tool_invocations`.
   - `src/server/modules/admin/admin-service.ts`, `src/server/app.ts`, `server.ts`: تنظیمات سازمانی، بستن/بازگشایی دوره‌های مالی (`period_locks`)، گزارش‌های ممیزی/امنیتی و مسدودسازی قطعی `/api/tax/moadian/submit` و `/api/tax/return/submit` با کد `403 FEATURE_LOCKED_IN_V1`.

4. **رابط کاربری فارسی راست‌به‌چپ (`src/client/*`, `src/App.tsx`, `index.html`, `src/index.css`)**
   - طراحی ۹ بخش عملیاتی کامل: داشبورد مدیریتی، دستیار هوشمند، مرکز اسناد و آپلود، بازبینی انسانی دوپنجره‌ای OCR، فاکتورها و ثبت قطعی، دریافت و چک صیادی، سنی مطالبات و خروجی، کارتابل تایید دوامضایی، و تنظیمات/دوره مالی/ممیزی؛ به‌همراه پنل کشویی شواهد (`EvidenceDrawer`)، تغییر واحد نمایشی (تومان/ریال) و تغییر شفاف نقش/سازمان آزمایشی.

---

## ب) جدول وضعیت واقعی قابلیت‌ها (Status Matrix)

| کد / ماژول | عنوان قابلیت | وضعیت واقعی | توضیح اجرایی و شواهد |
|---|---|---|---|
| `DOC-INGEST-001` | آپلود، بررسی Magic Bytes و کنترل تکراری SHA-256 | **VERIFIED** | تست یکپارچه + تست مرورگر + ثبت `security_events` روی فایل `.exe` |
| `DOC-MERGE-002` | ادغام چند صفحه/سند با حفظ نسخه اصلی `v1` | **TESTED** | تست یکپارچه `page_count = 2` و حفظ `ORIGINAL` |
| `DOC-OCR-003` / `004` / `005` | استخراج ساختاریافته / Gemini OCR / کنترل ریاضی و تاریخ شمسی | **VERIFIED** | تست یکپارچه + مرورگر؛ وضعیت صادقانه `OCR_ENGINE_UNAVAILABLE` برای PNG بدون کلید |
| `DOC-ENTITY-006` | تطبیق طرف‌حساب و کاندیداهای فازی فارسی | **IMPLEMENTED** | ثبت `entity_match_candidates` و endpoint حل‌وفصل (`MERGE`/`CREATE_NEW`/`REJECT`) |
| `DOC-REVIEW-007` | بازبینی دوپنجره‌ای، ثبت اصلاحات قبل/بعد و ارتقا به `Verified` | **VERIFIED** | تست یکپارچه + مرورگر؛ فایل و فاکتور به `Verified` می‌رسند (نه `Posted`) |
| `DOC-POST-008` | گیت ثبت قطعی، قفل دوره مالی، موجودی منفی و تایید دوامضایی | **TESTED** | تست یکپارچه: مسدودسازی دوره `CLOSED`، منع `SELF_APPROVAL_FORBIDDEN`، تایید توسط `CFO` |
| `FIN-AR-INV-001` | ثبت فاکتور با چند واحد کالا (UoM)، اشانتیون و تخفیف | **VERIFIED** | ۱۱ تست واحد (`Decimal.js`) + تست یکپارچه + فرم UI |
| `FIN-AR-PAY-002` / `ALLOC-003` | ثبت دریافت، تخصیص `FIFO_AUTO` و `EXPLICIT` با منع سرریز | **TESTED** | تست یکپارچه: رد سرریز `409 ALLOCATION_EXCEEDS_INVOICE_OPEN_BALANCE` |
| `TRS-CHK-001` | چک صیادی ۱۶ رقمی و تفکیک از نقد وصول‌شده | **TESTED** | چک در وضعیت `IN_HAND` بدهی را کم نمی‌کند؛ پس از `CLEARED` در AR لحاظ می‌شود |
| `FIN-AR-AGING-001` | سنی مطالبات، اسنپ‌شات و نسخه‌بندی `v1 -> v2` + شواهد | **VERIFIED** | تست یکپارچه + مرورگر (پنل `EvidenceDrawer` و نسخه‌های `v1..v4`) |
| `RPT-DASH-001` | داشبورد مدیریتی با فیلتر نقش و هشدار کامل‌بودن داده | **VERIFIED** | تست مرورگر دسکتاپ (`1440x900`) و موبایل (`390x844`) |
| `RPT-EXPORT-001` | خروجی رسمی `.xlsx` (۴ شیت)، `.pdf` فارسی، `.csv` BOM و `.json` | **TESTED** | تست یکپارچه با بازخوانی واقعی در `ExcelJS`، بررسی هدر `%PDF-` و BOM |
| `AI-ORCHESTRATOR` | ارکستراتور مکالمه‌ای، گیت RBAC، ابزارهای قطعی و ویجت‌ها | **VERIFIED** | تست یکپارچه + مرورگر (`OWNER` مجاز؛ `INVENTORY_MANAGER` مسدود با `RBAC_PERMISSION_DENIED`) |
| `SEC-TENANT-AUDIT` | ایزولاسیون بین‌سازمانی و تغییرناپذیری `audit_logs` | **TESTED** | تست یکپارچه: `CROSS_TENANT_ACCESS_DENIED` و خطای تریگر SQLite روی `DELETE FROM audit_logs` |
| `TAX-SUB-MOADIAN-001` / `RETURN-001` | ارسال رسمی به سامانه مودیان و اظهارنامه (قفل در نسخه ۱) | **VERIFIED** | قفل‌شده با `403 FEATURE_LOCKED_IN_V1` در API و AI Orchestrator |
| `INFRA-PROD-PG-RLS` | PostgreSQL 16 + `FORCE ROW LEVEL SECURITY` + Redis/BullMQ + FastAPI OCR | **DESIGNED** | در محیط کانتینر وجود ندارد؛ اسناد معماری مرحله ۵ کامل است و SQLite + دیسک محلی جایگزین توسعه شده‌اند |

---

## ج) نتایج واقعی آزمون‌ها و بررسی‌ها

1. **تست‌های واحد و یکپارچه (`npm test` → `tsx --test tests/unit/*.test.ts tests/integration/*.test.ts`)**:
   - **۱۵ از ۱۵ تست با موفقیت کامل عبور کرد (`pass 15, fail 0`)**:
     - `tests/unit/jalali.test.ts`: ۳ تست (کبیسه ۱۴۰۳/۱۴۰۴/۱۴۰۵، رفت‌وبرگشت تاریخ شمسی ↔ میلادی، نرمال‌سازی فارسی).
     - `tests/unit/decimal-math.test.ts`: ۸ تست (`GTC-01` تا `GTC-10`، گردکردن بانکی، تبدیل ارز `IRT -> IRR`، اشانتیون، FIFO، جداسازی حاشیه سود ناخالص از عملیاتی واقعی، کدملی و صیادی).
     - `tests/integration/vertical-slice-and-security.test.ts`: ۴ سناریوی جامع E2E و امنیتی روی سرور واقعی Express با پایگاه‌داده و ذخیره‌سازی موقت مجزا.
2. **ساخت و تحلیل استاتیک (`npm run build` / `compile_applet` و `npm run lint` / `tsc --noEmit`)**:
   - هر دو بدون هیچ خطای کامپایل یا TypeScript با موفقیت کامل اجرا شدند.
3. **آزمون مرورگر واقعی (`playwright-cli` روی `http://localhost:3000` با Chromium)**:
   - اجرای ۲ دور کامل بررسی رابط کاربری در رزولوشن دسکتاپ (`1440×900`) و موبایل (`390×844`) با **۰ خطای Console و ۰ خطای صفحه**.
   - **نقایص کشف‌شده و رفع‌شده در جریان بررسی مرورگر**:
     1. افزودن Timeout ۶ ثانیه‌ای به فراخوانی `gemini-4-hydrogen` در ارکستراتور تا پاسخ‌دهی هیچ‌گاه معطل نماند و پاکسازی کاراکترهای مارک‌داون از پاسخ فارسی.
     2. ریست خودکار تاریخچه گفتگو و وضعیت بارگذاری در `AiWorkspaceView` هنگام تغییر نقش/سازمان تا داده‌های نشست قبلی نمایش داده نشود.
     3. هم‌تراز کردن شمارنده کارت «کارتابل اقدام و تایید» در داشبورد با هشدار اسناد و فاکتورهای منتظر قطعی‌سازی.
     4. قالب‌بندی خوانا (`JSON.stringify(..., null, 2)` با شکستن خطوط) در پیش‌نمایش سند بازبینی OCR و تنظیم عرض انتخابگر نقش در نمای موبایل.

---

## د) محدودیت‌های محیط، انطباق صادقانه و تصمیم‌های باز

- **محدودیت‌های محیط اجرا:** در کانتینر فعلی سرویس‌های `PostgreSQL`، `Redis/BullMQ`، و موتور OCR پایتونی (`PaddleOCR`/`Tesseract`) نصب نیستند؛ لذا ذخیره‌سازی با `SQLite (better-sqlite3)` + فایل‌سیستم محلی پیاده‌سازی شده و `PostgreSQL RLS` به عنوان `DESIGNED` ثبت شده است. همچنین در محیط تست یکپارچه هنگام نبود `GEMINI_API_KEY`، آداپتور OCR برای تصاویر باینری به‌صورت صادقانه وضعیت `OCR_ENGINE_UNAVAILABLE` برمی‌گرداند و هرگز متن ساختگی تولید نمی‌کند.
- **حفظ وضعیت تصمیم‌های باز (`PROPOSED_FOR_OWNER_APPROVAL`):** مواردی نظیر آستانه تایید دوامضایی (`require_dual_approval_above_irr = 500,000,000` ریال)، سیاست موجودی منفی (`allow_negative_stock = false`)، واحد نمایشی پیش‌فرض (`IRT`) و روش ارزش‌گذاری موجودی به‌صورت تنظیم‌پذیر در جدول `organization_settings` و صفحه تنظیمات مدیریت نگهداری شده‌اند تا در استقرار نهایی توسط مالک کسب‌وکار تثبیت شوند.

---

## هـ) مسیر ادامه کار برای استقرار Staging و Production

1. اتصال مخازن داده از SQLite به PostgreSQL 16 بر اساس فایل‌های مهاجرت مرحله ۳ همراه با فعال‌سازی `ENABLE/FORCE ROW LEVEL SECURITY` روی تمام جداول چندسازمانی.
2. جایگزینی `LocalDiskObjectStorage` با آداپتور S3/MinIO (با حفظ واسط `IObjectStoragePort`).
3. اتصال سرویس استخراج تصویر `CompositeOcrAdapter` به میکروسرویس Python FastAPI (PaddleOCR + تصحیح پرسپکتیو) و صف Redis/BullMQ برای اسناد حجیم.
4. پیاده‌سازی احراز هویت واقعی (OTP / Session Cookie HttpOnly + OIDC) به‌جای انتخابگر شفاف نقش آزمایشی در محیط توسعه.
