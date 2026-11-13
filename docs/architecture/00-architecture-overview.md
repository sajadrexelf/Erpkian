# 00 — نمای کلی معماری فنی پلتفرم Erpkian (`Architecture Overview`)

**پروژه:** `Erpkian` — پلتفرم هوشمند حسابداری، هوش اسناد و تحلیل مالی ویژه شرکت‌های پخش، عمده‌فروشی و کسب‌وکارهای ایرانی  
**مرحله:** پنجم (`Stage 5: Technical Architecture & Implementation Blueprint`)  
**وضعیت پیاده‌سازی کد اجرایی:** `NOT IMPLEMENTED` *(این مجموعه صرفاً نقشه راه و مشخصات معماری فنی بدون کد اجرایی در مخزن است)*  
**مبنای بالادستی:**  
- مرحله دوم: `docs/PRD.md`  
- مرحله سوم: `docs/data-model/00`..`15` (`109` جدول در `13` دامنه)  
- مرحله چهارم: `docs/processing/00`..`12` (`62` خدمت، `10` گردشکار، `9` نقش، `30` سناریو، `81` آزمون P0)

---

## ۱. چکیده اجرایی معماری (`Executive Summary`)

معماری هدف پلتفرم **Erpkian** به صورت یک **Modular Monolith دقیق در لایه Backend (`NestJS + TypeScript`)** در کنار یک **سرویس ایزوله پردازش تصویر و OCR (`Python + FastAPI`)**، یک **رابط کاربری مکالمه‌ای-اعلامی (`Next.js + TypeScript RTL`)** و یک **عامل محلی ویندوزی یک‌طرفه (`.NET 8 Windows Agent`)** طراحی شده است. تمام داده‌های مالی و عملیاتی در **PostgreSQL 16+** با مدل **۱۰۹ جدولی مرحله سوم**، جداسازی فیزیکی چندسازمانی (**`FORCE ROW LEVEL SECURITY` + `Composite Foreign Keys`**) و الگوی **Outbox + `Redis / BullMQ`** مدیریت می‌شوند.

### چرا Modular Monolith به جای Microservices در فاز اول؟
1. **یکپارچگی اتمیک تراکنش‌های مالی (`ACID`):** ثبت قطعی فاکتور (`Posted`) باید همزمان ردیف فاکتور، حرکت انبار (`inventory_movements`)، تخصیص پرداخت (`payment_allocations`)، لاگ ممیزی (`audit_logs`) و رویداد Outbox را در یک تراکنش واحد PostgreSQL ثبت کند؛ توزیع کردن این عملیات بین چند میکروسرویس باعث پیچیدگی Saga و ریسک مغایرت مالی در MVP می‌شود.
2. **همراستایی با مدل داده مرحله سوم:** ۱۰۹ جدول از پیش با کلیدهای خارجی مرکب `(organization_id, id)` به هم متصل‌اند. Modular Monolith با مرزهای سخت ماژولار (`25` ماژول)، مالکیت دقیق جداول را حفظ کرده و همزمان قابلیت استخراج سرویس‌های پرمصرف (مانند `OCR`, `Export`, `Integration Sync`) به سرویس مستقل در آینده را تضمین می‌کند.
3. **چابکی تیم و نگهداشت‌پذیری در زیرساخت ایران:** استقرار ۵ تا ۶ کانتینر مشخص با هزینه‌ی عملیاتی پایین و بدون سربار Mesh/Kafka در فاز اول.

---

## ۲. ده اصل بنیادین معماری (`Core Architectural Principles`)

1. **جداسازی مطلق موتور قطعی از هوش مصنوعی (`Deterministic Engine vs LLM`):** هیچ‌گونه محاسبه مالی، مالیات، موجودی، بهای تمام‌شده (`FIFO`/`Weighted Avg`)، گردکردن ریال یا تطبیق توسط LLM انجام نمی‌شود. LLM تنها نقش تشخیص نیت (`Intent Routing`)، راهنمایی تکمیل ورودی، استخراج اولیه ساختار از خروجی OCR و توضیح فارسی نتایج قطعی (`Explain-Only`) را بر عهده دارد.
2. **معماری `Sub-ledger First` (`CONFIRMED`):** در v1 هسته عملیاتی بر مبنای فاکتورها، دریافت/پرداخت‌ها، تخصیص‌ها، چک‌های صیادی، تراکنش‌های بانکی و حرکات انبار عمل می‌کند؛ جداول دفترکل دوطرفه (`accounting_entries`, `accounting_entry_lines`) به عنوان قلاب توسعه آتی (`PROVISIONAL`) حفظ می‌شوند.
3. **واحد پول پایه کاننیکال ریال (`IRR`) و دقت اعشار قطعی:** تمام مبالغ عملیاتی با `NUMERIC(18,0)` در مقیاس ریال (`*_irr`) و فی/ضرایب با `NUMERIC(20,4)` / `NUMERIC(18,6)` ذخیره و با **`Decimal/BigInt` + `Half-to-Even`** محاسبه می‌شوند. استفاده از `FLOAT`/`DOUBLE` و منطق مالی در Frontend مطلقاً ممنوع است.
4. **دفاع در عمق چندسازمانی (`Defense-in-Depth Multi-Tenancy`):** جداسازی بین سازمان‌ها همزمان در ۳ لایه اعمال می‌شود: (۱) `NestJS AuthGuard + RBAC Guard` با `branch_scope_id`، (۲) `Composite FKs (organization_id, id)`، و (۳) `PostgreSQL FORCE RLS` با سیاست `Fail-Closed` (`SET LOCAL app.current_organization_id`).
5. **تغییرناپذیری تاریخچه و شواهد (`Immutability & End-to-End Provenance`):** سند خام در Object Storage (`v1` اصل)، ردیف‌های `Posted` مالی، `audit_logs` و `report_data_snapshots` هرگز ویرایش یا حذف مخرب نمی‌شوند؛ اصلاح فقط با سند معکوس (`Reversed`)، تعدیل تاییدشده یا نسخه جدید (`report_versions v2`) رخ می‌دهد.
6. **گیت اجباری کنترل انسانی برای OCR و مبالغ بالا (`Human-in-the-Loop & Dual Approval`):** خروجی OCR در هیچ حالتی مستقیماً `Posted` نمی‌شود. علاوه بر آن، اسناد بالای `require_dual_approval_above_irr` ملزم به تایید دوم (`approval_requests`) توسط فردی متفاوت از درخواست‌کننده هستند.
7. **عدم اختلاط داده‌های تاییدنشده در گزارش رسمی:** اسناد `Needs Review` و `Verified` وارد جمع قطعی نمی‌شوند مگر با برچسب صریح پیش‌نویس، و همواره تعداد آن‌ها در `report_data_snapshots.pending_document_count` افشا می‌گردد.
8. **اطمینان تحویل رویدادها با الگوی `Transactional Outbox`:** تغییر وضعیت دامنه و درج رویداد صف در یک تراکنش PostgreSQL انجام می‌شود تا بین دیتابیس و `Redis/BullMQ` ناهماهنگی رخ ندهد.
9. **یکپارچه‌سازی یک‌طرفه در v1 (`read_only = true`):** اتصال به هلو، سپیدار و راهکاران از طریق `.NET Windows Agent` یا فایل خروجی در نسخه اول اکیداً خواندنی است.
10. **تفکیک اکید خدمات مالیاتی (`LOCKED_IN_V1` برای ارسال رسمی):** خدمات `TAX-PREP-*` و `TAX-VAL-*` آماده پیاده‌سازی‌اند اما `TAX-SUB-MOADIAN-001` و `TAX-SUB-RETURN-001` در نسخه اول قفل و غیرفعال‌اند.

---

## ۳. وضعیت تصمیم‌گیری و رفع تعارض‌ها (`Decision Status Legend`)

در تمام ۲۵ سند مرحله پنجم، وضعیت هر تصمیم، انتخاب فناوری یا اصلاح تناقض صراحتاً با یکی از ۴ برچسب زیر مشخص شده است:

| برچسب وضعیت | معنا و دامنه اعتبار |
| :--- | :--- |
| **`CONFIRMED`** | تصمیم تثبیت‌شده از PRD، اصول بنیادین معماری و مبنای تأییدشده مراحل ۲ تا ۴ (`CONFIRMED_BASELINE`). |
| **`PROPOSED_FOR_OWNER_APPROVAL`** | پیشنهاد کارشناسی تیم معماری (شامل تصمیم‌های باز `OD-01, 03, 04, 05, 12`، اصلاحات ممیزی مرحله ۴ و اهداف کارایی) که پیش از شروع کدنویسی نیازمند امضای مالک محصول است. |
| **`BLOCKED`** | نیازمند پیش‌نیاز بیرونی یا دریافت فایل/نمونه واقعی پیش از اجرا (مثلاً دریافت فایل‌های نمونه هلو/سپیدار برای پارسر قطعی). |
| **`DEFERRED_TO_FUTURE_PHASE`** | موکول‌شده به فاز ۲/۳ (مانند اجرای دفترکل دوطرفه، ارسال مستقیم مودیان، نوشتن دوطرفه در ERP و اتصال مستقیم بانکی). |

---

## ۴. نقشه کامل مستندات و نمودارهای مرحله پنجم

### الف) ۲۵ سند معماری (`docs/architecture/`)
| شماره | نام فایل | موضوع محوری |
| :---: | :--- | :--- |
| `00` | `00-architecture-overview.md` | نمای کلی، اصول ۱۰گانه، برچسب وضعیت‌ها و نقشه اسناد |
| `01` | `01-architecture-decisions.md` | ارزیابی ۹معیاره ۱۴ انتخاب فناوری (ADR-01 تا ADR-14) |
| `02` | `02-system-context.md` | نمودار و توصیف سطح ۱ C4، بازیگران، سیستم‌های بیرونی و مرزهای اعتماد |
| `03` | `03-container-architecture.md` | معماری کانتینرها (سطح ۲ C4)، ارتباطات، مقیاس‌پذیری و تاب‌آوری |
| `04` | `04-modular-monolith-design.md` | طراحی ۲۵ ماژول Backend، مالکیت ۱۰۹ جدول، رویدادها و معیار استخراج سرویس |
| `05` | `05-backend-module-boundaries.md` | مرز کد، قراردادهای بین‌ماژولی، ACL، قوانین Dependency و `TenantTransactionRunner` |
| `06` | `06-frontend-architecture.md` | معماری `Next.js` RTL، ۱۶ صفحه، قرارداد ۱۷ جزء رابط مکالمه‌ای و ویجت‌های اعلامی |
| `07` | `07-api-architecture.md` | استانداردهای REST، تفکیک `ApiResponseEnvelope` از `ErpkianReportEnvelope`، Idempotency |
| `08` | `08-api-endpoint-catalog.md` | کاتالوگ کامل Endpointهای ۲۶ گروه API با قرارداد ورودی/خروجی، خطاها و مجوزها |
| `09` | `09-database-persistence-architecture.md` | نگاشت ۱۰۹ جدول به ماژول‌ها، Drizzle vs Prisma، RLS، ایندکس و اصلاح Migration 011 |
| `10` | `10-ocr-document-processing-architecture.md` | خط لوله ۱۴مرحله‌ای پردازش اسناد، چالش‌های OCR فارسی و مقایسه موتورها |
| `11` | `11-background-jobs-events.md` | معماری `Redis + BullMQ`، ۱۳ صف، ۱۲ رویداد دامنه، Outbox و DLQ |
| `12` | `12-ai-orchestration-architecture.md` | معماری ۱۳جزئی دستیار هوشمند، دفاع در برابر Prompt Injection و Gateway مستقل از مدل |
| `13` | `13-integration-architecture.md` | اتصال هلو، سپیدار، راهکاران، Excel/CSV/PDF، ضدتکرار و تطبیق موجودیت |
| `14` | `14-windows-agent-architecture.md` | معماری `.NET 8 Windows Service`، حالت Read-Only، امنیت دستگاه و ابطال |
| `15` | `15-security-architecture.md` | ماتریس ۲۵ بردار تهدید، امنیت داده مالی/S3/AI و تست‌های منفی بین‌سازمانی |
| `16` | `16-reporting-export-architecture.md` | موتور گزارش‌گیری، PDF RTL و Excel ۴ شیتی، Snapshot و تفکیک `GrossMarginPct` |
| `17` | `17-deployment-infrastructure.md` | ۳ سناریوی استقرار (MVP/رشد/HA)، چالش شبکه و تحریم ایران و جایگزین‌های بومی |
| `18` | `18-performance-scalability.md` | اهداف کارایی (`PROPOSED TARGET`) برای ۸ عملیات کلیدی، کش و پارتیشن‌بندی |
| `19` | `19-testing-architecture.md` | هرم ۱۳گانه تست، تست‌های منفی امنیتی و Golden Tests تمام فرمول‌های مالی |
| `20` | `20-google-ai-studio-transition.md` | پاسخ دقیق ۵ پرسش گذار از محیط فعلی AI Studio به پروژه هدف |
| `21` | `21-implementation-roadmap.md` | ۱۴ مایلستون اجرایی و تفکیک دقیق فاز MVP از فازهای آتی |
| `22` | `22-risk-register.md` | رجیستر ۱۵ ریسک فنی، مالی، امنیتی، OCR و عملیاتی با راهکار کاهش |
| `23` | `23-open-decisions.md` | تجمیع تمام تصمیم‌های باز مراحل ۳، ۴ و ۵ و یافته‌های ممیزی بخش ۲۲ |
| `24` | `24-stage5-traceability.md` | ماتریس ردیابی کامل مراحل ۲ → ۳ → ۴ → ۵، گیت‌های کیفیت و گزارش ممیزی |

### ب) ۱۰ نمودار Mermaid (`docs/architecture/diagrams/`)
- `system-context.mmd` | `container-architecture.mmd` | `component-architecture.mmd` | `deployment-architecture.mmd` | `module-dependencies.mmd`
- `document-processing-flow.mmd` | `financial-posting-flow.mmd` | `ai-orchestration-flow.mmd` | `event-driven-architecture.mmd` | `security-trust-boundaries.mmd`
