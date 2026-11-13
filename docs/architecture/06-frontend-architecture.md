# 06 — معماری Frontend و رابط مکالمه‌ای (`Frontend & Conversational UI Architecture`)

این سند معماری لایه نمایش وب و موبایل‌وب (`Next.js App Router + TypeScript + Tailwind CSS RTL`) را تعریف می‌کند.

---

## ۱. اصول حاکم بر Frontend
1. **منع مطلق محاسبه مالی در کلاینت:** کلاینت هیچ‌گاه تخفیف، مالیات، سود ناخالص، مانده مطالبات یا تبدیل واحد انبار را محاسبه نمی‌کند؛ فقط مقادیر قطعی (`*_irr` و `*_display`) دریافت‌شده از سرور را با فرمت عددی فارسی نمایش می‌دهد.
2. **طراحی RTL بومی و تایپوگرافی خوانا:** راست‌به‌چپ کامل (`dir="rtl"`), فونت استاندارد `Vazirmatn` با `tabular-nums` برای هم‌ترازی ستون‌های مالی در جداول.
3. **بدون افشای کلید یا توکن در مرورگر:** فراخوانی LLM و S3 فقط از طریق Backend انجام می‌شود؛ مرورگر صرفاً Access Token کوتاه‌عمر و لینک‌های Pre-signed دو دقیقه‌ای می‌گیرد.
4. **تفکیک داده‌های تاییدنشده (`Pending`) در تمام صفحات:** هر گزارش یا KPI دارای برچسب شفاف `HIGH / MEDIUM / LOW` و Badge تعداد اسناد `Needs Review` است.

---

## ۲. نقشه ۱۶ صفحه اصلی (`Application Routes & Views`)

| # | مسیر (`Route`) | عنوان صفحه | نقش‌های مجاز اصلی | قابلیت کلیدی |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `/login` & `/invite` | ورود، MFA و پذیرش دعوت‌نامه | همه | ورود موبایل/ایمیل، انتخاب سازمان فعال (`Multi-Org Switcher`) |
| **2** | `/onboarding` | راه‌اندازی سازمان و سیاست مالی | `OWNER`, `CFO` | انتخاب نوع کسب‌وکار، تقویم سال مالی، انتخاب روش موجودی (`FIFO`/`Avg`) |
| **3** | `/workspace` | **میز کار مکالمه‌ای هوشمند (خانه اصلی)** | تمام نقش‌ها (فیلترشده) | گفتگوی متنی + پنل ویجت‌های اعلامی کنار گفتگو + شواهد فوری |
| **4** | `/dashboard` | داشبورد مدیریتی روزانه (`RPT-DASH-001`) | `OWNER`, `CEO`, `CFO`, `SENIOR_ACC` | خلاصه نقدینگی، فروش، مطالبات معوق و چک‌های پیش‌رو |
| **5** | `/documents/upload` | بارگذاری سریع و دسته‌ای اسناد | `OPERATOR`, `ACCOUNTANT`, `INV_MGR` | آپلود عکس/PDF/ZIP، ادغام چند عکس به یک PDF، نمایش هشدار تکراری |
| **6** | `/documents/review` | **میز کار بازبینی OCR (Split-Screen)** | `ACCOUNTANT`, `SENIOR_ACC`, `CFO` | تصویر سند با باکس مختصات `bbox` در کنار فرم و جدول خطادار + دکمه Verify |
| **7** | `/approvals` | کارتابل تایید نهایی و دوامضایی (`approval_requests`) | `CFO`, `OWNER`, `CEO`, `SENIOR_ACC` | لیست اسناد `Verified` / بالای سقف منتظر `Posted` + مقایسه و رد/تایید |
| **8** | `/sales/invoices` | فاکتورهای فروش، برگشت از فروش و اشانتیون | `ACCOUNTANT`, `SALES_MGR`, `CFO` | لیست فیلترپذیر، مشاهده زنجیره شواهد و صدور پیش‌نویس یا `Post` |
| **9** | `/purchases/invoices` | فاکتورهای خرید و برگشت از خرید | `ACCOUNTANT`, `SENIOR_ACC`, `CFO` | ثبت و ممیزی فاکتور خرید، تاثیر بر بهای تمام‌شده کالا |
| **10** | `/contacts` | طرف‌حساب‌ها و حل ابهام ادغام (`entity_match_candidates`) | `ACCOUNTANT`, `SALES_MGR`, `CFO` | کارتابل پیشنهادهای ادغام مشتری/تامین‌کننده، سقف اعتبار و گردش حساب |
| **11** | `/treasury` | بانک، صندوق، چک صیادی و مغایرت‌گیری (`TRS-*`) | `ACCOUNTANT`, `SENIOR_ACC`, `CFO` | واردکردن صورتحساب بانک، تایید تطبیق احتمالی، ردیابی وضعیت چک صیادی |
| **12** | `/inventory` | کالا، واحد سنجش، کاردکس و انبارگردانی (`INV-*`) | `INV_MGR`, `ACCOUNTANT`, `CFO` | ضریب تبدیل کارتن/عدد، انتقال بین انبار، هشدار کسری (بدون ستون سود برای انباردار) |
| **13** | `/profitability` | سودآوری کالا، مشتری و پوشش بها (`PRF-*`) | `OWNER`, `CEO`, `CFO`, `SENIOR_ACC` | تفکیک `GrossMarginPct` و `TrueOperatingMarginPct` + `CostCoveragePct` |
| **14** | `/reports` | مرکز گزارش‌های نسخه‌پذیر (`v1 -> v2`) و خروجی رسمی | بر اساس مجوز ماژول | اجرای گزارش، مقایسه `v1` با `v2`، دانلود `PDF / Excel / CSV / JSON` |
| **15** | `/tax` | آماده‌سازی و اعتبارسنجی مالیاتی (`TAX-PREP`, `TAX-VAL`) | `ACCOUNTANT`, `SENIOR_ACC`, `CFO` | پیش‌نویس VAT، بررسی شناسه ۱۶۹، نمایش قفل صریح `TAX-SUB-*` در v1 |
| **16** | `/settings/integrations` | تنظیمات سازمان، RBAC، شعب و وضعیت Windows Agent | `OWNER`, `CFO` | مدیریت نقش‌ها، سقف دوامضایی، وضعیت Sync هلو/سپیدار و لغو Agent |

---

## ۳. قرارداد ۱۷ جزء رابط کاربری مکالمه‌ای (`Conversation UI Component Contract`)

در صفحه `/workspace`، پیام‌های دستیار هوشمند صرفاً متن خام نیستند؛ بلکه یک آرایه ساختاریافته از اجزای **Declarative UI** هستند که Backend بر اساس خروجی `ErpkianReportEnvelope` تولید می‌کند:

| # | شناسه جزء (`ComponentType`) | کاربرد عملیاتی | منبع داده سرور |
| :-: | :--- | :--- | :--- |
| **1** | `NarrativeExplanationBlock` | متن فارسی توضیحی تولیدشده از روی اعداد واقعی Envelope | `ai_narrative` (Explain-Only) |
| **2** | `KpiSummaryStrip` | کارت‌های ۳ تا ۵ شاخص کلیدی (با علامت `IRR`/`IRT` و مقایسه درصدی) | `summary_metrics[]` |
| **3** | `ConfidenceAndWarningBanner` | نوار هشدار زرد/قرمز برای `MEDIUM/LOW Confidence` یا اسناد معلق | `data_snapshot` + `warnings_and_limitations[]` |
| **4** | `InteractiveDataTable` | جدول صفحه‌بندی‌شده مرتب‌پذیر (مثلاً سنی مطالبات یا کالاهای زیان‌ده) | `rows[]` |
| **5** | `EvidenceDrawerTrigger` | دکمه «مشاهده ۵ سند مبدأ» روی هر عدد و بازکردن کشوی تصویر/شواهد | `evidences[]` |
| **6** | `ClarificationPromptCard` | فرم کوتاه تعاملی برای رفع ابهام پارامتر (مثلاً انتخاب بازه شمسی یا شعبه) | `missing_slots_schema` |
| **7** | `DocumentPreviewWidget` | پیش‌نمایش تصویر سند اسکن‌شده به همراه کادرهای خطای OCR | `document_pages` + `extracted_fields` |
| **8** | `EntityMatchApprovalCard` | کارت مقایسه «مشتری جدید vs مشتری موجود» با دکمه تایید ادغام یا ایجاد جدید | `entity_match_candidates` |
| **9** | `ApprovalGateActionCard` | کارت تایید دوامضایی سند بالای سقف یا بازگشایی دوره برای `CFO/OWNER` | `approval_requests` |
| **10** | `AgingBucketChartWidget` | نمودار میله‌ای سبدهای سنی مطالبات (`جاری`, `۱-۳۰`, `۳۱-۶۰`, `۶۱-۹۰`, `+۹۰`) | `CF-AR-02` rows |
| **11** | `CashFlowForecastChartWidget` | نمودار خطی ۳ سناریوی نقدینگی ۷ تا ۳۰ روزه (پایه، محافظه‌کارانه، خوش‌بینانه) | `CF-TRS-02` |
| **12** | `ReconciliationMatchCard` | کارت جفت تراکنش بانک و پرداخت پیشنهادی با امتیاز تطبیق و دکمه تایید/رد | `reconciliation_matches` |
| **13** | `StockAlertListCard` | لیست کالاهای زیر نقطه سفارش یا دارای موجودی منفی | `INV-REORDER-001` |
| **14** | `TaxReadinessChecklistWidget` | چک‌لیست خطاهای کد ملی/اقتصادی و یادآور غیررسمی بودن پیش‌نویس | `TAX-PREP-READY-001` |
| **15** | `ReportVersionDiffCard` | نمایش تغییرات بین نسخه `v1` و `v2` پس از ثبت اسناد جدید | `RPT-DIFF-001` |
| **16** | `ExportDownloadActionBar` | دکمه‌های دانلود رسمی `PDF`, `Excel (4-Sheet)`, `CSV` با نمایش وضعیت Job | `report_outputs` |
| **17** | `NextBestActionChips` | دکمه‌های اقدام پیشنهادی بعدی (مثلاً «بازبینی ۲ فاکتور معلق») | `next_best_actions[]` |

---

## ۴. پروتکل رندر اعلامی بدون منطق مالی (`Declarative Widget Rendering Protocol`)

```text
[Backend NestJS]
  --> ارسال JSON شامل:
      {
        "message_id": "...",
        "widgets": [
          { "type": "ConfidenceAndWarningBanner", "props": { ... } },
          { "type": "KpiSummaryStrip", "props": { "metrics": [...] } },
          { "type": "InteractiveDataTable", "props": { "columns": [...], "rows": [...] } }
        ]
      }
[Next.js WidgetRegistry]
  --> lookup(widget.type) -> کامپوننت React تایپ‌شده را با Zod Schema ولیدیت و رندر می‌کند.
  --> در صورت خطای کاربر یا کلیک روی دکمه (مثل Approve Match)، درخواست REST با Idempotency-Key به Backend ارسال می‌شود؛
      هیچ محاسبه‌ای در کلاینت اجرا نمی‌شود و کل جدول پس از تایید از Backend دوباره دریافت می‌گردد.
```

---

## ۵. مدیریت وضعیت (`State Management`) و کارکرد بدون AI
- **Server State:** `TanStack Query` با کلیدهای شامل `(organization_id, branch_scope_id, filters)`؛ با تغییر سازمان فعال، تمام کش‌ها فورا `invalidate` و پاک می‌شوند (`Zero Cross-Org Cache Leak`).
- **Real-Time Progress:** اتصال `Server-Sent Events (SSE)` برای استریم متن توضیحی AI و اطلاع از اتمام کارهای `OCR` و `Export PDF`.
- **حالت مستقل از AI:** تمام ۱۶ صفحه (داشبورد، OCR Review، فاکتورها، خزانه، انبار و گزارش‌ها) کاملاً مستقل از پنل گفتگو کار می‌کنند تا در صورت قطع سرویس LLM، فعالیت روزانه شرکت متوقف نشود.
