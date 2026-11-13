# 05 — مرزهای داخلی ماژول‌های Backend (`Backend Module Boundaries`)

این سند قواعد مهندسی نرم‌افزار برای نگهداشت مرزهای ۲۵ ماژول داخل پروژه هدف `NestJS` را تعریف می‌کند تا Modular Monolith در طول زمان به «Big Ball of Mud» تبدیل نشود.

---

## ۱. ساختار فیزیکی پیشنهادی داخل پروژه هدف (`Illustrative Blueprint Only`)

> **تذکر:** ساختار زیر صرفاً نقشه مرجع برای پروژه هدف (`apps/api`) است و هیچ کدی در مخزن فعلی ایجاد نشده است.

```text
apps/api/src/
├── kernel/                          # common-kernel (هیچ وابستگی به دامنه ندارد)
│   ├── decimal/                     # موتور محاسبه Half-to-Even و IRR
│   ├── calendar/                    # تبدیل و اعتبارسنجی کبیسه جلالی <-> میلادی
│   ├── db/                          # TenantTransactionRunner + Drizzle Provider
│   ├── guards/                      # AuthGuard, RbacGuard, BranchScopeGuard
│   ├── outbox/                      # TransactionalOutboxService
│   └── errors/                      # DomainErrorCodes (VR-*, SYS-*)
├── modules/
│   ├── <module-name>/
│   │   ├── api/                     # HTTP Controllers + Zod/DTO Schemas (فقط ورودی/خروجی)
│   │   ├── application/             # Use-Cases / Command & Query Handlers / Event Listeners
│   │   ├── domain/                  # Entities, Pure Calculators, Invariants, State Machines
│   │   ├── infrastructure/          # Drizzle Repositories (فقط جداول متعلق به همین ماژول)
│   │   ├── public/                  # Facade Interfaces & DTOs صادراتی برای سایر ماژول‌ها
│   │   └── <module-name>.module.ts  # تنها export مجاز: کلاس‌های پوشه public/
└── coordinators/                    # هماهنگ‌کننده‌های تراکنش چندماژولی (مثل PostingCoordinator)
```

---

## ۲. قوانین سخت‌گیرانه مرز ماژول‌ها (`Boundary Enforcement Rules`)

1. **قانون Public Facade (`No Deep Imports`):**
   - ماژول `B` **هرگز** اجازه `import` از `modules/A/infrastructure/*` یا `modules/A/domain/*` را ندارد. فقط `modules/A/public/*` (مثل `IInvoiceReadPort`, `IInventoryCommandPort`) قابل استفاده است.
2. **قانون مالکیت Repository:**
   - کلاس `InvoiceRepository` فقط جداول ماژول `invoices` را در Drizzle Schema می‌خواند و می‌نویسد. اجرای `JOIN` مستقیم بین جداول دو ماژول در یک Query عمومی مجاز نیست، **مگر** در لایه بهینه‌سازی خواندنی `reporting` آن هم از طریق Read-Only Query Views تاییدشده زیر همان `RLS`.
3. **قانون اشتراک تراکنش (`TenantTransactionRunner`):**
   - هر تغییر مالی یا چندماژولی از یک `TransactionContext` مشترک عبور می‌کند:
     1. باز کردن تراکنش PostgreSQL (`BEGIN`)
     2. اجرای فوری `SET LOCAL app.current_organization_id = :orgId` و `SET LOCAL app.current_membership_id = :memId`
     3. پاس دادن `tx` (Drizzle Transaction Handle) به Portهای ماژول‌های درگیر
     4. درج `audit_logs` و `transactional_outbox` داخل همان `tx`
     5. `COMMIT` (یا `ROLLBACK` خودکار در هر استثنا)
4. **لایه‌های ضدفساد (`Anti-Corruption Layer — ACL`):**
   - در ماژول‌های `ocr-ingestion`، `integrations` و `ai-orchestration`، تمام داده‌های ورودی خارجی (خروجی OCR، سطرهای اکسل هلو/سپیدار، یا پارامترهای Tool Call مدل زبانی) پیش از ورود به دامنه مالی از لایه `ACL Mapper + Schema Validator` عبور می‌کنند تا خطاهای تایپی، ارقام فارسی/عربی، تاریخ نامعتبر و واحد پول اشتباه (تومان/ریال) قبل از ورود به هسته مالی متوقف شوند.
5. **کنترل خودکار در CI (`ESLint Boundaries / Dependency Cruiser`):**
   - تعریف قوانین `eslint-plugin-boundaries` در پروژه هدف به گونه‌ای که:
     - چرخه وابستگی بین ماژول‌ها Build Error تولید کند.
     - هرگونه `import` مستقیم از لایه `infrastructure` ماژول دیگر خطای Lint بدهد.
     - استفاده از `Number` یا `parseFloat` برای فیلدهای `*_irr` در ماژول‌های `domain` و `application` با Rule سفارشی ESLint ممنوع شود.

---

## ۳. الگوی هماهنگ‌سازی تراکنش بدون چرخه (`PostingTransactionCoordinator`)

برای ثبت قطعی فاکتور فروش (`DOC-POST-008`) که همزمان نیازمند `invoices`، `inventory`، `contacts`، `fiscal` و `audit-security` است:
- هماهنگ‌کننده در پوشه `coordinators/` قرار می‌گیرد (بالاتر از ماژول‌ها، خارج از وابستگی متقابل آن‌ها):
  1. بررسی قفل دوره از `fiscal.public`
  2. بررسی اعتبارسنجی سقف اعتبار مشتری از `contacts.public` و مانده باز
  3. بررسی نیاز به تایید دوامضایی از `workflow.public`
  4. قفل‌گذاری ردیف فاکتور (`SELECT ... FOR UPDATE`) و بررسی وضعیت `Verified`
  5. تغییر وضعیت فاکتور به `Posted` در `invoices.public`
  6. صدور حرکت خروج انبار و محاسبه لایه بهای تمام‌شده (`FIFO` یا `Weighted Avg`) در `inventory.public`
  7. ثبت `audit_logs` و رویداد `InvoicePosted` در `Outbox` — همگی در **یک `tx` واحد**.
