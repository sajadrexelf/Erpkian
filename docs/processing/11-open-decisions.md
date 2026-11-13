# 11 — جمع‌بندی و تعیین تکلیف تصمیم‌های باز (`Open Decisions Resolution`)

این سند تمام **۱۲ موضوع باز** مطرح‌شده در بخش ۷ دستورالعمل مرحله چهارم و ۵ سؤال باز مرحله سوم (`docs/data-model/14-open-decisions.md`) را با بررسی گزینه‌ها، ریسک‌ها و **تصمیم نهایی پیشنهادی** مستند می‌کند.

---

## جدول خلاصه وضعیت ۱۲ تصمیم

| کد | موضوع تصمیم | تصمیم پیشنهادی نهایی | وضعیت تایید مالک محصول | اثر بر مدل داده (`Migration 011`) |
| :---: | :--- | :--- | :---: | :--- |
| **OD-01** | انتخاب ORM در پروژه هدف | **Drizzle ORM + SQL-first Migrations** | `PROPOSED_FOR_PO_SIGN_OFF` | بدون تغییر Schema |
| **OD-02** | زمان ایجاد جداول دفترکل (`accounting_entries`) | نگهداری در Schema اما ایجاد در Migration جداگانه فاز ۲ (عدم استفاده عملیاتی در MVP) | `CONFIRMED_BASELINE` (همسو با `Sub-ledger First`) | تایید فازبندی Migration 006/011 |
| **OD-03** | مدیریت اشانتیون / کالای جایزه (`Bonus / Free Goods`) | افزودن `is_promotional_free_item BOOLEAN` + `promo_reason` روی `invoice_lines` | `PROPOSED_FOR_PO_SIGN_OFF` | **Delta 011:** افزودن ۲ ستون |
| **OD-04** | مدیریت تخفیف پلکانی، ردیفی و کل فاکتور | نگهداری مبلغ روی سطر و هدر + افزودن `discount_pct` اختیاری روی `invoice_lines` و `discount_rule_tier` در metadata | `PROPOSED_FOR_PO_SIGN_OFF` | **Delta 011:** افزودن ستون‌های تخفیف |
| **OD-05** | انتقال بین چند انبار (`Multi-Warehouse Transfers`) | استفاده از `TRANSFER_OUT`/`TRANSFER_IN` در `inventory_movements` + افزودن `transfer_group_id UUID` برای جفت‌سازی قطعی | `PROPOSED_FOR_PO_SIGN_OFF` | **Delta 011:** افزودن `transfer_group_id` |
| **OD-06** | سیاست موجودی منفی (`allow_negative_stock`) | پیش‌فرض `false` (مسدودسازی سخت)؛ با مجوز `Admin/CFO` قابل تنظیم به `true` همراه با هشدار اجباری | `CONFIRMED_BASELINE` | موجود در `organization_settings` |
| **OD-07** | روش ارزش‌گذاری موجودی (`FIFO` vs `Weighted Avg`) | پشتیبانی کامل از هر دو در موتور قطعی، با `UNSPECIFIED` پیش‌فرض (توقف سود ریالی تا انتخاب صریح `CFO`) | `CONFIRMED_BASELINE` | موجود در `accounting_policies` |
| **OD-08** | محاسبه سود کالا هنگام ناقص بودن قیمت خرید | محاسبه سود **فقط برای اقلام دارای بهای خرید معتبر** + محاسبه `cost_coverage_pct` و افشای اقلام مستثنی | `CONFIRMED_BASELINE` | ثبت در `report_metrics` / `processing_warnings` |
| **OD-09** | اسناد مالی اصلاحی و ابطال پس از `Posted` | ممنوعیت ویرایش/حذف `Posted`؛ الزام صدور سند معکوس (`Reversed`) یا `invoice_adjustments` / `financial_adjustments` | `CONFIRMED_BASELINE` | موجود در Schema مرحله ۳ |
| **OD-10** | تطبیق شناسه مشتری و کالا بین هلو، سپیدار و Erpkian | نگاشت قطعی در `external_entity_mappings` + تطبیق احتمالی پیش از تایید در `entity_match_candidates` | `CONFIRMED_BASELINE` | موجود در Schema مرحله ۳ |
| **OD-11** | همگام‌سازی یک‌طرفه یا دوطرفه با ERP مبدأ | در نسخه اول (`v1`) **اکیداً یک‌طرفه (`read_only = true`)**؛ هرگونه Write-back به فاز ۲/۳ موکول می‌شود | `CONFIRMED_BASELINE` | موجود در `integration_connections` |
| **OD-12** | آستانه تایید انسانی و گیت اطمینان OCR | عدم انتقال خودکار به `Posted` از OCR؛ آستانه `0.85` برای پیش‌نهاد بررسی + خطای ریاضی اجباری `Needs Review` + سقف مبلغ `approval_requests` | `PROPOSED_FOR_PO_SIGN_OFF` | **Delta 011:** جزئیات در `organization_settings` |

---

## بررسی تفصیلی هر تصمیم (`OD-01` تا `OD-12`)

### `OD-01`: انتخاب ORM برای Backend هدف (`NestJS + PostgreSQL`)
- **گزینه‌ها:** (الف) `Prisma ORM`؛ (ب) `Drizzle ORM + SQL-first Migrations`؛ (ج) `TypeORM`.
- **مزایا و معایب:** Prisma رابط کاربری راحتی دارد اما در مدیریت `Composite Foreign Keys (organization_id, id)`، `FORCE ROW LEVEL SECURITY`، تراکنش‌های `SET LOCAL` برای connection pooling، شاخص‌های `pg_trgm` و محدودیت‌های `CHECK` نیاز به دور زدن‌های زیاد دارد. Drizzle سبک، Type-safe و کاملاً نزدیک به SQL خالص PostgreSQL است و اجازه می‌دهد Migrationها SQL-first باشند.
- **ریسک:** اگر تیم توسعه صرفاً به Prisma عادت داشته باشد، منحنی یادگیری کوتاه Drizzle وجود دارد.
- **توصیه تخصصی و تصمیم پیشنهادی:** انتخاب قطعی **Drizzle ORM + SQL-first Migrations** (همسو با `docs/data-model/11-orm-evaluation.md`).
- **وضعیت:** `PROPOSED_FOR_PO_SIGN_OFF`

### `OD-02`: زمان ایجاد جداول حسابداری دوطرفه (`accounting_entries`, `accounting_entry_lines`)
- **گزینه‌ها:** (الف) ایجاد و پر کردن اجباری در MVP؛ (ب) نگه‌داشتن ساختار تعریف‌شده در Schema به صورت `PROVISIONAL` و تعویق اجرا به فاز ۲ (یا Migration اختیاری بعد از MVP).
- **مزایا و معایب:** پیاده‌سازی موتور کامل دفترکل و تراز آزمایشی در MVP سرعت عرضه را کند می‌کند و با تصمیم تثبیت‌شده `Sub-ledger First` در تضاد است. از سوی دیگر حذف کامل آن از طراحی ریسک بازطراحی آینده را بالا می‌برد.
- **تصمیم پیشنهادی:** معماری `Sub-ledger First` در کل v1 حاکم است؛ جداول `accounting_entries` و `accounting_entry_lines` در مستندات به عنوان **قلاب توسعه آتی (`PROVISIONAL`)** حفظ می‌شوند اما در Migration فاز اول صرفاً به عنوان جداول خالی/متاخر علامت‌گذاری و هیچ سرویسی در P0 به آن‌ها وابسته نمی‌شود.
- **وضعیت:** `CONFIRMED_BASELINE`

### `OD-03`: مدیریت اشانتیون / کالای جایزه (`Bonus / Free Goods`)
- **گزینه‌ها:** (الف) اکتفا به `unit_price_irr = 0` در `invoice_lines`؛ (ب) افزودن ستون `is_promotional_free_item BOOLEAN DEFAULT false` و `promo_reason VARCHAR(100)` به `invoice_lines`.
- **مزایا و معایب:** در شرکت‌های پخش ایران، اشانتیون بسیار رایج است. اگر فقط `unit_price_irr = 0` باشد، موتور کنترل OCR نمی‌تواند تشخیص دهد که ردیف صفر ریالی «اشانتیون واقعی» است یا «قیمت را OCR نخوانده است»! همچنین در گزارش سود ناخالص، بهای تمام‌شده اشانتیون باید از کالای عادی تفکیک شود.
- **تصمیم پیشنهادی:** افزودن **`is_promotional_free_item`** و **`promo_reason`** روی `invoice_lines` در Migration `011`. در OCR اگر قیمت صفر باشد و پرچم اشانتیون تایید نشده باشد، سند به `Needs Review` می‌رود (`VR-MATH-03`).
- **وضعیت:** `PROPOSED_FOR_PO_SIGN_OFF`

### `OD-04`: مدیریت تخفیف پلکانی، ردیفی و تخفیف پای فاکتور
- **گزینه‌ها:** (الف) نگهداری فقط مبلغ نهایی تخفیف در `discount_amount_irr` و `invoice_discount_irr`؛ (ب) افزودن ستون `discount_pct NUMERIC(5,2)` و `discount_rule_tier VARCHAR(40)` روی `invoice_lines`.
- **مزایا و معایب:** نگهداری مبلغ ریالی برای حسابداری قطعی کافی است، اما در پخش و عمده‌فروشی برای ممیزی OCR (که درصد تخفیف روی کاغذ نوشته شده مثل «۵٪ + ۲٪») و گزارش سیاست‌های فروش، دانستن درصد و سطح تخفیف ضروری است.
- **تصمیم پیشنهادی:** محاسبات مالی همچنان با `discount_amount_irr` و `invoice_discount_irr` قطعی ریالی انجام شود و ستون `discount_pct` و `discount_rule_tier` در Migration `011` برای شفافیت ممیزی اضافه شوند.
- **وضعیت:** `PROPOSED_FOR_PO_SIGN_OFF`

### `OD-05`: انتقال بین چند انبار (`Multi-Warehouse Transfers`)
- **گزینه‌ها:** (الف) دو حرکت جداگانه `TRANSFER_OUT` و `TRANSFER_IN` فقط با `source_record_id`؛ (ب) افزودن `transfer_group_id UUID` برای جفت‌سازی اتمیک مبدأ و مقصد.
- **مزایا و معایب:** در شرکت‌های پخش، انتقال کالا از «انبار مرکزی» به «انبار خودرو پخش» یا «شعبه دیگر» روزانه رخ می‌دهد. بدون شناسه جفت یکتا، کنترل اینکه خروج انبار مبدأ دقیقاً به مقصد رسیده یا خیر دشوار می‌شود.
- **تصمیم پیشنهادی:** در هر انتقال دو رکورد `TRANSFER_OUT` (منفی) و `TRANSFER_IN` (مثبت) در یک تراکنش دیتابیس با **`transfer_group_id`** مشترک (پیشنهاد Migration `011`) ثبت شوند و نرخ بهای تمام‌شده بدون تغییر از انبار مبدأ به مقصد منتقل شود.
- **وضعیت:** `PROPOSED_FOR_PO_SIGN_OFF`

### `OD-06`: سیاست موجودی منفی (`Negative Stock Policy`)
- **گزینه‌ها:** (الف) ممنوعیت مطلق؛ (ب) آزادی کامل؛ (ج) کنترل‌شده با تنظیم سازمان (`allow_negative_stock`, پیش‌فرض `false`).
- **مزایا و معایب:** در عمل بسیاری از شرکت‌های پخش ابتدا فاکتور فروش را ثبت می‌کنند و فاکتور خرید تامین‌کننده ۲ روز بعد وارد سیستم می‌شود. مسدودسازی مطلق بدون امکان تنظیم، کار شرکت پخش را قفل می‌کند؛ آزادی مطلق هم خطای موجودی و COGS غلط ایجاد می‌کند.
- **تصمیم پیشنهادی:** پیش‌فرض `false` (جلوگیری از فروش بدون موجودی). سازمان با تایید مدیر سیستم/مالی می‌تواند در `organization_settings` آن را `true` کند؛ در این حالت خروج ثبت می‌شود اما هشدار `NEGATIVE_STOCK_OCCURRED` در کاردکس و گزارش سود (ناقص بودن بهای تمام‌شده) درج می‌گردد.
- **وضعیت:** `CONFIRMED_BASELINE`

### `OD-07`: روش ارزش‌گذاری موجودی (`FIFO` vs `Weighted Average`)
- **گزینه‌ها:** (الف) اجبار یک روش واحد برای همه؛ (ب) انتخابی بین `WEIGHTED_AVERAGE` و `FIFO` در `accounting_policies` با پیش‌فرض `UNSPECIFIED`.
- **تصمیم پیشنهادی:** پیاده‌سازی هر دو موتور قطعی `WEIGHTED_AVERAGE` و `FIFO` در v1 (`PRF-COGS-001`). در هنگام راه‌اندازی سازمان، مقدار `UNSPECIFIED` است و تا زمانی که مدیر مالی یکی را انتخاب نکند، گزارش‌های تعدادی کار می‌کنند اما محاسبه سود ناخالص و بهای ریالی با پیام واضح متوقف می‌ماند (هرگز روش نامعتبر پیش‌فرض فرض نمی‌شود).
- **وضعیت:** `CONFIRMED_BASELINE`

### `OD-08`: محاسبه سود کالا وقتی قیمت خرید ناقص است
- **گزینه‌ها:** (الف) فرض بهای خرید صفر و محاسبه ۱۰۰٪ سود (خطای فاحش مالی!)؛ (ب) توقف کامل کل گزارش سود؛ (ج) محاسبه سود روی اقلام دارای بها + محاسبه `cost_coverage_pct` و افشای اقلام فاقد بها.
- **تصمیم پیشنهادی:** گزینه (ج) به صورت قطعی انتخاب و در فرمول `CF-PRF-02` تثبیت شد. اگر `cost_coverage_pct < 80%` سطح اطمینان `LOW` و هشدار شدید نمایش داده می‌شود.
- **وضعیت:** `CONFIRMED_BASELINE`

### `OD-09`: اسناد مالی اصلاحی و ابطال پس از `Posted`
- **گزینه‌ها:** (الف) امکان ویرایش مستقیم فاکتور `Posted`؛ (ب) تغییرناپذیری کامل `Posted` و اصلاح فقط از طریق سند معکوس (`Reversed`) یا `invoice_adjustments` / `financial_adjustments`.
- **تصمیم پیشنهادی:** گزینه (ب) قطعی و در RLS مرحله سوم (`pol_invoices_update`) قفل شده است. اصلاح تاریخچه پس از `Posted` صرفاً با ابطال معکوس و ثبت سند جدید یا تعدیل دارای تایید (`approval_requests`) انجام می‌شود.
- **وضعیت:** `CONFIRMED_BASELINE`

### `OD-10`: تطبیق شناسه مشتری و کالا بین هلو، سپیدار و Erpkian
- **گزینه‌ها:** (الف) ادغام خودکار فقط با شباهت اسم؛ (ب) لایه دوگانه: کلید قطعی خارجی در `external_entity_mappings` + موتور تطبیق نام/شناسه با `entity_match_candidates` نیازمند تایید انسانی.
- **تصمیم پیشنهادی:** گزینه (ب). هیچ دو مشتری یا کالایی صرفاً بر اساس شباهت اسمی (مثلاً «فروشگاه بهار» و «سوپر بهار») به صورت خودکار ادغام نمی‌شوند. تنها تطبیق قطعی با `external_id` قبلاً تاییدشده یا شناسه ملی/بارکد یکتا خودکار است.
- **وضعیت:** `CONFIRMED_BASELINE`

### `OD-11`: همگام‌سازی یک‌طرفه یا دوطرفه با نرم‌افزارهای حسابداری مبدأ
- **گزینه‌ها:** (الف) نوشتن مستقیم در دیتابیس هلو/سپیدار در v1؛ (ب) فقط-خواندنی (`read_only = true`) از مبدأ به Erpkian در v1.
- **ریسک:** نوشتن در دیتابیس SQL Server نرم‌افزارهای ایرانی بدون SDK رسمی مصوب می‌تواند به یکپارچگی مالی و قفل دیتابیس مشتری آسیب جدی بزند.
- **تصمیم پیشنهادی:** در کل نسخه اول **`read_only = true`** اجباری است (`integration_connections`). هرگونه همگام‌سازی دوطرفه به فازهای آتی و پس از قرارداد رسمی یا API تاییدشده موکول می‌شود.
- **وضعیت:** `CONFIRMED_BASELINE`

### `OD-12`: آستانه‌های تایید انسانی و گیت‌های اطمینان OCR
- **گزینه‌ها:** (الف) ارسال مستقیم خروجی OCR با اطمینان بالا به `Posted`؛ (ب) عدم `Posted` خودکار از OCR در هیچ حالتی + تعیین آستانه بازبینی فیلدها + سقف مبلغ دوامضایی.
- **تصمیم پیشنهادی:**
  1. هیچ خروجی OCR مستقیماً `Posted` نمی‌شود (حداکثر وضعیت پس از تایید کاربر در OCR Review، `Verified` است و затем گام Posting اجرا می‌شود).
  2. آستانه استاندارد `quality_score < 0.65` برای درخواست عکس بهتر و `field.confidence < 0.85` یا `math_validation_passed = false` برای اجبار `Needs Review` (قابل تنظیم در `organization_settings` در Migration `011`).
  3. مبلغ بالاتر از `require_dual_approval_above_irr` برای ورود به `Posted` نیازمند تایید `CFO`/`OWNER` در `approval_requests` است.
- **وضعیت:** `PROPOSED_FOR_PO_SIGN_OFF`
