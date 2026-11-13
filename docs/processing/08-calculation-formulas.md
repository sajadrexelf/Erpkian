# 08 — فرمول‌های قطعی محاسبات مالی و تحلیلی (`Deterministic Calculation Formulas`)

تمام محاسبات این سند در موتور قطعی Backend (`PostgreSQL` + `TypeScript Decimal/BigInt Engine`) با واحد پایه **ریال (`IRR`)** اجرا می‌شوند. گردکردن نهایی مقادیر پولی ریال با روش **`Half-to-Even` (گرد بانکی به نزدیک‌ترین عدد صحیح ریال)** انجام می‌شود؛ مبالغ بهای واحد (`unit_price_irr` و `unit_cost_irr`) تا ۴ رقم اعشار (`NUMERIC(20,4)`) نگهداری می‌شوند تا خطای انباشته گردکردن در تعداد بالا رخ ندهد.

---

## ۱. فرمول محاسبه فاکتور فروش و خرید (`CF-INV`)

### `CF-INV-01`: محاسبه مبلغ هر سطر و هدر فاکتور (شامل تخفیف ردیفی، پلکانی، پای‌فاکتور و اشانتیون)
برای هر سطر $i$ از فاکتور:
- $\text{BaseQty}_i = \text{Qty}_i \times \text{ConversionToBase}_i$
- اگر `is_promotional_free_item = true` باشد: $\text{UnitPrice}_i = 0$، $\text{LineGross}_i = 0$، $\text{LineNet}_i = 0$ *(ولی بهای تمام‌شده این کالا از انبار خارج و در سود واقعی لحاظ می‌شود)*.
- در غیر این صورت:
  - $\text{LineGross}_i = \text{ROUND}(\text{Qty}_i \times \text{UnitPrice}_i, 0)$
  - اگر تخفیف درصدی/پلکانی تعریف شده باشد: $\text{LineDiscount}_i = \text{ROUND}(\text{LineGross}_i \times \frac{\text{DiscountPct}_i}{100}, 0)$ (یا مبلغ صریح واردشده).
  - $\text{TaxableLineBase}_i = \text{LineGross}_i - \text{LineDiscount}_i$
  - $\text{LineTax}_i = \text{ROUND}(\text{TaxableLineBase}_i \times \text{TaxRate}_i, 0)$
  - $\text{LineNet}_i = \text{TaxableLineBase}_i + \text{LineTax}_i$

در سطح هدر فاکتور:
- $\text{Subtotal} = \sum_i \text{LineGross}_i$
- $\text{LineDiscountTotal} = \sum_i \text{LineDiscount}_i$
- $\text{TaxTotal} = \sum_i \text{LineTax}_i$ *(یا در صورت تخفیف پای فاکتور مشمول کاهش مالیات، توزیع متناسب قبل از مالیات طبق تنظیم)*
- $\text{NetTotal} = \text{Subtotal} - \text{LineDiscountTotal} - \text{InvoiceDiscount} + \text{TaxTotal}$

**مثال عددی (`Synthetic`):**
۱۰ کارتن کالا با فی ۱,۲۰۰,۰۰۰ ریال + ۱ کارتن اشانتیون، تخفیف ردیفی ۵٪، مالیات ۱۰٪، کرایه حمل در تعدیل فاکتور ۳۰۰,۰۰۰ ریال:
- سطر ۱: $\text{LineGross}_1 = 10 \times 1,200,000 = 12,000,000$ ریال | تخفیف ۵٪ $= 600,000$ ریال | مبنای مشمول $= 11,400,000$ ریال | مالیات ۱۰٪ $= 1,140,000$ ریال | $\text{LineNet}_1 = 12,540,000$ ریال.
- سطر ۲ (اشانتیون): ۱ کارتن با فی $0$ ← $\text{LineNet}_2 = 0$ ریال.
- جمع فاکتور (`NetTotal`) $= 12,540,000$ ریال؛ با اضافه شدن تعدیل `FREIGHT = +300,000` در `invoice_adjustments`، بدهی موثر فاکتور $= 12,840,000$ ریال.

---

## ۲. فرمول‌های مطالبات، تخصیص و گزارش سنی (`CF-AR` & `CF-AP`)

### `CF-AR-01`: مانده باز موثر یک فاکتور (`Open Invoice Balance`)
$$\text{EffectiveInvoiceAmount}_k = \text{NetTotal}_k + \sum_{a \in \text{Adjustments}(k)} \text{AmountSigned}_a$$
$$\text{AllocatedPaid}_k = \sum_{p \in \text{ActiveAllocations}(k)} \text{AllocatedAmount}_p$$
$$\text{OpenBalance}_k = \text{EffectiveInvoiceAmount}_k - \text{AllocatedPaid}_k$$

**ملاحظه چک‌های وصول‌نشده:**
- پرداخت‌های با روش `CHEQUE` تا زمانی که چک در وضعیت `IN_HAND` یا `DEPOSITED` است، **به عنوان چک در جریان وصول (`PendingChequesTotal`)** تفکیک می‌شوند و در محاسبه قطعی «وصول نقدی قطعی‌شده» از بدهی قطعی مشتری کم نمی‌شوند تا هنگام برگشت چک، بدهی واقعی پنهان نماند.

### `CF-AR-02`: سن بدهی و دسته‌بندی سبدهای سنی (`Aging Buckets`)
با تاریخ مبنای گزارش (`as_of_date`):
$$\text{EffectiveDueDate}_k = \text{COALESCE}(\text{due\_date}_k, \text{issue\_date}_k + \text{default\_invoice\_due\_days})$$
$$\text{DaysPastDue}_k = \max(0, \text{as\_of\_date} - \text{EffectiveDueDate}_k)$$

| وضعیت سررسید | شرط | سبد خروجی |
| :--- | :--- | :--- |
| سررسید نرسیده | $\text{as\_of\_date} \le \text{EffectiveDueDate}_k$ | `CURRENT` (جاری / سررسید نشده) |
| تاخیر ۱ تا ۳۰ روز | $1 \le \text{DaysPastDue}_k \le 30$ | `BUCKET_1_30` |
| تاخیر ۳۱ تا ۶۰ روز | $31 \le \text{DaysPastDue}_k \le 60$ | `BUCKET_31_60` |
| تاخیر ۶۱ تا ۹۰ روز | $61 \le \text{DaysPastDue}_k \le 90$ | `BUCKET_61_90` |
| تاخیر بالای ۹۰ روز | $\text{DaysPastDue}_k > 90$ | `BUCKET_90_PLUS` |

**مثال عددی (`Synthetic`):**
مشتری «پخش البرز» دو فاکتور `Posted` دارد (`as_of_date = 1405/08/25`):
- فاکتور ۱ (`due_date = 1405/07/10`, `NetTotal = 80,000,000` ریال)؛ واریز نقدی تخصیص‌یافته `30,000,000` ریال ← مانده باز $= 50,000,000$ ریال با ۴۵ روز تاخیر ← سبد **`BUCKET_31_60`**.
- فاکتور ۲ (`due_date = 1405/08/20`, `NetTotal = 40,000,000` ریال)؛ چک صیادی `IN_HAND` به مبلغ `40,000,000` ریال ← مانده باز $= 40,000,000$ ریال با ۵ روز تاخیر (`BUCKET_1_30`) + ستون مستقل **`چک در جریان وصول = 40,000,000` ریال**.
- جمع بدهی باز مشتری $= 90,000,000$ ریال | جمع معوق کل $= 90,000,000$ ریال | بدهی بدون پوشش چک $= 50,000,000$ ریال.

### `CF-AR-03`: تخصیص خودکار `FIFO`
وقتی مبلغ دریافت $P$ بدون تعیین فاکتور خاص به حساب مشتری ثبت می‌شود (`FIFO_AUTO`):
1. تمام فاکتورهای `Posted` باز آن مشتری بر اساس `(issue_date ASC, id ASC)` مرتب می‌شوند.
2. تا زمانی که $\text{RemainingPayment} > 0$:
   $$\text{Alloc} = \min(\text{RemainingPayment}, \text{OpenBalance}_k)$$
   یک رکورد در `payment_allocations` با `ALLOC` ثبت و $\text{RemainingPayment} \mathrel{-}= \text{Alloc}$.
3. اگر پس از تسویه تمام فاکتورهای باز، همچنان مبلغی باقی ماند، به عنوان **بستانکاری / پیش‌دریافت مشتری (`UnallocatedCredit`)** در حساب مشتری گزارش می‌شود.

---

## ۳. فرمول‌های موجودی و بهای تمام‌شده کالا (`CF-INV-COST`)

### `CF-INV-01`: موجودی لحظه‌ای تعدادی در تاریخ $T$
$$\text{StockQty}(w, p, T) = \text{SnapshotBaseQty}(w, p, t_0) + \sum_{\substack{m \in \text{PostedMovements}(w,p) \\ t_0 < m.\text{occurred\_at} \le T}} m.\text{base\_qty\_signed}$$
که در آن $t_0$ تاریخ آخرین `stock_snapshots` با `is_canonical = true` و `as_of_date <= T` است (و اگر نباشد $t_0 = -\infty$ و مقدار اولیه $0$).

### `CF-COST-01`: روش میانگین موزون متحرک (`WEIGHTED_AVERAGE`)
در زمان هر حرکت ورودی ($q_{\text{in}} > 0$ با بهای کل $C_{\text{in}}$):
$$\text{NewQty} = \text{PrevQty} + q_{\text{in}}$$
$$\text{NewTotalValue} = \text{PrevTotalValue} + C_{\text{in}}$$
$$\text{AvgUnitCost} = \begin{cases} \frac{\text{NewTotalValue}}{\text{NewQty}} & \text{if } \text{NewQty} > 0 \\ \text{LastKnownUnitCost} & \text{otherwise} \end{cases}$$

در زمان هر حرکت خروجی ($q_{\text{out}} > 0$ شامل فروش، ضایعات و اشانتیون خروجی):
$$\text{OutUnitCost} = \text{AvgUnitCost}$$
$$\text{OutTotalCost} = \text{ROUND}(q_{\text{out}} \times \text{OutUnitCost}, 0)$$
$$\text{NewTotalValue} = \max(0, \text{PrevTotalValue} - \text{OutTotalCost})$$

**مثال عددی (`Synthetic`):**
- موجودی اول دوره: ۱۰۰ عدد با فی ۵۰,۰۰۰ ریال (ارزش کل ۵,۰۰۰,۰۰۰ ریال).
- خرید ۱۰۰ عدد با فی ۶۰,۰۰۰ ریال (ارزش ۶,۰۰۰,۰۰۰ ریال) ← جمع ۲۰۰ عدد، ارزش ۱۱,۰۰۰,۰۰۰ ریال ← **`AvgUnitCost = 55,000` ریال**.
- فروش ۸۰ عدد + ۲۰ عدد اشانتیون (جمع خروج ۱۰۰ عدد) ← بهای کل تمام‌شده خروج $= 100 \times 55,000 = 5,500,000$ ریال.
- موجودی مانده: ۱۰۰ عدد با ارزش ۵,۵۰۰,۰۰۰ ریال.

### `CF-COST-02`: روش اولین صادره از اولین وارده (`FIFO`)
لایه‌های ورودی (Lot Queue) به ترتیب `(occurred_at ASC, id ASC)` نگهداری می‌شوند: $L_j = (q_j^{\text{rem}}, u_j)$.
در زمان خروج مقدار $q_{\text{out}}$:
- تا وقتی $q_{\text{out}} > 0$ از قدیمی‌ترین لایه دارای $q_j^{\text{rem}} > 0$ مقدار $d = \min(q_{\text{out}}, q_j^{\text{rem}})$ مصرف می‌شود:
  $$\text{OutTotalCost} \mathrel{+}= d \times u_j, \quad q_j^{\text{rem}} \mathrel{-}= d, \quad q_{\text{out}} \mathrel{-}= d$$
- در برگشت از فروش (`RETURN_IN`)، کالا به لایه مربوط به فاکتور مرجع (یا با میانگین آخرین بهای خروج همان کالا در غیاب ارجاع صریح) به انبار بازمی‌گردد.
- در صورت فعال بودن `allow_negative_stock = true` و خروج بیش از موجودی لایه‌ها، مقدار مازاد بدون بهای خرید قطعی علامت‌گذاری‌شده (`COST_UNRESOLVED_NEGATIVE_STOCK`) و در شاخص پوشش داده هزینه کسر می‌شود.

---

## ۴. فرمول‌های فروش، سودآوری و پوشش داده (`CF-PRF`)

### `CF-PRF-01`: فروش خالص، سود ناخالص و سود واقعی
- $\text{GrossSales} = \sum (\text{SALE lines before discount, excl. tax})$
- $\text{TotalDiscounts} = \sum (\text{line\_discount\_total\_irr} + \text{invoice\_discount\_irr})$
- $\text{SalesReturnsNet} = \sum (\text{SALE\_RETURN net excl. tax})$
- $\text{NetSales} = \text{GrossSales} - \text{TotalDiscounts} - \text{SalesReturnsNet}$
- $\text{COGS}_{\text{paid}} = \sum_{\text{non-free sale lines}} \text{OutTotalCost} - \sum_{\text{return\_in}} \text{ReturnCost}$
- $\text{PromoFreeGoodsCost} = \sum_{\text{is\_promotional\_free\_item = true}} \text{OutTotalCost}$
- $\text{GrossProfit} = \text{NetSales} - \text{COGS}_{\text{paid}}$
- $\text{TrueOperatingMargin} = \text{NetSales} - (\text{COGS}_{\text{paid}} + \text{PromoFreeGoodsCost} + \text{UnrecoveredFreight})$
- $\text{GrossMarginPct} = \begin{cases} \text{ROUND}\left(\frac{\text{TrueOperatingMargin}}{\text{NetSales}} \times 100, 2\right) & \text{if } \text{NetSales} > 0 \\ \text{NULL} & \text{otherwise} \end{cases}$

### `CF-PRF-02`: شاخص پوشش داده بهای تمام‌شده (`Cost Coverage %`)
هنگامی که برای برخی اقلام فروخته‌شده، فاکتور خرید یا موجودی اول دوره ثبت نشده است:
$$\text{CostCoveragePct} = \text{ROUND}\left(\frac{\text{NetSalesWithKnownCost}}{\text{TotalNetSales}} \times 100, 2\right)$$
- **قاعده شفافیت:**
  - اگر `CostCoveragePct = 100%`: سطح اطمینان `HIGH`.
  - اگر `80% <= CostCoveragePct < 100%`: سطح اطمینان `MEDIUM`؛ سود فقط برای اقلام دارای بها محاسبه و اقلام فاقد بها در جدول جداگانه افشا می‌شوند (هرگز بهای کالا صفر فرض نمی‌شود!).
  - اگر `CostCoveragePct < 80%` یا `inventory_valuation_method = 'UNSPECIFIED'`: سطح اطمینان `LOW` و در صورت `UNSPECIFIED` بودن سیاست، محاسبه سود ریالی متوقف می‌شود (`VALUATION_POLICY_UNSET`).

---

## ۵. فرمول‌های مغایرت بانکی و نقدینگی (`CF-TRS`)

### `CF-TRS-01`: امتیاز تطبیق خودکار تراکنش بانک (`Bank Reconciliation Score`)
برای هر جفت کاندید `(bank_tx b, payment_or_check r)` با جهت مالی همسو (`واریز <-> RECEIPT_IN`, `برداشت <-> PAYMENT_OUT`):
- **سطح ۱ (`EXACT_CONFIRMED`, امتیاز `1.0000`):**
  `b.amount == r.amount` و `b.reference_no == r.tracking_code` (یا `sayad_id`) و `|b.date - r.date| <= 1 day`.
- **سطح ۲ (`PROBABILISTIC_SUGGESTED`, امتیاز `0.7000 .. 0.9499`):**
  $$\text{Score} = 0.55 \times S_{\text{amount}} + 0.30 \times S_{\text{date}} + 0.15 \times S_{\text{text}}$$
  - $S_{\text{amount}} = 1$ اگر $|b.\text{amt} - r.\text{amt}| = 0$؛ اگر اختلاف $\le \text{amount\_tolerance\_irr}$ (مثلاً کارمزد شاپرک/پایا) مقدار $0.85$؛ وگرنه $0$.
  - $S_{\text{date}} = \max\left(0, 1 - \frac{|b.\text{date} - r.\text{date}|}{\text{date\_tolerance\_days} + 1}\right)$.
  - $S_{\text{text}} = \text{similarity\_trgm}(b.\text{description\_raw}, r.\text{contact\_name/ref})$.
- هر تطبیق زیر `0.7000` رد می‌شود؛ تطبیق بین `0.7000` تا `0.9999` حتماً نیازمند تایید انسانی (`MANUAL_CONFIRMED`) است.

### `CF-TRS-02`: پیش‌بینی کوتاه‌مدت نقدینگی (`Cash Flow Forecast — 3 Scenarios`)
با افق $H \in \{7, 14, 30\}$ روز:
- $\text{OpeningCash} = \text{LatestVerifiedBankAndCashBalance}$
- **سناریو پایه (`Base`):** چک‌های دریافتی با احتمال وصول میانگین تاریخی مشتری + ۱۰۰٪ چک‌های پرداختی + مطالبات جاری سررسیدشونده با نرخ وصول تاریخی ($w_1$) منهای پرداختنی‌های سررسیدشونده.
- **سناریو محافظه‌کارانه (`Conservative`):** فقط چک‌های تاییدشده با سابقه وصول تمیز (بدون احتساب مطالبات بدون چک و مشتریان پرریسک) منهای ۱۰۰٪ چک‌ها و تعهدات پرداختنی سررسیدشونده.
- **سناریو خوش‌بینانه (`Optimistic`):** فرض وصول ۱۰۰٪ چک‌های دریافتی و فاکتورهای سررسیدشونده در بازه $H$.

---

## ۶. فرمول پیش‌نویس مالیات بر ارزش افزوده (`CF-TAX`)
- $\text{OutputVAT} = \sum_{\text{Posted SALE}} \text{tax\_total\_irr} - \sum_{\text{Posted SALE\_RETURN}} \text{tax\_total\_irr}$
- $\text{InputVAT}_{\text{eligible}} = \sum_{\text{Posted PURCHASE with valid tax info}} \text{tax\_total\_irr} - \sum_{\text{Posted PURCHASE\_RETURN}} \text{tax\_total\_irr}$
- $\text{NetVATDraft} = \text{OutputVAT} - \text{InputVAT}_{\text{eligible}}$
  - اگر مثبت باشد: برآورد مازاد بدهی ارزش افزوده؛ اگر منفی باشد: برآورد اعتبار مالیاتی قابل انتقال (صراحتاً با برچسب **«تحلیل پیش‌نویس غیررسمی»**).
