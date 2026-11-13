# 23 — جمع‌بندی یکپارچه تصمیم‌های باز و نیازمند تأیید (`Consolidated Open Decisions`)

این سند تمام تصمیم‌های باز، فرضیات موقت و اصلاحات معماری مراحل سوم (`14-open-decisions.md`)، چهارم (`11-open-decisions.md` و ممیزی بخش ۲۲) و پنجم را در یک مرجع واحد با وضعیت رسمی گردآوری می‌کند. **هیچ مورد `PROPOSED_FOR_OWNER_APPROVAL` بدون تأیید صریح مالک محصول به `CONFIRMED` تغییر داده نشده است.**

---

## ۱. جدول جامع تمام تصمیم‌ها (`Consolidated Decision Register`)

| کد | منشأ | موضوع تصمیم / یافته | تصمیم پیشنهادی / تثبیت‌شده | وضعیت رسمی |
| :--- | :---: | :--- | :--- | :---: |
| **`GAP-01` / `OD-02`** | مرحله ۳ و ۴ | مدل هسته مالی `Sub-ledger First` و جداول `accounting_entries` | عملیات v1 کاملاً `Sub-ledger First`؛ جداول دفترکل به عنوان قلاب توسعه آتی حفظ و اجرای عملیاتی آن‌ها به فاز ۲ موکول شود | `CONFIRMED` *(برای v1 Sub-ledger)* / `DEFERRED_TO_FUTURE_PHASE` *(اجرای GL)* |
| **`GAP-02`** | مرحله ۳ | ۴ نقش PRD vs مدل `9 Roles × Business Profile` | پشتیبانی همزمان از هر ۹ نقش با مدل RBAC داده‌محور (`roles` + `permissions`) | `CONFIRMED` |
| **`GAP-03`** | مرحله ۳ | استاندارد پولی `IRR` vs `IRT` | ذخیره کاننیکال با ریال صحیح (`*_irr`, `NUMERIC(18,0)`) + ثبت ارز مبدأ و نرخ تبدیل | `CONFIRMED` |
| **`OD-01` / `ADR-05`** | مرحله ۳، ۴، ۵ | انتخاب ORM پروژه هدف | **Drizzle ORM + SQL-first Migrations** (به جای Prisma) برای Composite FK و RLS | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`OD-03`** | مرحله ۳ و ۴ | مدیریت اشانتیون (`Bonus / Free Goods`) | افزودن `is_promotional_free_item` و `promo_reason` روی `invoice_lines` در Migration 011 | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`OD-04`** | مرحله ۳ و ۴ | مدیریت تخفیف پلکانی و درصدی | افزودن `discount_pct` و `discount_rule_tier` در `invoice_lines` در Migration 011 | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`OD-05`** | مرحله ۴ | جفت‌سازی اتمیک انتقال بین انبارها | افزودن `transfer_group_id UUID` در `inventory_movements` در Migration 011 | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`OD-06`** | مرحله ۳ و ۴ | سیاست موجودی منفی (`allow_negative_stock`) | پیش‌فرض `false`؛ قابل تغییر توسط `OWNER/CFO` با هشدار اجباری در کاردکس و سود | `CONFIRMED` |
| **`OD-07`** | مرحله ۴ | روش ارزش‌گذاری موجودی (`FIFO` vs `Weighted Avg`) | پشتیبانی از هر دو در v1 با پیش‌فرض `UNSPECIFIED` تا انتخاب `CFO` | `CONFIRMED` |
| **`OD-08`** | مرحله ۴ | سودآوری هنگام ناقص بودن قیمت خرید | محاسبه برای اقلام دارای بها + نمایش `CostCoveragePct` + افشای اقلام فاقد بها | `CONFIRMED` |
| **`OD-09`** | مرحله ۳ و ۴ | تغییرناپذیری اسناد `Posted` | منع `UPDATE/DELETE` روی `Posted`؛ اصلاح فقط با سند معکوس (`Reversed`) یا Adjustment | `CONFIRMED` |
| **`OD-10`** | مرحله ۳ و ۴ | یکتاسازی طرف‌حساب و کالا | لایه دوگانه: کلید قطعی `external_entity_mappings` + تایید انسانی روی `entity_match_candidates` | `CONFIRMED` |
| **`OD-11`** | مرحله ۴ و ۵ | همگام‌سازی یک‌طرفه یا دوطرفه با هلو/سپیدار | **اکیداً یک‌طرفه (`read_only = true`)** در نسخه اول (`v1`) | `CONFIRMED` |
| **`OD-12`** | مرحله ۴ و ۵ | آستانه‌های OCR و دروازه `Posted` | `ocr_min_quality_score = 0.65`, `ocr_auto_review_confidence = 0.85`, هرگز `Posted` خودکار، Dual Approval بالای سقف | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`PROVISIONAL-04/05`** | مرحله ۳ | نگهداری ۱۰ ساله اسناد و ردیابی بچ/انقضا | نگهداری ۱۰ ساله `Posted`؛ جدول جزئیات بچ/سری‌ساخت (`inventory_batches`) در فاز `P2` | `DEFERRED_TO_FUTURE_PHASE` *(برای بچ P2)* |
| **`TAX-LOCK`** | مرحله ۴ و ۵ | ارسال مستقیم به سامانه مودیان و اظهارنامه (`TAX-SUB-*`) | قفل سخت و غیرفعال در v1 (`403 FEATURE_LOCKED_IN_V1`) | `CONFIRMED` *(قفل در v1)* / `DEFERRED_TO_FUTURE_PHASE` *(اجرای اتصال)* |
| **`AUDIT-S4-01`** | بخش ۲۲ / مرحله ۵ | اصلاح شناسه تکراری `CF-INV-01` | جداسازی به **`CF-DOC-INV-01`** (فاکتور) و **`CF-STK-01`** (موجودی لحظه‌ای) | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`AUDIT-S4-02`** | بخش ۲۲ / مرحله ۵ | تفکیک `GrossMarginPct` و `TrueOperatingMarginPct` | محاسبه مستقل هر دو شاخص در `CF-PRF-01` و خروجی گزارش (`16-reporting-export-architecture.md`) | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`AUDIT-S4-03`** | بخش ۲۲ / مرحله ۵ | ترتیب محاسبه تخفیف پای فاکتور و نرخ مالیات پویا | سرشکن `PRE_TAX_PRORATA` (با امکان `POST_TAX_DISCOUNT` برای اسناد قدیمی) + جدول نرخ مالیات تاریخ‌دار به جای عدد ثابت ۱۰٪ | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`AUDIT-S4-04`** | بخش ۲۲ / مرحله ۵ | اصلاح `Draft Migration 011` روی `service_definitions` | حذف `DEFAULT 'A'` گمراه‌کننده و جایگزینی با `Expand -> Explicit Backfill per service_code ('A'..'I') -> Validate` | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`AUDIT-S4-05`** | بخش ۲۲ / مرحله ۵ | تفکیک Envelope عمومی REST از `ErpkianReportEnvelope` | تعریف `ApiResponseEnvelope<T>` برای REST و قرارگیری `ErpkianReportEnvelope v1` داخل `data` یا فایل Export | `CONFIRMED` *(تثبیت قراردادی)* |
| **`S5-OUTBOX`** | مرحله ۵ | افزودن جدول زیرساختی `transactional_outbox` | استفاده از الگوی Outbox در کنار ۱۰۹ جدول برای جلوگیری از گم‌شدن Job بین PostgreSQL و Redis | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`S5-MONOREPO`** | مرحله ۵ | ساختار مخزن هدف و موتورهای Export / AI Gateway | ساختار `pnpm + Turborepo` (`20`)، `ProviderAgnosticAiGateway` (`ADR-10`)، `Playwright PDF` (`ADR-11`)، `ExcelJS` (`ADR-12`) | `PROPOSED_FOR_OWNER_APPROVAL` |
| **`BLOCKED-ERP`** | مرحله ۳، ۴، ۵ | دریافت فایل‌های نمونه واقعی هلو، سپیدار و راهکاران | پارسرهای قطعی هلو/سپیدار نیازمند ۵ تا ۱۰ فایل واقعی غیرحساس از مشتری برای نهایی‌سازی ستون‌ها هستند | **`BLOCKED`** *(تا دریافت نمونه)* |
| **`S5-PERF-SLO`** | مرحله ۵ | اهداف کارایی ۸ عملیات سند `18` | اعداد اعلام‌شده به صورت `PROPOSED TARGET` ثبت شده‌اند تا در `M13` با `k6` سنجیده شوند | `PROPOSED_FOR_OWNER_APPROVAL` |

---

## ۲. چک‌لیست تصمیم‌های فوری مالک محصول پیش از شروع کدنویسی (`M01`)
برای آغاز پیاده‌سازی بدون توقف، مالک محصول صرفاً باید موارد زیر را امضا کند:
1. تایید رسمی پشته Drizzle ORM (`OD-01`)، ساختار Monorepo (`S5-MONOREPO`) و جدول زیرساختی `transactional_outbox` (`S5-OUTBOX`).
2. تایید تغییرات ستون‌های تکمیلی Migration `011` (`OD-03, 04, 05, 12`) و اصلاح الگوی Backfill آن (`AUDIT-S4-04`).
3. تایید ترتیب پیش‌فرض محاسبه تخفیف پای فاکتور پیش از مالیات (`AUDIT-S4-03`) و تفکیک دو شاخص حاشیه سود (`AUDIT-S4-02`).
4. تحویل ۵ تا ۱۰ فایل نمونه واقعی خروجی هلو و سپیدار برای رفع حالت `BLOCKED` در مایلستون `M12`.
