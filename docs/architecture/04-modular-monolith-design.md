# 04 — طراحی Modular Monolith و نگاشت ۲۵ ماژول Backend

**نمودارهای مرجع:** [`diagrams/component-architecture.mmd`](./diagrams/component-architecture.mmd) و [`diagrams/module-dependencies.mmd`](./diagrams/module-dependencies.mmd)

این سند ساختار داخلی هسته Backend (`NestJS`) را در قالب **۲۵ ماژول با مرزهای دقیق** طراحی می‌کند و مالکیت انحصاری تمام **۱۰۹ جدول مرحله سوم** را میان این ماژول‌ها تقسیم می‌نماید.

---

## ۱. جدول جامع ۲۵ ماژول Backend و مالکیت جداول

> **قانون طلایی مالکیت داده (`Table Ownership`):** هر جدول از ۱۰۹ جدول مدل داده (`docs/data-model/02-data-dictionary.md`) دقیقاً متعلق به **یک ماژول واحد** است. سایر ماژول‌ها فقط مجاز به فراخوانی `Public Facade / Service Port` یا اشتراک در `Domain Events` هستند و هرگز مستقیماً روی جدول ماژول دیگر `INSERT/UPDATE/JOIN` مخفی نمی‌زنند.

| # | نام ماژول (`NestJS Module`) | مسئولیت اصلی | جداول تحت مالکیت انحصاری (از ۱۰۹ جدول + جدول Outbox زیرساختی) | وابستگی مجاز ماژول‌ها | وابستگی ممنوع | رویدادهای منتشرشده (`Pub`) |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `common-kernel` | ابزارهای پایه قطعی (`DecimalMath`, `JalaliCalendar`, `TenantTransactionRunner`, خطاهای استاندارد) | *(بدون جدول دامنه)* | ندارد (پایه‌ترین لایه) | همه ماژول‌های دامنه | — |
| **2** | `auth` | احراز هویت، JWT، Refresh Rotation، MFA و کلید دستگاه | `users` | `common-kernel`, `audit-security` | ماژول‌های مالی و انبار | `UserAuthenticated`, `AuthFailed` |
| **3** | `organizations` | مدیریت Tenant، پروفایل صنعت، شعب و تنظیمات عملیاتی | `business_types`, `organizations`, `business_profiles`, `organization_settings`, `branches`, `invitations` | `common-kernel`, `auth` | ماژول‌های عملیاتی | `OrganizationCreated`, `SettingsUpdated` |
| **4** | `rbac` | عضویت سازمانی، نقش‌های ۹گانه، مجوزها و اسکوپ شعبه | `organization_memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles` | `common-kernel`, `organizations`, `auth` | گزارش/مالی مستقیم | `MembershipRoleChanged` |
| **5** | `fiscal` | سال و دوره مالی، قفل/بازگشایی دوره، ارز و سیاست ارزش‌گذاری | `currencies`, `exchange_rates`, `fiscal_years`, `fiscal_periods`, `period_locks`, `accounting_policies` | `common-kernel`, `organizations`, `rbac` | `invoices`, `payments` | `FiscalPeriodClosed`, `FiscalPeriodReopened`, `ValuationPolicySet` |
| **6** | `contacts` | طرف‌حساب‌ها، نقش تجاری، شناسه‌ها، آدرس و تطبیق موجودیت | `contacts`, `contact_roles`, `contact_identifiers`, `contact_addresses`, `entity_match_candidates`, `entity_merge_history` | `common-kernel`, `organizations` | `invoices`, `payments` (برای جلوگیری از چرخه) | `ContactMerged`, `EntityCandidateCreated` |
| **7** | `products` | کاتالوگ کالا، بارکد، واحدهای سنجش، ضرایب تبدیل و انبارها | `units_of_measure`, `unit_conversions`, `product_categories`, `products`, `product_identifiers`, `product_units`, `warehouses`, `inventory_locations` | `common-kernel`, `organizations`, `fiscal` | `inventory`, `invoices` | `ProductUoMUpdated` |
| **8** | `documents` | دریافت فایل، هش SHA-256، نسخه‌بندی، صفحات، روابط M:N و لاگ دسترسی | `document_types`, `document_batches`, `document_storage_objects`, `documents`, `document_versions`, `document_pages`, `document_relations`, `document_access_logs` | `common-kernel`, `organizations`, `audit-security` | محاسبات مالی | `DocumentUploaded`, `DocumentVerified`, `DocumentRejected` |
| **9** | `ocr-ingestion` | ارسال به FastAPI، مدیریت تلاش‌های استخراج، فیلدها، جداول و اصلاح انسانی | `extraction_model_versions`, `extraction_jobs`, `extraction_attempts`, `ocr_page_results`, `extracted_fields`, `extracted_tables`, `extracted_table_rows`, `extracted_table_cells`, `extraction_reviews`, `extraction_corrections` | `common-kernel`, `documents`, `contacts`, `products`, `workflow` | `invoices` (ثبت مستقیم در `Posted` ممنوع) | `OcrExtractionCompleted`, `OcrReviewSubmitted` |
| **10** | `invoices` | چرخه عمر فاکتور فروش/خرید/برگشتی، ردیف‌ها، اشانتیون، تعدیلات فاکتور و قلاب دفترکل | `invoices`, `invoice_lines`, `invoice_adjustments`, `accounting_entries` *(PROVISIONAL)*, `accounting_entry_lines` *(PROVISIONAL)* | `common-kernel`, `fiscal`, `contacts`, `products`, `documents`, `workflow`, `audit-security` | `ai-orchestration`, `reporting` | `InvoiceVerified`, `InvoicePosted`, `InvoiceReversed` |
| **11** | `payments` | ثبت دریافت/پرداخت و تخصیص چندبه‌چند `payment_allocations` (صریح/FIFO) | `payments`, `payment_allocations` | `common-kernel`, `fiscal`, `contacts`, `invoices`, `documents`, `audit-security` | `inventory`, `ocr-ingestion` | `PaymentPosted`, `AllocationCreated`, `PaymentReversed` |
| **12** | `treasury` | حساب‌های بانکی، تراکنش‌های بانکی، چک‌های صیادی و تاریخچه چک | `bank_accounts`, `bank_transactions`, `checks`, `check_status_history`, `financial_adjustments` | `common-kernel`, `fiscal`, `contacts`, `payments`, `audit-security` | `inventory`, `products` | `ChequeStatusChanged`, `ChequeBounced`, `BankTxImported` |
| **13** | `inventory` | دفتر کل حرکات انبار، انتقال بین انبار، تعدیل انبارگردانی و `stock_snapshots` | `inventory_movements`, `inventory_adjustments`, `stock_snapshots` | `common-kernel`, `fiscal`, `products`, `invoices` (یا via port/event), `audit-security` | `treasury`, `payments` | `StockMoved`, `NegativeStockOccurred`, `StockBelowReorder` |
| **14** | `reconciliation` | قوانین، اجرا، تطبیق‌های قطعی/احتمالی و استثناهای باز (بانک/طرف‌حساب/انبار) | `reconciliation_rules`, `reconciliation_runs`, `reconciliation_matches`, `reconciliation_exceptions` | `common-kernel`, `treasury`, `payments`, `inventory`, `audit-security` | `ai-orchestration` | `ReconciliationRunCompleted`, `ExceptionFlagged` |
| **15** | `profitability` | موتور بهای تمام‌شده (`FIFO`/`Weighted Avg`)، سود ناخالص، واقعی و شاخص پوشش | *(مصرف داده‌های خواندنی از Portهای `invoices` و `inventory` + ثبت نتیجه در `reporting`/`processing`)* | `common-kernel`, `fiscal`, `invoices`, `inventory` | تغییر مستقیم روی جداول مالی | `ProfitabilityCalculated`, `LowMarginDetected` |
| **16** | `tax` | آماده‌سازی پیش‌نویس VAT، تفکیک معاف/مشمول و اعتبارسنجی شناسه ۱۶۹ (`TAX-SUB-*` قفل) | *(مصرف Portهای `invoices`, `contacts`, `products`, `fiscal`)* | `common-kernel`, `fiscal`, `invoices`, `contacts`, `products` | اتصال مستقیم ارسال مودیان در v1 | `TaxDraftPrepared` |
| **17** | `reporting` | تعریف گزارش، Snapshot تغییرناپذیر، نسخه‌های `v1->v2`، شاخص‌ها و شواهد | `report_definitions`, `report_data_snapshots`, `report_executions`, `report_versions`, `report_metrics`, `report_evidences`, `report_outputs` | `common-kernel`, `fiscal`, `invoices`, `payments`, `treasury`, `inventory`, `reconciliation`, `profitability`, `tax` | نوشتن در جداول عملیاتی | `ReportVersionGenerated` |
| **18** | `export` | رندر آسنکرون `PDF RTL`، `Excel 4-Sheet`، `CSV UTF-8 BOM`، `JSON` و ذخیره در S3 | *(دسترسی از طریق Portهای `reporting` و `documents`)* | `common-kernel`, `reporting`, `documents`, `audit-security` | منطق محاسبه مالی جدید | `ReportExportReady` |
| **19** | `workflow` | کاتالوگ ۶۲ سرویس، State Machine گردشکارها، پردازش، هشدار/خطا و تایید دوامضایی | `service_definitions`, `workflow_definitions`, `workflow_executions`, `workflow_step_executions`, `processing_jobs`, `processing_results`, `processing_result_sources`, `processing_warnings`, `processing_errors`, `approval_requests` | `common-kernel`, `rbac`, `audit-security`, `notifications` | وابستگی به LLM برای گام‌های قطعی | `WorkflowPaused`, `ApprovalRequested`, `ApprovalDecided` |
| **20** | `ai-orchestration` | مدیریت گفتگوها، Prompt Guard، Intent Router، Tool Registry و Explain-Only | `conversations`, `conversation_contexts`, `conversation_messages`, `tool_invocations`, `assistant_recommendations`, `user_feedback` | `common-kernel`, `rbac`, `workflow`, `reporting`, `documents` | اجرای مستقیم SQL روی جداول مالی و تغییر وضعیت `Posted` | `ToolInvocationLogged` |
| **21** | `integrations` | اتصال هلو/سپیدار/راهکاران، Import Batch/Row، Cursor خطا و نگاشت کلید خارجی | `source_systems`, `integration_connections`, `external_entity_mappings`, `sync_jobs`, `sync_cursors`, `sync_errors`, `import_batches`, `import_rows` | `common-kernel`, `contacts`, `products`, `invoices`, `treasury`, `documents`, `audit-security` | نوشتن دوطرفه در v1 | `ImportBatchCompleted`, `SyncConflictFound` |
| **22** | `windows-agent-gateway` | Endpointهای دریافت بسته Agent ویندوز، Heartbeat، احراز دستگاه و کنترل ابطال | *(از `integration_connections` در ماژول `integrations` و `security_events` استفاده می‌کند)* | `common-kernel`, `integrations`, `audit-security` | منطق محاسبه گزارش | `AgentPayloadReceived` |
| **23** | `audit-security` | ثبت تغییرناپذیر ممیزی (`INSERT/SELECT`) و رویدادهای امنیتی + Outbox جدول زیرساخت | `audit_logs`, `security_events`, `data_retention_policies` *(+ جدول زیرساختی `transactional_outbox` پیشنهادی)* | `common-kernel` | تمام ماژول‌های دامنه (برای جلوگیری از چرخه) | `SecurityAlertTriggered` |
| **24** | `notifications` | ارسال اعلان‌های درون‌برنامه، پیامک و ایمیل با تنظیمات کاربر | `notifications`, `notification_preferences` | `common-kernel`, `organizations` | ماژول‌های مالی | `NotificationDispatched` |
| **25** | `subscriptions` | پلن‌های اشتراک، محدودیت مصرف (`OCR pages`, `AI tokens`, `Users`) و سهمیه | `subscription_plans`, `subscriptions`, `usage_records`, `usage_limits` | `common-kernel`, `organizations`, `audit-security` | مسدودسازی دسترسی خواندن داده‌های تاریخی | `UsageQuotaExceeded` |

> **راستی‌آزمایی شمارش ۱۰۹ جدول مرحله سوم:**  
> `auth(1) + organizations(6) + rbac(5) + fiscal(6) + contacts(6) + products(8) + documents(8) + ocr(10) + invoices(5 incl. 2 provisional) + payments(2) + treasury(5) + inventory(3) + reconciliation(4) + reporting(7) + workflow(10) + ai(6) + integrations(8) + audit(3) + notifications(2) + subscriptions(4) = 109 جدول دقیق`.  
> *(تبصره معماری Stage 5: جدول `transactional_outbox` یک جدول زیرساختی پیشنهادی برای تضمین صف است و جزء ۱۰۹ جدول دامنه شمرده نمی‌شود — وضعیت: `PROPOSED_FOR_OWNER_APPROVAL`).*

---

## ۲. جلوگیری از چرخه وابستگی (`DAG Enforcement`)

در نمودار `module-dependencies.mmd`، روابط مستقیم (`Direct DI`) فقط از لایه‌های بالاتر به لایه‌های پایین‌تر (به صورت یک **گراف جهت‌دار غیرمدور - DAG**) مجاز است:
- مثلاً وقتی فاکتور `Posted` می‌شود (`invoices`) و باید حرکت انبار ثبت گردد: ماژول `invoices` از طریق **رابط قراردادی `IInventoryPostingPort`** یا فراخوانی هم‌تراکنش در **Orchestrator تراکنش‌محور (`PostingTransactionCoordinator`)** که به هر دو ماژول وابسته است، کار را انجام می‌دهد تا هرگز `invoices <-> inventory` چرخه متقابل نسازند.
- هیچ ماژولی حق ندارد از لایه پایین‌تر به لایه بالاتر (مثلاً `contacts` به `invoices`) وابستگی DI داشته باشد؛ ارتباط معکوس فقط با Domain Event انجام می‌شود.

---

## ۳. معیارهای عینی استخراج ماژول به میکروسرویس (`Microservice Extraction Criteria`)

هر ماژول در Modular Monolith تا زمانی که شرایط زیر برقرار نشود، جدا **نمی‌شود**؛ اما ماژول‌های زیر به دلیل ایزولاسیون طبیعی، اولین کاندیدهای استخراج آینده‌اند:

| اولویت استخراج | ماژول کاندید | شاخص آستانه استخراج (`Trigger Threshold`) | پیش‌نیاز جداسازی بدون تخریب |
| :---: | :--- | :--- | :--- |
| **۱ (از روز اول مجزا)** | **`ocr-ingestion` (بخش اجرا در FastAPI)** | از MVP به دلیل نیاز به کتابخانه‌های پایتون و CPU/GPU مستقل جداست | ارتباط صرفاً با BullMQ و Storage Key |
| **۲** | **`export` (PDF/Excel Render)** | > `500` رندر PDF همزمان در ساعت یا مصرف > 70% RAM API Worker | در حال حاضر در Worker Pool جداگانه اجرا می‌شود |
| **۳** | **`integrations` + `windows-agent-gateway`** | > `2,000` سازمان متصل با همگام‌سازی مداوم ۱۰ دقیقه‌ای | جداسازی پروسس Worker با صف `q.integration.sync` |
| **۴** | **`ai-orchestration`** | > `50` درخواست مکالمه‌ای همزمان در ثانیه یا مدل‌های Agent طولانی‌مدت | حفظ قرارداد فراخوانی REST/Internal به موتور قطعی NestJS |
