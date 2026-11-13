# 00 — نمای کلی معماری داده (`Data Architecture Overview`)

**نام پروژه:** Erpkian  
**وضعیت سند:** خروجی مرحله سوم — نسخه پیش‌نویس طراحی (`PROVISIONAL` در بخش‌های نیازمند تأیید مالک محصول)  
**پایگاه داده هدف:** PostgreSQL 16+  
**معماری کلان:** Modular Monolith (`Next.js` + `NestJS` + `Python/FastAPI OCR` + `Redis/BullMQ` + `S3-compatible Object Storage` + `.NET Windows Agent` در فاز آتی)

---

## ۱. ممیزی منابع در دسترس در آغاز مرحله سوم

بررسی واقعی مخزن کد در ابتدای این مرحله نشان داد:
1. سند `docs/PRD.md` (نسخه ۱.۰) در مخزن موجود است و مبنای اصلی نیازمندی‌های محصول قرار گرفت.
2. خروجی‌های مستقل مرحله دوم (`Service Catalog`، `Role & Permission Matrix`، `Workflow Specifications` و `Scenario Library`) به عنوان فایل‌های جداگانه در پوشه `docs/` وجود ندارند؛ بنابراین بخش‌هایی از مدل که مستقیماً به جزئیات آن اسناد متکی هستند با برچسب **`PROVISIONAL`** علامت‌گذاری شده‌اند.
3. ساختار فعلی Workspace شامل قالب اولیه React/Vite است و مطابق قواعد مرحله سوم، هیچ تغییری در کد یا ساختار اجرایی داده نشده و معماری داده مستقل از محدودیت‌های محیط پیش‌نمایش، برای استقرار هدف (`PostgreSQL` + `Modular Monolith`) طراحی شده است.

---

## ۲. اصول بنیادین معماری داده Erpkian

1. **رویکرد `Sub-ledger First` با آمادگی برای دفتر کل دوطرفه (`Double-Entry Ready`):**
   - هسته نسخه اول بر عملیات مالی ملموس شرکت‌های پخش و عمده‌فروشی تمرکز دارد: فاکتور خرید و فروش، طرف حساب‌ها، انبار و تبدیل واحد، دریافت و پرداخت، تخصیص چندبه‌چند، بانک و چک.
   - جداول `accounting_entries` و `accounting_entry_lines` به صورت قلاب توسعه‌ای (`PROVISIONAL`) با ارجاع رویدادمحور (`source_event_type`, `source_event_id`) طراحی شده‌اند تا بدون نیاز به بازنویسی هسته عملیاتی، دفتر کل رسمی در فازهای بعدی فعال شود.
2. **جداسازی مطلق لایه‌های اطمینان داده (۴ لایه مجزا):**
   - **لایه فایل خام (`documents` / `document_storage_objects`):** فایل اصلی کاربر تغییرناپذیر (`Immutable`) است و در Object Storage نگهداری می‌شود.
   - **لایه استخراج احتمالاتی (`extraction_*` / `ocr_*`):** خروجی‌های خام OCR/VLM همراه با مختصات صفحه، درصد اعتماد و تاریخچه اصلاحات انسانی.
   - **لایه عملیاتی تاییدشده (`Verified` → `Posted`):** داده‌های ساختاری مالی که از اعتبارسنجی ریاضی و تأیید کاربر مجاز عبور کرده‌اند.
   - **لایه تحلیلی و گزارش (`processing_*` / `report_*`):** نتایج نسخه‌بندی‌شده متصل به Snapshot داده؛ تغییر داده‌های جدید، گزارش‌های آرشیوشده قبلی را بی‌صدا تغییر نمی‌دهد.
3. **بازسازی‌محور بودن مانده‌ها (`Event-Derived Balances`):**
   - مانده بدهی مشتری از روی مجموع `invoices (Posted)` منهای `payment_allocations (ACTIVE)` و `financial_adjustments` محاسبه می‌شود و نه از طریق ستون `balance` مستقل که در معرض ناهماهنگی قرار بگیرد.
   - موجودی انبار از مجموع `inventory_movements (Posted)` بازسازی می‌شود و `stock_snapshots` صرفاً به عنوان نقطه مرجع اول دوره یا Snapshot دوره‌ای تاریخ‌دار نگهداری می‌شود.
4. **دقت مالی بدون خطای اعشار (`Exact Decimal & Canonical Currency`):**
   - تمام مبالغ مالی با `NUMERIC(18,0)` (برای ریال صحیح `IRR`) یا `NUMERIC(20,4)` (برای مقادیر حساس قیمت واحد/تبدیل) ذخیره می‌شوند؛ هرگز از `FLOAT`/`DOUBLE` استفاده نمی‌شود.
   - تمام رکوردهای مالی دارای **واحد پول صریح (`currency_code`)** و در جداول عملیاتی دارای نگاشت صریح به ریال مبنا (`*_irr`) هستند تا اختلاط ۱۰ برابری ریال و تومان غیرممکن شود.
5. **چندسازمانی دفاعی در دو لایه (`Composite FK + PostgreSQL RLS`):**
   - تمام جداول متعلق به سازمان دارای `organization_id` هستند.
   - برای جلوگیری از اتصال تصادفی یا مخرب رکوردهای دو سازمان در سطح Schema، کلیدهای خارجی بین جداول Tenant-owned به صورت **مرکب (`(organization_id, id)`)** تعریف می‌شوند و علاوه بر آن **Row Level Security (RLS)** روی تمام جداول فعال است.
6. **تغییرناپذیری مالی و ابطال به‌جای حذف (`Append-Only & Reversal`):**
   - رکوردهای مالی `Posted` هرگز `DELETE` فیزیکی یا `UPDATE` مخرب نمی‌شوند؛ اصلاح تنها از طریق ابطال/برگشت (`reversed_*_id` + سند اصلاحی) و ثبت در `audit_logs` انجام می‌شود.

---

## ۳. مرزبندی ۱۳ حوزه داده و تعداد موجودیت‌ها

| شماره | حوزه داده (`Domain`) | فایل ERD مرتبط | تعداد جدول | وضعیت طراحی |
| :--- | :--- | :--- | :---: | :--- |
| ۵.۱ | سازمان، هویت، شعب و کنترل دسترسی (`Core Organization & Access`) | `03-erd-core.mmd` | ۱۲ | `COMPLETE` |
| ۵.۲ | سال و دوره مالی، قفل دوره، ارز و واحد سنجش (`Fiscal & Localization`) | `03-erd-core.mmd` | ۸ | `COMPLETE` |
| ۵.۳ | طرف حساب‌ها و رفع ابهام موجودیت (`Contacts & Entity Resolution`) | `05-erd-financial.mmd` | ۶ | `COMPLETE` |
| ۵.۴ | کالاها، واحدهای سنجش، انبار و گردش موجودی (`Product & Inventory`) | `05-erd-financial.mmd` | ۹ | `COMPLETE` |
| ۵.۵ | مدیریت فایل، نسخه، صفحه و دسترسی سند (`Document Management`) | `04-erd-documents.mmd` | ۸ | `COMPLETE` |
| ۵.۶ | استخراج، OCR، جدول و بازبینی انسانی (`OCR & Extraction`) | `04-erd-documents.mmd` | ۱۰ | `COMPLETE` |
| ۵.۷ | اسناد مالی، فاکتور، دریافت، تخصیص، چک و بانک (`Financial Ops`) | `05-erd-financial.mmd` | ۱۲ | `COMPLETE` *(۲ جدول GL به صورت `PROVISIONAL`)* |
| ۵.۸ | اتصال نرم‌افزارهای حسابداری و Import (`Accounting Integration`) | `06-erd-processing.mmd` | ۸ | `NEEDS REVIEW` *(وابسته به نمونه فایل‌های هلو/سپیدار)* |
| ۵.۹ | مغایرت‌گیری و تطبیق چندبه‌چند (`Reconciliation`) | `06-erd-processing.mmd` | ۴ | `COMPLETE` |
| ۵.۱۰ | سرویس‌ها، گردشکار و پردازش (`Processing & Workflow`) | `06-erd-processing.mmd` | ۱۰ | `PROVISIONAL` *(هم‌ترازی با کاتالوگ مرحله ۲)* |
| ۵.۱۱ | گزارش‌گیری، نسخه‌بندی و شواهد (`Reporting & Evidence`) | `06-erd-processing.mmd` | ۷ | `COMPLETE` |
| ۵.۱۲ | دستیار هوشمند و تاریخچه مکالمه (`AI Assistant`) | `06-erd-processing.mmd` | ۶ | `COMPLETE` |
| ۵.۱۳ | ممیزی، امنیت، اعلان و اشتراک (`Audit, Notification & Subscription`) | `03-erd-core.mmd` / `06` | ۹ | `COMPLETE` |
| **جمع کل** | **۱۳ حوزه معماری** | **۴ نمودار ERD** | **۱۰۹ جدول** | **آماده بازبینی** |

---

## ۴. نقشه تعامل لایه‌های ماژولار (`Modular Monolith Boundaries`)

```text
[Core/Auth/Fiscal]  ---> فراهم‌کننده Tenant Context، RBAC و Period Lock برای تمام ماژول‌ها
       ^
       |
[Document & OCR]    ---> ذخیره فایل تغییرناپذیر + استخراج احتمالاتی + بازبینی انسانی
       | (تنها پس از تایید انسانی: Verified)
       v
[Contacts/Products] ---> یکتاسازی طرف‌حساب، کالا و تبدیل واحد (Carton <-> Piece)
       |
       v
[Financial & Inv.]  ---> فاکتور، دریافت، تخصیص M:N، چک، بانک و گردش انبار (Posted + Idempotent)
       ^                                                |
       | (Tool Calls کنترل‌شده و Read-Only)              v
[AI Assistant] <--- [Workflow & Processing] ---> [Reporting & Evidence] ---> [AuditLog]
```

> **قانون مرزی ماژول‌ها:** ماژول `AI Assistant` هیچ دسترسی نوشتن مستقیمی به جداول `Financial & Inventory` ندارد و حتی برای خواندن نیز فقط از طریق Toolهای مجاز روی لایه سرویس (تحت `RLS` و `RBAC`) عبور می‌کند.
