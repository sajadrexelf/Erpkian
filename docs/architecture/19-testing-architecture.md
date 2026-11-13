# 19 — معماری آزمون و مجموعه تست‌های طلایی مالی (`Testing Architecture & Golden Tests`)

این سند هرم کامل **۱۳ نوع تست مهندسی**، پیوند به **۸۱ آزمون پذیرش P0 مرحله چهارم** (`docs/processing/10-acceptance-criteria.md`) و **مجموعه Golden Test Cases** برای تمام فرمول‌های قطعی را تعریف می‌کند.

---

## ۱. ماتریس ۱۳ لایه آزمون در معماری هدف

| # | نوع آزمون | ابزار پیشنهادی | دامنه پوشش و استاندارد پاس شدن | اجرا در CI |
| :-: | :--- | :--- | :--- | :---: |
| **1** | **Pure Unit Tests (Domain & Math)** | `Vitest / Node Test` | موتور `Decimal/BigInt`, `Half-to-Even`, `JalaliCalendar`, تمام `VR-*` و `CF-*` | هر PR |
| **2** | **Golden Financial Formula Tests** | `Vitest` (Data-Driven JSON Fixtures) | تطابق ریال‌به‌ریال خروجی با `GTC-01`..`GTC-12` (صفر خطای گردکردن مجاز) | هر PR |
| **3** | **Property-Based / Precision Fuzz Tests** | `fast-check` | عدم ایجاد خطای Float و حفظ معادله تراز در هزاران ترکیب تصادفی قیمت، تعداد و تخفیف | شبانه / PR |
| **4** | **DB Schema, Migration & Composite FK Tests** | `Testcontainers (Postgres 16)` | اجرای `001`..`010` + اصلاحیه `011`، تست `DQT-01`..`DQT-16` و Rollback در Dev | هر PR |
| **5** | **Fail-Closed RLS & Security Negative Tests** | `Testcontainers + Supertest` | تست‌های `NST-01`..`NST-08` (تست بدون Tenant، تزریق UUID دیگر، نقش انباردار، Self-Approval) | هر PR (مسدودکننده) |
| **6** | **Idempotency & Concurrency Race Tests** | `Promise.all` parallel HTTP calls | ارسال ۱۰ درخواست همزمان `Post`/`Payment` با یک و چند کلید (`DQT-10`, `DQT-16`) | هر PR |
| **7** | **Workflow & Dual Approval Integration Tests** | `NestJS TestingModule` | شبیه‌سازی کامل ۱۰ گردشکار (`WF-*`) شامل توقف، Checkpoint و ازسرگیری | هر PR |
| **8** | **OCR Pipeline & Quality Gate Tests** | `pytest + Test Images (Synthetic)` | تست تصاویر تار (`< 0.65`)، چرخیده، ارقام فارسی، اشانتیون قیمت صفر و BBox | PR سرویس OCR |
| **9** | **AI Guardrail & Prompt Injection Tests** | `Mocked LLM Adapter + Evaluator` | تزریق دستور در OCR، درخواست غیرمجاز RBAC و تست `NumericGroundingValidator` | هر PR |
| **10** | **Integration Parser & Anti-Duplication Tests** | `Vitest` + فایل‌های نمونه | تست `row_hash`، دو فاکتور مشابه در یک روز (`DQT-09`) و `entity_match_candidates` | PR ماژول Sync |
| **11** | **Export Contract & Format Tests** | `pdf-parse` + `ExcelJS Reader` | بررسی وجود متن RTL، `snapshot_hash`، فرمول `SUM` در اکسل ۴ شیتی و `UTF-8 BOM` در CSV | هر PR |
| **12** | **End-to-End Browser & Conversational UI Tests** | `Playwright` | اجرای ۳۰ سناریوی `Synthetic` (`06-scenario-library.md`) روی ۱۶ صفحه وب و کشوی شواهد | پیش از Release |
| **13** | **Load, Soak & Failure-Mode Chaos Tests** | `k6` + Toxiproxy | راستی‌آزمایی اهداف ۸گانه سند `18` و تست Degradation هنگام قطع Redis/LLM/OCR | پیش از Release / هفتگی |

---

## ۲. تست‌های طلایی قطعی فرمول‌های مالی (`Golden Test Cases — GTC-01 .. GTC-12`)

این تست‌ها مستقیماً اصلاحات ممیزی **بخش ۲۲** (جداسازی `CF-DOC-INV-01` از `CF-STK-01`، تفکیک `GrossMarginPct` از `TrueOperatingMarginPct` و ترتیب قطعی تخفیف/مالیات) را پوشش می‌دهند:

| شناسه | فرمول مرجع | ورودی دقیق (`Synthetic`) | خروجی قطعی مورد انتظار (Expected Exact Output) |
| :--- | :--- | :--- | :--- |
| **`GTC-01`** | **`CF-DOC-INV-01`** *(اصلاحی از `CF-INV-01`)* | سطر ۱: `10` کارتن × `1,200,000` ریال، تخفیف خطی `5%`، نرخ مالیات `10%`؛ سطر ۲ (اشانتیون): `1` کارتن، `is_promotional_free_item=true`, `unit_price=0`؛ تعدیل حمل `FREIGHT = +300,000` | `LineGross_1 = 12,000,000`, `LineDiscount_1 = 600,000`, `TaxableBase_1 = 11,400,000`, `LineTax_1 = 1,140,000`, `LineNet_1 = 12,540,000`; `LineNet_2 = 0`; `NetTotal = 12,540,000 IRR`; بدهی موثر با حمل = `12,840,000 IRR` |
| **`GTC-02`** | **`CF-DOC-INV-01`** *(تخفیف پای فاکتور `PRE_TAX_PRORATA` + دقت اعشار)* | سطر ۱: `qty=3`, `unit_price=333,333.3333` (`LineGross=1,000,000`), تخفیف پای فاکتور کل `100,000` (`PRE_TAX_PRORATA`), مالیات `10%` | `TaxableBase = 900,000 IRR`, `LineTax = 90,000 IRR`, `NetTotal = 990,000 IRR` (بدون هیچ اعشار شناور `.99999`) |
| **`GTC-03`** | **`CF-DOC-INV-01`** *(گرد بانکی `Half-to-Even`)* | `qty=1`, `unit_price=105`, مالیات `10%` (`10.5`) در مقابل `unit_price=115` (`11.5`) | برای `10.5` گرد به زوج ← **`10`** (`LineNet=115`)؛ برای `11.5` گرد به زوج ← **`12`** (`LineNet=127`) |
| **`GTC-04`** | **`CF-STK-01`** *(اصلاحی از `CF-INV-01` بخش ۳)* | کالا `1 Carton = 24 Pcs`؛ Snapshot در `t0`: `48 Pcs`؛ خرید `+2 Carton (+48 Pcs)`؛ فروش `-10 Pcs`؛ انتقال خروج `-14 Pcs` | `StockQty = 48 + 48 - 10 - 14 = 72 Pcs` (`3 Carton`) |
| **`GTC-05`** | **`CF-AR-01` & `CF-AR-02`** *(سنی + چک در جریان)* | `as_of=1405/08/25`: فاکتور ۱ (`due=1405/07/10`, `80M`, نقدی `30M`); فاکتور ۲ (`due=1405/08/20`, `40M`, چک صیادی `IN_HAND 40M`) | فاکتور ۱: `Open=50M` (`BUCKET_31_60`, ۴۵ روز تاخیر)؛ فاکتور ۲: `Open=40M` (`BUCKET_1_30`, ۵ روز تاخیر) + `PendingChequesTotal=40M`؛ بدهی بدون پوشش چک = `50M IRR` |
| **`GTC-06`** | **`CF-AR-03`** *(تخصیص خودکار `FIFO`)* | مشتری با فاکتور باز #1 (`40M`, قدیمی‌تر) و #2 (`50M`)؛ دریافت `100M` با `FIFO_AUTO` | تخصیص #1 = `40M` (تسویه)، تخصیص #2 = `50M` (تسویه)، `UnallocatedCredit = 10M IRR` |
| **`GTC-07`** | **`CF-COST-01`** *(`WEIGHTED_AVERAGE` + اشانتیون)* | اول دوره: `100 @ 50,000`; خرید `100 @ 60,000`; فروش `80` + اشانتیون `20` (کل خروج `100`) | `AvgUnitCost = 55,000 IRR`; `COGS_paid = 80 * 55,000 = 4,400,000`; `PromoFreeGoodsCost = 20 * 55,000 = 1,100,000`; موجودی مانده = `100` عدد به ارزش `5,500,000 IRR` |
| **`GTC-08`** | **`CF-COST-02`** *(`FIFO` چندلایه)* | لایه ۱: `50 @ 40,000`؛ لایه ۲: `100 @ 60,000`؛ فروش `80` عدد | مصرف `50` از لایه ۱ (`2,000,000`) + `30` از لایه ۲ (`1,800,000`) ← `COGS = 3,800,000 IRR`؛ مانده: `70 @ 60,000 = 4,200,000 IRR` |
| **`GTC-09`** | **`CF-PRF-01`** *(تفکیک اصلاحی `GrossMarginPct` vs `TrueOperatingMarginPct`)* | `NetSales = 20,000,000`, `COGS_paid = 12,000,000`, `PromoFreeGoodsCost = 1,500,000`, `UnrecoveredFreight = 500,000` | `GrossProfit = 8,000,000` ← **`GrossMarginPct = 40.00%`**؛ `TrueOperatingMargin = 6,000,000` ← **`TrueOperatingMarginPct = 30.00%`** *(جدا از هم، هرگز مخلوط نمی‌شوند)* |
| **`GTC-10`** | **`CF-PRF-02`** *(پوشش ناقص بها و حالت `UNSPECIFIED`)* | فروش خالص کل `100M` که `85M` دارای قیمت خرید و `15M` فاقد قیمت خرید است | `CostCoveragePct = 85.00%`, `confidence_level = MEDIUM` و افشای اقلام `15M`؛ در صورت `UNSPECIFIED` ← خطای `VALUATION_POLICY_UNSET` |
| **`GTC-11`** | **`CF-TRS-01` & `CF-TAX`** *(تطبیق بانک و پیش‌نویس VAT)* | تراکنش بانک `10,000,000`, کارمزد تلرانس مجاز, تاریخ +۱ روز؛ مالیات فروش `15M`, خرید معتبر `9M` | بانک: امتیاز در بازه `[0.7000, 0.9999]` ← `PROBABILISTIC_SUGGESTED`؛ VAT: `NetVATDraft = 6,000,000 IRR` با برچسب `NON_OFFICIAL_DRAFT` |
| **`GTC-12`** | **`VR-DATE` & `VR-CURR`** *(کبیسه شمسی و تبدیل تومان)* | تاریخ `1403/12/30` vs `1404/12/30`؛ مبلغ `150,000 IRT` با نرخ `10` | پذیرش `1403/12/30` (`2025-03-20`)، رد `1404/12/30`؛ ذخیره قطعی `1,500,000 IRR` |
