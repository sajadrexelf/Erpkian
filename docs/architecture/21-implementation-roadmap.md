# 21 — نقشه راه اجرایی پیاده‌سازی (`Implementation Roadmap — 14 Milestones`)

این سند نقشه اجرایی مرحله‌بندی‌شده ساخت پلتفرم **Erpkian** را در **۱۴ مایلستون (`M01` تا `M14`)** پس از تأیید تصمیم‌های باز توسط مالک محصول تعریف می‌کند و مرز دقیق **MVP (`P0` + `P1`)** را از فازهای آتی (`P2/P3`) جدا می‌سازد.

---

## ۱. جدول ۱۴ مایلستون اجرایی (`M01` تا `M14`)

| مایلستون | عنوان Epic / Milestone | محدوده فنی و تحویل‌دادنی‌های کلیدی | فاز | وابستگی | گیت خروج (`Exit Gate`) |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **`M01`** | **Monorepo, Infra & CI Foundation** | راه‌اندازی Monorepo (`pnpm + Turbo`)، `docker-compose` (PG16 + PgBouncer + Redis + MinIO)، Vault/Env و ESLint Boundary Rules | `MVP P0` | تأیید `OD-01` و سند `20` | بیلد سبز CI + اجرای خالی Testcontainers |
| **`M02`** | **PostgreSQL Schema & RLS Core** | پیاده‌سازی SQL Migrations `001`..`010` + اصلاحیه `011` (`Expand->Backfill->Validate`)، `TenantTransactionRunner` و `transactional_outbox` | `MVP P0` | `M01` | پاس ۱۰۰٪ `DQT-01..16` و تست‌های `NST-01..04` |
| **`M03`** | **Auth, Multi-Org, RBAC & Fiscal Kernel** | احراز هویت JWT/Refresh، دعوت‌نامه، ۹ نقش و مجوزهای اتمیک، `branch_scope_id`، تقویم شمسی کبیسه، ارز `IRR/IRT` و قفل دوره | `MVP P0` | `M02` | پاس `NST-05, 07, 08` + `GTC-12` + `VR-DATE/CURR` |
| **`M04`** | **Deterministic Math Engine & Master Data** | پکیج `decimal-math` (`Half-to-Even`, `CF-DOC-INV-01`, `CF-STK-01`)، مدیریت `contacts`، `products`، چندواحدی UoM و جستجوی `pg_trgm` | `MVP P0` | `M02`, `M03` | پاس ۱۰۰٪ `GTC-01..04` + Fuzz Tests |
| **`M05`** | **Document Ingestion & MinIO Storage** | ماژول `documents`، محاسبه SHA-256 ضدتکرار، نسخه اصلی تغییرناپذیر، ادغام چند عکس/PDF و Pre-signed URL دو دقیقه‌ای | `MVP P0` | `M03` | تست آپلود/حجم/MIME جعلی (`THR-12..14`) + `DQT-09` |
| **`M06`** | **Python FastAPI OCR & Split-Screen Review** | کانتینر FastAPI (`OpenCV + PaddleOCR`)، گیت کیفیت `0.65`، آستانه `0.85`، `VR-MATH` خودکار، `entity_match_candidates` و کارتابل اصلاح `Verified` | `MVP P0` | `M04`, `M05` | تست روی مجموعه اسناد فارسی + عدم `Posted` خودکار |
| **`M07`** | **Invoices, Posting Gate & Dual Approval** | چرخه فاکتورهای فروش/خرید/برگشتی، اشانتیون (`OD-03`)، تخفیف ردیفی/پای‌فاکتور (`OD-04`)، `PostingTransactionCoordinator` و `approval_requests` | `MVP P0` | `M04`, `M06` | پاس ۲۷ تست P0 فاکتور + `DQT-13, 14, 16` |
| **`M08`** | **Inventory Movements, Costing & AR/AP Allocations** | دفتر کل حرکات انبار، انتقال بین انبار (`transfer_group_id`)، دریافت/پرداخت، `payment_allocations (FIFO/Explicit)` و گزارش سنی `FIN-AR-AGING-001` | `MVP P0` | `M07` | پاس `GTC-05..08` + تست عدم منفی شدن غیرمجاز |
| **`M09`** | **Treasury, Sayad Checks & Bank Reconciliation** | حساب‌های بانکی، ایمپورت صورتحساب Excel/CSV/PDF، چرخه چک صیادی و موتور تطبیق `TRS-BANK-REC-001` | `MVP P0/P1` | `M08` | پاس `GTC-11` + تست چک برگشتی و تطبیق احتمالی |
| **`M10`** | **Profitability, Versioned Reporting & Exports** | موتور COGS (`FIFO` و `Weighted Avg`)، تفکیک `GrossMarginPct` و `TrueOperatingMarginPct`، Snapshot `v1->v2`، خروجی PDF RTL / Excel 4-Sheet / CSV | `MVP P0/P1` | `M08`, `M09` | پاس `GTC-09, 10` + `DQT-15` + تست SSRF PDF |
| **`M11`** | **Next.js Workspace, 16 Pages & AI Orchestration** | پیاده‌سازی ۱۶ صفحه RTL، ۱۷ جزء مکالمه‌ای، `ProviderAgnosticAiGateway`، `PromptInjectionFirewall` و `NumericGroundingValidator` | `MVP P0/P1` | `M07..M10` | تست ۳۰ سناریو (`Playwright`) + `NST-06` + کارکرد بدون AI |
| **`M12`** | **ERP Imports, .NET Windows Agent & Tax Prep/Val** | ویزارد ایمپورت هلو/سپیدار *(مشروط به دریافت نمونه)*، سرویس ویندوز `.NET 8` (Read-Only)، پیش‌نویس VAT و اعتبارسنجی ۱۶۹ (`TAX-SUB-*` قفل) | `MVP P1` | `M08`, `M09` | تست Kill-Switch Agent (`NST-07`) + تست قفل `403` مودیان |
| **`M13`** | **Hardening, Load Testing, Audit & Beta Pilot** | تست بار `k6` برای ۸ عملیات هدف سند `18`، تست بازیابی WAL-G، ممیزی امنیتی و پایلوت با ۲-۳ شرکت پخش واقعی | `Pre-GA` | `M01..M12` | تحقق اهداف Latency + صفر نقص بحرانی امنیتی |
| **`M14`** | **Future Phases (`P2 / P3`)** | دفترکل دوطرفه (`accounting_entries`)، بچ/انقضای کالا (`P2`)، اتصال دوطرفه ERP تاییدشده، اتصال مستقیم مودیان (`TAX-SUB-*`) و Open Banking | `Post-MVP` | `M13` + مجوز رسمی | مستندسازی و امضای حقوقی/مالی فاز ۲ |

---

## ۲. مسیرهای موازی برای تسریع تیم توسعه (`Parallel Execution Tracks`)
- پس از تکمیل **`M02`** و **`M03`**:
  - **تیم Backend Core:** اجرای متوالی `M04 -> M07 -> M08 -> M09 -> M10`.
  - **تیم Python / AI / OCR:** همزمان روی `M05 / M06` و اسکلت `ProviderAgnosticAiGateway`.
  - **تیم Frontend:** همزمان روی `Design System RTL + 16 Pages Shell + Declarative Widget Registry` با Mock قراردادهای `shared-contracts`.
  - **تیم .NET / Integration:** همزمان پس از دریافت فایل‌های نمونه مشتری روی `M12`.
