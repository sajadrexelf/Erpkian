# 05 — ماتریس نقش‌ها و مجوزها (`Role & Permission Matrix`)

این سند دسترسی تمام **۹ نقش استاندارد** محصول (`roles`) را در برابر **۱۲ قابلیت کلیدی** و مجوزهای اتمیک (`permissions.code`) تعریف می‌کند.

---

## ۱. اصول حاکم بر کنترل دسترسی (`RBAC Policy`)
1. **دسترسی مبتنی بر مجوز (`Permission-Based`) و نه نام نقش:** در کد Backend (`NestJS RBAC Guard`) و فراخوانی ابزارهای دستیار هوشمند (`tool_invocations`)، بررسی همیشه روی کد مجوز اتمیک (`resource:action`) انجام می‌شود؛ نه چک کردن اسم نقش.
2. **جداسازی سازمانی (`Tenant Isolation`):** `membership_roles` همیشه به `organization_memberships` محدود به یک `organization_id` متصل است و لایه `PostgreSQL RLS` اجرای کوئری بین دو سازمان را ناممکن می‌کند.
3. **محدودیت شعبه (`branch_scope_id`):** اگر `membership_roles.branch_scope_id` دارای مقدار باشد، تمام سرویس‌ها و گزارش‌های خواندنی و ثبتی کاربر به داده‌های همان شعبه (و انبارهای متصل به آن شعبه) فیلتر می‌شوند. `NULL` به معنی دسترسی به کل سازمان است.
4. **محدودیت مبلغ و تایید دوامضایی (`Dual Approval`):**
   - هر فاکتور یا پرداخت یا تعدیل با مبلغ خالص بزرگ‌تر از `organization_settings.require_dual_approval_above_irr` حتی اگر توسط حسابدار/حسابدار ارشد `Verified` شود، برای انتقال به `Posted` ملزم به ایجاد رکورد در `approval_requests` است.
   - در حالت `Dual Approval`، شناسه درخواست‌کننده (`requested_by_membership_id`) و تصمیم‌گیرنده (`decided_by_membership_id`) **مطلقاً نباید یکی باشند**.
5. **نقش کاربر مستقل (`PERSONAL_USER`):** در سازمان‌های با `business_types.code = 'personal'`، تنها یک عضو (`OWNER` + `PERSONAL_USER`) فعال است که مجوزهای ثبت سند شخصی، گزارش نقدینگی و خروجی شخصی دارد اما عملیات چندکاربره یا مالیاتی سازمانی به صورت پیش‌فرض غیرفعال است.

---

## ۲. جدول ۹ نقش استاندارد (`roles`)

| کد نقش (`roles.code`) | نام فارسی (`roles.name_fa`) | دامنه پیش‌فرض شعبه | جایگاه در تایید دوامضایی |
| :--- | :--- | :--- | :--- |
| **`OWNER`** | صاحب کسب‌وکار | کل سازمان (`NULL`) | تاییدکننده نهایی و مدیریت دسترسی/سیاست‌ها |
| **`CEO`** | مدیرعامل | کل سازمان (`NULL`) | مشاهده تمام گزارش‌های مدیریتی و تایید سطوح بالا |
| **`CFO`** | مدیر مالی | کل سازمان (`NULL`) | تاییدکننده اصلی `Posted` بالای سقف، قفل/بازگشایی دوره، سیاست قیمت‌گذاری |
| **`SENIOR_ACCOUNTANT`** | حسابدار ارشد | کل یا شعبه | تایید `Verified`، ثبت `Posted` تا سقف مجاز، بستن استثنای بانک و اصلاح انبار |
| **`ACCOUNTANT`** | حسابدار | کل یا شعبه | ورود و اصلاح اسناد، OCR Review، مغایرت‌گیری و ارسال برای تایید |
| **`SALES_MANAGER`** | مدیر فروش | کل یا شعبه | مشاهده گزارش‌های فروش، مانده و سنی مطالبات مشتریان، پیشنهاد یادآوری |
| **`INVENTORY_MANAGER`** | مدیر انبار | انبار/شعبه محول‌شده | ورود و خروج کالا، شمارش انبارگردانی، پیشنهاد تعدیل (بدون رویت بانک و سود خالص) |
| **`OPERATOR`** | اپراتور / ثبت‌کننده سند | شعبه محول‌شده | آپلود عکس و فایل، پیش‌ثبت فاکتور/رسید تا `Needs Review` |
| **`PERSONAL_USER`** | کاربر مستقل | فضای شخصی (`NULL`) | تمام عملیات ساده شخصی (هزینه/درآمد/بانک/حساب شخصی) |

---

## ۳. ماتریس جامع ۹ نقش × ۱۲ قابلیت

**راهنمای سطوح دسترسی در جدول:**
- **`FULL`**: مشاهده، ایجاد، اجرا، تایید و مدیریت کامل در محدوده شعبه
- **`APPROVE`**: مجوز تایید نهایی (`Posted` / `Approval Gate`) و بازگشایی/کنترل
- **`ACTION`**: ایجاد/اجرا/ویرایش تا قبل از `Posted` (یا اجرا بدون تغییر ساختار مالی)
- **`VIEW`**: فقط مشاهده گزارش/داده مجاز (بدون تغییر)
- **`DRAFT`**: صرفاً آپلود، استخراج اولیه یا پیش‌نویس (`Needs Review`)
- **`NONE`**: عدم دسترسی مطلق (API خطای `403` برمی‌گرداند و رویداد `PERMISSION_DENIED` ثبت می‌شود)

| شماره | قابلیت عملیاتی | صاحب کسب‌وکار (`OWNER`) | مدیرعامل (`CEO`) | مدیر مالی (`CFO`) | حسابدار ارشد (`SENIOR_ACC`) | حسابدار (`ACCOUNTANT`) | مدیر فروش (`SALES_MGR`) | مدیر انبار (`INV_MGR`) | اپراتور (`OPERATOR`) | کاربر مستقل (`PERSONAL`) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **۱** | بارگذاری سند و اجرای OCR / بررسی اولیه (`DOC-INGEST`, `DOC-OCR`, `DOC-REVIEW`) | FULL | VIEW | FULL | FULL | FULL | VIEW *(فروش)* | ACTION *(انبار)* | DRAFT / ACTION | FULL *(شخصی)* |
| **۲** | ثبت و ویرایش پیش‌نویس فاکتور و دریافت/پرداخت (`FIN-AR-INV`, `FIN-AP-INV`, `FIN-AR-PAY`) | FULL | VIEW | FULL | FULL | ACTION | ACTION *(فروش فقط پیش‌نویس)* | NONE | DRAFT | FULL *(شخصی)* |
| **۳** | تایید قطعی (`Posted`) و عبور از دروازه دوامضایی (`DOC-POST-008`, `approval_requests`) | APPROVE | APPROVE *(اختیاری بالای سقف)* | APPROVE *(اصلی)* | APPROVE *(تا سقف مجاز)* | NONE *(فقط Verified)* | NONE | NONE | NONE | FULL *(بدون چندکاربره)* |
| **۴** | ابطال / سند معکوس (`Reversed`) و ثبت تعدیل مالی (`financial_adjustments`) | APPROVE | VIEW | FULL | ACTION *(نیازمند تایید CFO)* | NONE | NONE | NONE | NONE | ACTION *(شخصی)* |
| **۵** | مشاهده و پیگیری مطالبات و سنی بدهی مشتریان (`FIN-AR-AGING`, `FIN-AR-CREDIT`) | FULL | VIEW | FULL | FULL | VIEW / ACTION | FULL *(بخش فروش و وصول)* | NONE | NONE | VIEW *(اشخاص)* |
| **۶** | بانک، صندوق، چک صیادی و مغایرت‌گیری بانکی (`TRS-BANK-*`, `TRS-CHK-*`) | FULL | VIEW | FULL | FULL | ACTION *(پیشنهاد مغایرت)* | NONE | NONE | NONE *(فقط آپلود رسید)* | FULL *(حساب شخصی)* |
| **۷** | کالا، واحد سنجش، حرکات و مغایرت انبار (`INV-*`) | FULL | VIEW | FULL *(مقدار + ریال)* | FULL *(مقدار + ریال)* | ACTION *(ثبت مالی انبار)* | VIEW *(موجودی فروش)* | FULL *(فقط تعدادی؛ بدون سود/بها در حالت محدود)* | DRAFT *(حواله)* | NONE *(یا ساده)* |
| **۸** | مشاهده قیمت خرید، COGS و حاشیه سود (`PRF-*`, `PUR-PRICE-*`) | FULL | VIEW | FULL | FULL | VIEW *(محدود)* | NONE *(مگر مجوز صریح)* | NONE *(اکیداً مسدود)* | NONE | VIEW *(شخصی)* |
| **۹** | گزارش‌های مدیریتی و سود و زیان (`RPT-DASH`, `RPT-MONTHLY`, `RPT-PNL`, `RPT-EXPORT`) | FULL | VIEW | FULL | FULL | ACTION *(ساخت گزارش)* | VIEW *(فقط گزارش فروش)* | VIEW *(فقط گزارش انبار)* | NONE | FULL *(گزارش شخصی)* |
| **۱۰** | آماده‌سازی و اعتبارسنجی مالیاتی (`TAX-PREP-*`, `TAX-VAL-*`) | FULL | VIEW | FULL | ACTION | ACTION | NONE | NONE | NONE | NONE |
| **۱۱** | مدیریت قفل/بازگشایی دوره مالی و سیاست ارزش‌گذاری (`fiscal_periods`, `accounting_policies`) | APPROVE | VIEW | FULL | NONE *(فقط درخواست)* | NONE | NONE | NONE | NONE | NONE *(ساده)* |
| **۱۲** | مدیریت کاربران، نقش‌ها، شعب و اتصال هلو/سپیدار (`RBAC`, `integration_connections`) | FULL | VIEW | ACTION *(تایید تنظیم مالی)* | NONE | NONE | NONE | NONE | NONE | NONE |

---

## ۴. کاتالوگ کدهای مجوز اتمیک (`permissions.code`) و قوانین Guard

هر رکورد در جدول `permissions` دارای کد استاندارد `resource:action` است. نگاشت کلیدی به شکل زیر کنترل می‌شود:

| کد مجوز (`permissions.code`) | ماژول | توضیح عملکرد | نقش‌های دارای مجوز پیش‌فرض |
| :--- | :--- | :--- | :--- |
| `document:upload` | Documents | بارگذاری تصویر، PDF و فایل اکسل | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `INVENTORY_MANAGER`, `OPERATOR`, `PERSONAL_USER` |
| `document:review_ocr` | OCR | اصلاح فیلدها و ثبت `extraction_reviews` | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `INVENTORY_MANAGER` *(انبار)*, `PERSONAL_USER` |
| `invoice:draft` | Financial | ایجاد/ویرایش فاکتور در وضعیت `Needs Review` / `Verified` | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `SALES_MANAGER` *(فروش)*, `OPERATOR`, `PERSONAL_USER` |
| `invoice:verify` | Financial | انتقال فاکتور از `Needs Review` به `Verified` | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `PERSONAL_USER` |
| `invoice:post` | Financial | ثبت قطعی فاکتور (`Posted`) — در مبالغ بالاتر از سقف مشروط به `Dual Approval` | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT` *(تا سقف مجاز)*, `PERSONAL_USER` |
| `invoice:reverse` | Financial | صدور سند معکوس برای فاکتور `Posted` | `OWNER`, `CFO`, `PERSONAL_USER` |
| `payment:post` | Treasury | ثبت قطعی دریافت/پرداخت و تخصیص `payment_allocations` | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `PERSONAL_USER` |
| `check:manage` | Treasury | ثبت چک صیادی و تغییر وضعیت به `DEPOSITED`/`CLEARED`/`BOUNCED` | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT` *(پیش‌نویس)*, `PERSONAL_USER` |
| `bank:reconcile` | Reconciliation | اجرای مغایرت‌گیری بانک و تایید `PROBABILISTIC_SUGGESTED` | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT` *(پیشنهاد)* |
| `ar:view_aging` | Financial | مشاهده گزارش سنی مطالبات و وضعیت اعتبار مشتریان | `OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `SALES_MANAGER` |
| `ar:draft_reminder` | Financial | تولید پیش‌نویس یادآوری وصول مطالبات | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `SALES_MANAGER` |
| `inventory:move` | Inventory | ثبت ورود/خروج/انتقال انبار (`inventory_movements`) | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT`, `INVENTORY_MANAGER` |
| `inventory:reconcile` | Inventory | اجرای مغایرت‌گیری انبارگردانی و پیشنهاد تعدیل | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `INVENTORY_MANAGER` |
| `inventory:post_adjustment` | Inventory | تایید نهایی و `Posted` کردن سند تعدیل انبار | `OWNER`, `CFO` |
| `report:view_cost_profit` | Profitability | مشاهده قیمت خرید، COGS، سود ناخالص و سود و زیان | `OWNER`, `CEO`, `CFO`, `SENIOR_ACCOUNTANT` |
| `report:export` | Reporting | دانلود فایل‌های رسمی PDF/Excel/CSV با ثبت `document_access_logs` | مطابق دسترسی ماژول گزارش هدف |
| `period:soft_lock` | Fiscal | قفل موقت دوره مالی برای بستن ماه | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT` |
| `period:close_reopen` | Fiscal | بستن قطعی (`CLOSED`) یا بازگشایی مجدد دوره (`REOPEN`) | `OWNER`, `CFO` |
| `tax:prepare_validate` | Tax | اجرای محاسبات پیش‌نویس و اعتبارسنجی مالیاتی | `OWNER`, `CFO`, `SENIOR_ACCOUNTANT`, `ACCOUNTANT` |
| `org:manage_rbac_sync` | Core/Admin | مدیریت کاربران، نقش‌ها، شعب، سقف دوامضایی و اتصال هلو/سپیدار | `OWNER`, `CFO` *(تنظیم مالی)* |

---

## ۵. قوانین کنترلی ویژه (`Guard Rules`)
1. **منع نشت اطلاعات مالی حساس به انبار و فروش:** اگر `INVENTORY_MANAGER` یا `OPERATOR` از دستیار هوشمند بپرسد «سود خالص این ماه چقدر است؟» یا «مانده حساب بانک ملت چقدر است؟»، لایه Orchestrator پیش از اجرای ابزار مجوز `report:view_cost_profit` و `bank:reconcile` را چک کرده و بدون افشای هیچ عدد واقعی، پیام استاندارد عدم دسترسی (`403 Forbidden`) برمی‌گرداند و رویداد را در `tool_invocations (output_status='DENIED')` ثبت می‌کند.
2. **اجبار `branch_scope_id`:** کاربری که نقش او محدود به `شعبه غرب` است، در گزارش `FIN-AR-AGING-001` یا `SLS-RPT-001` فقط فاکتورهای `branch_id = شعبه غرب` را می‌بیند و در خروجی `JSON`/`PDF` صراحتاً قید می‌شود «گزارش محدود به شعبه غرب».
3. **قانون سقف دوامضایی (`Dual Approval Gate`):**
   - فرض سازمان: `require_dual_approval_above_irr = 500,000,000` (۵۰ میلیون تومان).
   - اگر فاکتور فروش یا سند تعدیل مبلغ ۶۲۰,۰۰۰,۰۰۰ ریال داشته باشد و `SENIOR_ACCOUNTANT` دکمه تایید نهایی را بزند، سیستم سند را `Posted` **نمی‌کند**؛ بلکه به `Awaiting Approval` می‌برد، یک `approval_requests` با `required_permission_code = 'invoice:post'` می‌سازد و برای `CFO` و `OWNER` اعلان `APPROVAL_NEEDED` ارسال می‌کند.
   - اگر `CFO` همان فرد درخواست‌کننده باشد، برای تایید نهایی در حالت دوامضایی اجباری، تاییدکننده دوم باید عضو دیگری با مجوز `OWNER` یا `CEO` باشد.
