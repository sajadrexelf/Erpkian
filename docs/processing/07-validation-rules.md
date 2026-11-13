# 07 — قوانین اعتبارسنجی قطعی (`Deterministic Validation Rules`)

تمام قوانین این سند در لایه موتور قطعی (`NestJS / TypeScript Validation Engine` و `Constraints PostgreSQL`) بدون دخالت مدل زبانی اجرا می‌شوند. نقض هر قانون یا منجر به **مسدودسازی سخت (`BLOCK`)** می‌شود یا سند را به وضعیت **`Needs Review` (`WARN_REVIEW`)** هدایت می‌کند.

---

## ۱. قوانین اعتبارسنجی ریاضی و حسابی اسناد (`VR-MATH`)

| کد قانون | عنوان قانون | فرمول / شرط دقیق | رفتار هنگام نقض | شدت |
| :--- | :--- | :--- | :--- | :---: |
| **`VR-MATH-01`** | تراز حسابی سطر فاکتور | برای هر سطر غیرتعدیلی: `ABS(ROUND(quantity * unit_price_irr - discount_amount_irr + tax_amount_irr) - net_line_amount_irr) <= 1` *(تلرانس رندینگ ۱ ریال)* | در OCR انتقال خودکار به `Needs Review` و هایلایت سلول؛ در ثبت دستی رد خطا | `WARN_REVIEW` / `BLOCK` |
| **`VR-MATH-02`** | تراز جمع هدر فاکتور | `subtotal_irr = SUM(ROUND(quantity * unit_price_irr))` و `line_discount_total_irr = SUM(discount_amount_irr)` و `tax_total_irr = SUM(tax_amount_irr)` و `net_total_irr = subtotal_irr - line_discount_total_irr - invoice_discount_irr + tax_total_irr` | انتقال به `Needs Review` با پیام دقیق اختلاف عددی (به ریال) | `WARN_REVIEW` / `BLOCK` |
| **`VR-MATH-03`** | قاعده اشانتیون صفر ریالی | اگر `unit_price_irr = 0`: باید `quantity > 0` و `is_promotional_free_item = true` و `discount_amount_irr = 0` باشد؛ در غیر این صورت ممکن است خطای خوانش OCR باشد | اگر پرچم اشانتیون ست نشده باشد ← `Needs Review` برای تایید اشانتیون بودن | `WARN_REVIEW` |
| **`VR-MATH-04`** | سقف تخفیف مجاز ردیف و فاکتور | `discount_amount_irr <= ROUND(quantity * unit_price_irr)` و `invoice_discount_irr <= (subtotal_irr - line_discount_total_irr)` | مسدودسازی (`BLOCK`)؛ تخفیف نمی‌تواند خالص را منفی کند | `BLOCK` |
| **`VR-MATH-05`** | نرخ مالیات بر ارزش افزوده | در ردیف‌های مشمول مالیات استاندارد: بررسی تطابق `tax_amount_irr` با نرخ مصوب پیکربندی‌شده سازمان (مثلاً ۱۰٪ با تلرانس رندینگ ۱۰ ریال)؛ یا ثبت صریح `EXEMPT` / `CUSTOM_TAX` | ثبت هشدار `TAX_RATE_ANOMALY` برای بازبینی حسابدار | `WARN_REVIEW` |
| **`VR-MATH-06`** | سقف تخصیص پرداخت (`M:N`) | مجموع `allocated_amount_irr` با وضعیت `ACTIVE` برای هر `payment_id` باید `<= payments.amount_irr` و برای هر `invoice_id` باید `<= invoices.net_total_irr + SUM(invoice_adjustments)` باشد | مسدودسازی (`BLOCK`) با کد `ALLOCATION_OVERFLOW` | `BLOCK` |
| **`VR-MATH-07`** | تراز سند تعدیل و حرکت انبار | `payments.amount_irr > 0`، `checks.amount_irr > 0`، `financial_adjustments.amount_signed_irr <> 0` و `inventory_movements.base_qty_signed <> 0` | مسدودسازی سخت (`CHECK` در دیتابیس) | `BLOCK` |
| **`VR-MATH-08`** | ردیابی مبلغ منفی غیرمجاز | در `invoices` از نوع `SALE`/`PURCHASE`، هیچ سطری مجاز به داشتن `quantity <= 0` یا `unit_price_irr < 0` نیست؛ مرجوعی فقط از طریق `SALE_RETURN`/`PURCHASE_RETURN` ثبت می‌شود | مسدودسازی (`BLOCK`) و راهنمایی به ثبت برگشت از فروش/خرید | `BLOCK` |

---

## ۲. قوانین تاریخ شمسی و تقویم (`VR-DATE`)

| کد قانون | عنوان قانون | شرط و منطق دقیق | رفتار هنگام نقض | شدت |
| :--- | :--- | :--- | :--- | :---: |
| **`VR-DATE-01`** | اعتبارسنجی تقویم شمسی و کبیسه | قالب `YYYY/MM/DD`؛ ماه‌های ۱ تا ۶ حداکثر ۳۱ روز، ماه‌های ۷ تا ۱۱ حداکثر ۳۰ روز، ماه ۱۲ در سال غیرکبیسه ۲۹ روز و در سال کبیسه ۳۰ روز (محاسبه کبیسه بر پایه الگوریتم رسمی تقویم هجری شمسی) | مسدودسازی (`INVALID_JALALI_DATE`) | `BLOCK` |
| **`VR-DATE-02`** | همگام‌سازی قطعی شمسی و میلادی | تمام تاریخ‌ها همزمان به صورت UTC (`DATE`/`TIMESTAMPTZ`) و `CHAR(10)` شمسی (`*_jalali`) ذخیره می‌شوند؛ تبدیل همیشه در سمت سرور انجام می‌شود | در صورت ناهماهنگی دستی بین دو فیلد ← رد و بازمحاسبه | `BLOCK` |
| **`VR-DATE-03`** | کنترل سررسید فاکتور و چک | `invoices.due_date >= invoices.issue_date` (در صورت وجود)؛ برای چک، `due_date` نمی‌تواند بیش از ۵ سال در گذشته یا ۱۰ سال در آینده بدون تایید باشد | نقض `due_date < issue_date` ← `BLOCK`؛ سررسید نامتعارف ← `WARN_REVIEW` | `BLOCK` / `WARN_REVIEW` |
| **`VR-DATE-04`** | سال دو رقمی یا ابهام در OCR | اگر OCR تاریخ را به شکل `05/08/10` یا با روز/ماه ناخوانا بخواند (`confidence < 0.85`) | تبدیل خودکار به `1405` ممنوع است unless صریحاً تایید شود ← `Needs Review` | `WARN_REVIEW` |
| **`VR-DATE-05`** | تاریخ آینده غیرعادی | تاریخ صدور فاکتور یا پرداخت نباید بیشتر از ۱ روز جلوتر از تاریخ جاری سرور (با در نظر گرفتن منطقه زمانی `Asia/Tehran`) باشد | مسدودسازی یا هشدار ویژه در `Needs Review` | `WARN_REVIEW` |

---

## ۳. قوانین واحد پول و تبدیل ریال/تومان (`VR-CURR`)

| کد قانون | عنوان قانون | شرط و منطق دقیق | رفتار هنگام نقض | شدت |
| :--- | :--- | :--- | :--- | :---: |
| **`VR-CURR-01`** | قفل واحد پول پایه دیتابیس | تمام ستون‌های محاسباتی `*_irr` منحصراً بر مبنای **ریال (`IRR`)** و با `NUMERIC(18,0)` یا `NUMERIC(20,4)` ذخیره می‌شوند | عدم پذیرش ذخیره مستقیم تومان در ستون `*_irr` | `BLOCK` |
| **`VR-CURR-02`** | عدم تبدیل ضمنی بدون تشخیص واحد مبدأ | اگر روی عکس فاکتور یا فایل اکسل مشخص نباشد عدد به «ریال» است یا «تومان» (مثلاً نبود کلمه ریال/تومان یا ناهمسانی بیش از ۱۰ برابر با قیمت مرجع کالا) | سیستم **هرگز حدس نمی‌زند**؛ سند با هشدار `CURRENCY_UNIT_AMBIGUOUS` در `Needs Review` متوقف می‌شود | `WARN_REVIEW` |
| **`VR-CURR-03`** | تبدیل رسمی تومان به ریال | در صورت تایید `source_currency_code = 'IRT'`، نرخ `exchange_rate_to_base = 10.00000000` اعمال و مبلغ مبدأ و نرخ تبدیل نگهداری می‌شود | الزام ثبت هر دو مقدار برای ممیزی | `BLOCK` |
| **`VR-CURR-04`** | انطباق نرخ تبدیل ارز خارجی | در صورت استفاده از ارز غیر از `IRR`/`IRT`، باید رکورد معتبر در `exchange_rates` برای تاریخ سند موجود باشد (`rate > 0`) | توقف در `Awaiting Input` تا ثبت نرخ تبدیل روز | `BLOCK` |
| **`VR-CURR-05`** | قفل ارز پایه پس از ثبت سند | پس از ثبت اولین فاکتور یا پرداخت `Posted` در سازمان، تغییر `organizations.base_currency_code` ممنوع است | مسدودسازی (`BASE_CURRENCY_LOCKED`) | `BLOCK` |

---

## ۴. قوانین واحدهای سنجش (`VR-UOM`)

| کد قانون | عنوان قانون | شرط و منطق دقیق | رفتار هنگام نقض | شدت |
| :--- | :--- | :--- | :--- | :---: |
| **`VR-UOM-01`** | الزام ضریب تبدیل معتبر | هر ردیف فاکتور یا حرکت انبار با واحد `uom_id <> product.base_uom_id` باید در `product_units` یا `unit_conversions` ضریب `conversion_to_base > 0` داشته باشد | توقف تا تعریف ضریب تبدیل (مثلاً ۱ کارتن = ۱۲ عدد) | `AWAITING_INPUT` |
| **`VR-UOM-02`** | محاسبه قطعی مقدار پایه | `base_quantity = ROUND(quantity * conversion_to_base, organization_settings.qty_decimal_scale)` | محاسبه اجباری در Backend | `BLOCK` |
| **`VR-UOM-03`** | قفل واحد پایه کالا پس از گردش | تغییر `products.base_uom_id` پس از وجود حتی یک `inventory_movements` برای آن کالا ممنوع است | مسدودسازی (`BASE_UOM_IMMUTABLE`) | `BLOCK` |
| **`VR-UOM-04`** | ابهام واحد در OCR | اگر OCR فقط عدد `10` را بخواند و واحد (کارتن یا عدد) ناخوانا باشد | ارجاع به `Needs Review` با مقایسه قیمت واحد با `default_purchase/sale_price_irr` | `WARN_REVIEW` |

---

## ۵. قوانین تشخیص تکراری (`VR-DUP`)

| کد قانون | عنوان قانون | شرط و منطق دقیق | رفتار هنگام نقض | شدت |
| :--- | :--- | :--- | :--- | :---: |
| **`VR-DUP-01`** | تکرار فایل در سطح بایت (`SHA-256`) | بررسی وجود `sha256_hash` یکسان در `document_storage_objects` برای همان `organization_id` (حتی با نام فایل متفاوت) | ثبت `duplicate_of_document_id` و توقف پردازش مجدد OCR مگر تایید آگاهانه کاربر («این یک فایل مجزا است») | `WARN_REVIEW` |
| **`VR-DUP-02`** | تکرار فاکتور تجاری | ترکیب `(organization_id, invoice_direction, contact_id, invoice_number, issue_date, net_total_irr)` برای فاکتورهای غیرباطل‌شده | مسدودسازی ثبت `Posted` تکراری (`DUPLICATE_INVOICE_DETECTED`) با نمایش لینک فاکتور قبلی | `BLOCK` |
| **`VR-DUP-03`** | تکرار رسید پرداخت / تراکنش بانک | بررسی `tracking_code` + `amount_irr` + تاریخ در یک حساب بانکی یا ترکیب `(bank_account_id, occurred_at, amount_signed_irr, reference_no)` | علامت‌گذاری `POTENTIAL_DUPLICATE` در `reconciliation_exceptions` یا جلوگیری از Import مجدد سطر | `WARN_REVIEW` / `SKIP` |
| **`VR-DUP-04`** | کلید Idempotency عملیات | اجبار `idempotency_key` روی `invoices`، `payments`، `inventory_movements`، `import_batches` و `workflow_executions` | در ارسال مجدد درخواست با همان کلید، عملیات تکرار نمی‌شود و پاسخ قبلی برگردانده می‌شود | `IDEMPOTENT` |
| **`VR-DUP-05`** | کلید خارجی نرم‌افزار مبدأ | کلید یکتا `(organization_id, source_system_id, entity_domain, external_id)` در `external_entity_mappings` و `row_hash` در `import_rows` | سطرهای تکراری با وضعیت `DUPLICATE_SKIPPED` رد و شمارش می‌شوند | `SKIP` |

---

## ۶. قوانین قفل دوره مالی (`VR-PER`)

| کد قانون | عنوان قانون | شرط و منطق دقیق | رفتار هنگام نقض | شدت |
| :--- | :--- | :--- | :--- | :---: |
| **`VR-PER-01`** | تطابق تاریخ سند با دوره مالی | هر فاکتور، پرداخت، تعدیل یا حرکت انبار `Posted` باید تاریخ وقوع آن در بازه `[start_date, end_date]` یک `fiscal_periods` معتبر همان سازمان قرار بگیرد | توقف (`FISCAL_PERIOD_NOT_FOUND`) تا ایجاد سال/دوره مالی | `BLOCK` |
| **`VR-PER-02`** | منع ثبت در دوره بسته (`CLOSED`) | تغییر وضعیت به `Posted` یا ثبت تعدیل در دوره با `status = 'CLOSED'` مطلقاً ممنوع است | مسدودسازی (`FISCAL_PERIOD_CLOSED`)؛ تنها راه بازگشایی رسمی با مجوز `CFO/OWNER` و ثبت `period_locks` است | `BLOCK` |
| **`VR-PER-03`** | کنترل دوره قفل موقت (`SOFT_LOCKED`) | در دوره `SOFT_LOCKED` فقط `OWNER` یا `CFO` با ثبت دلیل می‌تواند سند یا تعدیل را `Posted` کند؛ سایر نقش‌ها مسدود می‌شوند | مسدودسازی برای حسابدار با نمایش نام وضعیت دوره | `BLOCK` |
| **`VR-PER-04`** | کنترل ترتیب قفل سال مالی | بستن سال مالی (`fiscal_years.status = 'CLOSED'`) بدون بسته بودن تمام ۱۲ دوره زیرمجموعه و نبود سند `Needs Review` باز (یا تایید صریح بستن با مستندسازی) مجاز نیست | مسدودسازی و نمایش لیست دوره‌ها و اسناد باز | `BLOCK` |

---

## ۷. قوانین انبار، موجودی منفی و شناسه‌ها (`VR-INV` و `VR-ENT`)

| کد قانون | عنوان قانون | شرط و منطق دقیق | رفتار هنگام نقض | شدت |
| :--- | :--- | :--- | :--- | :---: |
| **`VR-INV-01`** | سیاست موجودی منفی | پیش از ثبت `SALE_OUT` / `TRANSFER_OUT` / `ADJUSTMENT_OUT`، موجودی لحظه‌ای در انبار هدف محاسبه می‌شود؛ اگر `current_balance - out_base_qty < 0`: اگر `allow_negative_stock = false` ← مسدودسازی؛ اگر `true` ← ثبت هشدار `NEGATIVE_STOCK_OCCURRED` | در حالت پیش‌فرض `BLOCK`؛ در حالت مجاز `WARN` و پرچم در گزارش سود/انبار | `BLOCK` / `WARN` |
| **`VR-INV-02`** | تراز انتقال بین انبارها | هر عملیات انتقال باید دقیقاً یک `TRANSFER_OUT` در انبار مبدأ و یک `TRANSFER_IN` در انبار مقصد با `transfer_group_id` یکسان، کالای یکسان و `ABS(qty)` برابر داشته باشد (انبار مبدأ != مقصد) | مسدودسازی انتقال ناتراز یا انتقال به خود انبار | `BLOCK` |
| **`VR-INV-03`** | انطباق نوع حرکت و علامت تعداد | برای `OPENING`, `PURCHASE_IN`, `RETURN_IN`, `TRANSFER_IN`, `ADJUSTMENT_IN` ← `base_qty_signed > 0`؛ برای `SALE_OUT`, `RETURN_OUT`, `TRANSFER_OUT`, `ADJUSTMENT_OUT` ← `base_qty_signed < 0` | مسدودسازی (`CHECK` سخت در دیتابیس) | `BLOCK` |
| **`VR-ENT-01`** | اعتبارسنجی کد ملی و شناسه ملی ایران | کد ملی ۱۰ رقمی (الگوریتم رقم کنترل باقیمانده بر ۱۱)، شناسه ملی ۱۱ رقمی حقوقی، شماره موبایل `^(\+98|0)9[0-9]{9}$`، شبا ۲۶ کاراکتری `^IR[0-9]{24}$` و شناسه صیاد ۱۶ رقمی `^[0-9]{16}$` | در خطای رقم کنترل یا فرمت ← رد در فرم دستی و `FLAGGED` در OCR | `BLOCK` / `WARN_REVIEW` |
| **`VR-ENT-02`** | منع استفاده از کاندید تاییدنشده در `Posted` | در وضعیت `Posted`، `invoices.contact_id` و `invoice_lines.product_id` (برای کالاها) نباید `NULL` باشند و نباید به یک موجودیت با وضعیت `MERGED` اشاره مستقیم کنند (باید به `merged_into_contact_id` هدایت شوند) | مسدودسازی ثبت قطعی تا تکمیل تطبیق (`Entity Resolution`) | `BLOCK` |
