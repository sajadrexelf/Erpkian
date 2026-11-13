# 11 — ارزیابی و مقایسه ORM (`Prisma vs Drizzle ORM`)

این سند دو گزینه اصلی ORM در اکوسیستم TypeScript/NestJS را با تمرکز ویژه بر نیازمندی‌های سخت‌گیرانه PostgreSQL در `Erpkian` مقایسه می‌کند. در این مرحله هیچ ORMای بدون بررسی نهایی در کد قفل نمی‌شود و مدل داده مستقل از ابزار پیاده‌سازی طراحی شده است.

---

## ۱. ماتریس مقایسه فنی

| معیار ارزیابی | **Drizzle ORM** | **Prisma ORM** | تحلیل تأثیر در Erpkian |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Support** | بومی و نزدیک به SQL (`pgTable`, `numeric`, `date`, `timestamptz`, `pgPolicy`) | بسیار خوب، اما برخی قابلیت‌های بومی Postgres نیاز به Raw SQL دارند | مدل ما متکی بر قابلیت‌های بومی Postgres (`pg_trgm`, `NUMERIC`, `RLS`, Partial Index) است. |
| **Composite Foreign Keys** | پشتیبانی مستقیم و صریح در Schema (`foreignKey({ columns: [t.orgId, t.contactId], foreignColumns: [...] })`) | پشتیبانی دارد (`@@relation([orgId, contactId], ...)`), ولی گاهی در مدل‌های پیچیده با چند رابطه به یک جدول نیاز به نام‌گذاری دستی سنگین دارد | کل مدل امنیت بین‌جدولی ما بر `(organization_id, id)` استوار است؛ Drizzle شفافیت بالاتری دارد. |
| **Check & Partial Constraints** | پشتیبانی بومی از `check(...)` و `uniqueIndex(...).where(...)` در Schema | `CHECK` Constraints و `Partial Indexes` در `schema.prisma` مستقیماً بیان نمی‌شوند و باید دستی به SQL Migration اضافه شوند | ما به ده‌ها `CHECK` مالی و Partial Index نیاز داریم؛ نبود آن‌ها در Schema باعث فاصله بین مدل و Migration می‌شود. |
| **Transactions** | کنترل شفاف و سبک روی `db.transaction(async (tx) => ...)` با سطح ایزولاسیون (`isolationLevel: 'serializable'`) | `$transaction` قوی، ولی تنظیم `SET LOCAL` برای هر کوئری بیرون از تراکنش تعاملی دردسرساز است | ما برای اجرای `SET LOCAL app.current_organization_id` به تراکنش سبک در تمام درخواست‌ها نیاز داریم. |
| **Raw SQL** | ادغام یکپارچه (`sql\`...\``) با تایپ‌سیفتی کامل بدون خارج شدن از الگوی اصلی | `$queryRaw` وجود دارد ولی خروجی تایپ‌نشده (`unknown`) برمی‌گرداند مگر با TypedSQL (جداگانه) | برای گزارش‌های تحلیلی مالی (`AR Aging FIFO`, `Weighted Average Cost`) ترکیب CTE/Window Functions حیاتی است. |
| **RLS Compatibility** | **عالی.** پشتیبانی مستقیم از تعریف `pgPolicy` + اجرای یکنواخت `SET LOCAL` در Wrapper تراکنش | **متوسط.** نیاز به Extension (`PrismaClient.$extends`) که هر کوئری را داخل `$transaction` بپیچد و `SET LOCAL` بزند (هزینه Latency روی تک‌کوئری‌ها اگر مدیریت نشود) | RLS پایه امنیتی Erpkian است؛ سادگی و سرعت Wrapper در Drizzle مزیت مهمی است. |
| **Migration Management** | `drizzle-kit` فایل‌های `.sql` استاندارد تولید می‌کند که به راحتی با دستورات SQL سفارشی (`RLS`, `Triggers`, `VALIDATE CONSTRAINT`) ترکیب می‌شوند | `prisma migrate` عالی است ولی هر تغییر دستی در SQL باید با دقت مدیریت شود تا با `Shadow Database` تداخل نکند | ترکیب Migrationهای استاندارد با RLS و نقش‌های DB در Drizzle ساده‌تر و شفاف‌تر است. |
| **Type Safety** | TypeScript خالص بدون مرحله Code Generation (`prisma generate`) | نیازمند `prisma generate` ولی DX بسیار روان برای CRUDهای استاندارد | هر دو بسیار قوی‌اند؛ Drizzle در کوئری‌های تحلیلی و Joinهای پیچیده دست بازتری می‌دهد. |
| **Maintainability** | کد اسکیما همان TypeScript است؛ نیازمند تسلط تیم به SQL | فایل `schema.prisma` بسیار خوانا برای مدل‌های بسیار بزرگ | برای تیم Backend ارشد، خوانایی SQL در Drizzle مزیت است؛ برای تیم تازه‌کار Prisma ساده‌تر است. |
| **NestJS Integration** | پکیج‌های رسمی/اجتماعی سبک و تزریق مستقیم `Pool` از `pg` | ماژول رسمی `PrismaService` بسیار جاافتاده در NestJS | هر دو به سادگی در `DatabaseModule` در NestJS کپسوله می‌شوند. |

---

## ۲. پیشنهاد مستدل نهایی
* **پیشنهاد اصلی:** انتخاب **Drizzle ORM** به عنوان لایه دسترسی به داده در NestJS، همراه با **SQL-First / Custom SQL Migration Hooks** برای تعریف قطعی `RLS Policies`، `FORCE ROW LEVEL SECURITY`، `Composite Foreign Keys` و `pg_trgm Indexes`.
* **دلیل اصلی:** در یک سامانه مالی چندسازمانی، بیش از ۵۰٪ ریسک‌های فنی در **گزارش‌های تحلیلی (Window Functions/CTEs)**، **ایزولاسیون RLS در Connection Pool** و **قیدهای مالی (`CHECK`, Partial Index)** است. نزدیکی Drizzle به SQL خالص، این پیچیدگی‌ها را شفاف، قابل تست و بدون لایه‌های جادویی پنهان نگه می‌دارد.

---

## ۳. الگوی مدیریت قابلیت‌های خاص PostgreSQL در کنار ORM
صرف‌نظر از انتخاب نهایی Drizzle یا Prisma:
1. **منبع حقیقت Schema:** فایل‌های Migration استاندارد SQL (`migrations/0001_...sql` تا `0010_...sql`) منبع نهایی حقیقت در دیتابیس هستند (نه همگام‌سازی کورکورانه `db push`).
2. **لایه کپسوله‌کننده Tenant (`TenantTransactionRunner`):** هیچ سرویسی مستقیماً کوئری بدون کانتکست اجرا نمی‌کند؛ تمام سرویس‌ها از طریق یک متد واحد `runInTenantTransaction(orgId, membershipId, fn)` اجرا می‌شوند که در گام اول `SET LOCAL app.current_organization_id` را اجرا و سپس منطق را در یک تراکنش ACID پیش می‌برد.
3. **مدیریت تست RLS:** تست‌های یکپارچگی دیتابیس مستقیماً با نقش `erpkian_app_runtime` روی یک PostgreSQL واقعی در Docker اجرا می‌شوند تا صحت Policyها مستقل از ORM تضمین شود.
