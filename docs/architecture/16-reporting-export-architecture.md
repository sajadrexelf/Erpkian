# 16 — معماری گزارش‌گیری، نسخه‌بندی و خروجی رسمی (`Reporting & Export Architecture`)

این سند چرخه تولید گزارش‌های نسخه‌پذیر (`v1 -> v2`)، موتور تولید فایل‌های رسمی (`PDF / Excel / CSV / JSON`) و اصلاحیه **بخش ۲۲** در تفکیک شاخص‌های حاشیه سود را تشریح می‌کند.

---

## ۱. معماری Snapshot و نسخه‌بندی بدون بازنویسی گذشته (`Snapshot-Bound Reporting`)

مطابق `docs/data-model/09-data-provenance-versioning.md` و `docs/processing/09-output-contracts.md`:
1. هنگام اجرای هر گزارش (مثل `FIN-AR-AGING-001` یا `RPT-MONTHLY-001`):
   - ابتدا یک رکورد در **`report_data_snapshots`** ساخته می‌شود شامل `as_of_date`, `snapshot_hash` (هش مجموع شناسه‌ها و وضعیت اسناد `Posted` لحظه اجرا), `included_document_count` و `pending_document_count`.
   - نتیجه در **`report_executions`** و **`report_versions (version_number = 1)`** با ثبت صریح `algorithm_version` (طبق دلتای `011`) قفل می‌شود.
   - تمام شاخص‌های عددی در `report_metrics` و اتصال آن‌ها به اسناد مبدأ در `report_evidences` ذخیره می‌شوند به نحوی که مجموع `contribution_amount_irr` با عدد `metric` برابر باشد.
2. **ورود سند جدید پس از تولید گزارش (`v1 -> v2`):**
   - گزارش `v1` هرگز تغییر نمی‌کند (`DQT-15`). اگر بعداً یک فاکتور جاافتاده `Posted` شود، سیستم در رابط کاربری اعلان می‌دهد «اسناد جدید ثبت شده‌اند» و کاربر با کلیک روی **بازتولید نسخه جدید (`v2`)**، رکوردی با `supersedes_report_version_id = v1.id` می‌سازد و با `RPT-DIFF-001` تفاوت دقیق `v1` و `v2` را می‌بیند.

---

## ۲. اصلاحیه ممیزی بخش ۲۲: تفکیک صریح `GrossMarginPct` و `TrueOperatingMarginPct`

**نقص شناسایی‌شده در `docs/processing/08-calculation-formulas.md` بخش ۴ (`CF-PRF-01`):**  
در متن مرحله چهارم، فرمول `GrossMarginPct` به اشتباه به صورت `TrueOperatingMargin / NetSales * 100` نوشته شده بود که نام شاخص «حاشیه سود ناخالص» را با «حاشیه سود واقعی عملیاتی (پس از اشانتیون و کرایه جبران‌نشده)» مخلوط می‌کرد.

**اصلاحیه قطعی در موتور گزارش‌گیری و فرمول‌های مرحله پنجم (`PROPOSED_FOR_OWNER_APPROVAL`):**
در تمام کدهای موتور `profitability` و خروجی `ErpkianReportEnvelope v1`، این دو شاخص کاملاً مجزا محاسبه و گزارش می‌شوند:
1. **سود ناخالص و درصد آن (`Gross Profit & Margin %`):**
   $$\text{GrossProfit} = \text{NetSales} - \text{COGS}_{\text{paid}}$$
   $$\text{GrossMarginPct} = \begin{cases} \text{ROUND}_{\text{HalfEven}}\left(\frac{\text{GrossProfit}}{\text{NetSales}} \times 100, 2\right) & \text{if } \text{NetSales} > 0 \\ \text{NULL} & \text{otherwise} \end{cases}$$
2. **سود واقعی عملیاتی و درصد آن (`True Operating Margin & %`):**
   $$\text{TrueOperatingMargin} = \text{NetSales} - (\text{COGS}_{\text{paid}} + \text{PromoFreeGoodsCost} + \text{UnrecoveredFreight})$$
   $$\text{TrueOperatingMarginPct} = \begin{cases} \text{ROUND}_{\text{HalfEven}}\left(\frac{\text{TrueOperatingMargin}}{\text{NetSales}} \times 100, 2\right) & \text{if } \text{NetSales} > 0 \\ \text{NULL} & \text{otherwise} \end{cases}$$
3. **قاعده شفافیت پوشش بها (`CostCoveragePct` — `CF-PRF-02`):**
   - `100%` ← `HIGH`
   - `80% <= x < 100%` ← `MEDIUM` (اقلام فاقد قیمت خرید در جدول جداگانه افشا می‌شوند و بهای آن‌ها صفر فرض نمی‌شود)
   - `< 80%` ← `LOW`
   - در صورت `inventory_valuation_method = 'UNSPECIFIED'` ← توقف محاسبه سود ریالی با خطای `VALUATION_POLICY_UNSET`.

---

## ۳. معماری موتور خروجی (`Export Worker Architecture`)

| فرمت خروجی | کتابخانه منتخب | ویژگی‌های کلیدی پیاده‌سازی | محل اجرا |
| :--- | :--- | :--- | :--- |
| **`PDF` (Persian RTL)** | **Playwright (Headless Chromium)** *(با الگوی قالب HTML/CSS + فونت `Vazirmatn`)* | پشتیبانی کامل از BiDi فارسی/اعداد، سرستون تکراری جدول در چاپ چندصفحه‌ای، باکس زرد هشدار، کادر شواهد و فوتر `صفحه X از Y` + `snapshot_hash` | صف ایزوله `q.export.render` در Worker اختصاصی |
| **`EXCEL` (`.xlsx`)** | **ExcelJS (Streaming Workbook)** | ۴ شیت استاندارد (`خلاصه مدیریتی`، `جزئیات محاسبات`، `شواهد و اسناد مبدأ`، `هشدارها و اسناد معلق`)، جهت RTL، عدد واقعی با فرمت `#,##0` و فرمول واقعی `SUM()` | صف `q.export.render` |
| **`CSV`** | **Node Stream Serializer (`UTF-8 BOM`)** | کاراکتر BOM (`\uFEFF`) در ابتدای فایل برای نمایش صحیح فارسی در Excel ویندوز، ستون مجزا برای تاریخ شمسی و ISO، عدد خام بدون کاما | صف `q.export.render` یا Streaming سبک |
| **`JSON`** | **ErpkianReportEnvelope v1 Serializer** | آرشیو دقیق منطبق با `docs/processing/09-output-contracts.md` شامل تمامی شواهد و متادیتا | ذخیره در S3 (`report_outputs`) |

### ایمنی و رصد رندر PDF (`Security & Worker Isolation`)
- کانتینر `Export Worker` هنگام باز کردن HTML توسط Chromium هرگونه درخواست شبکه خروجی به اینترنت یا IPهای ابری را در `page.route` مسدود می‌کند (مگر فونت و استایل محلی Bundleشده در کانتینر) تا ریسک `SSRF` صفر شود (`THR-25`).
- فایل نهایی در S3 با مسیر `<org_id>/exports/<report_version_id>/<output_id>.<ext>` ذخیره شده و کاربر با Pre-signed URL دو دقیقه‌ای و ثبت در `document_access_logs` دانلود می‌کند.
