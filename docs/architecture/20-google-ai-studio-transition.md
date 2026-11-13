# 20 — استراتژی گذار از محیط فعلی Google AI Studio به پروژه هدف (`Transition Strategy`)

این سند بر مبنای **ممیزی واقعی و خواندنی فایل‌های فعلی مخزن**، دقیقاً به **۵ پرسش کلیدی گذار** پاسخ می‌دهد بدون آنکه در مرحله پنجم تغییری در کد یا `package.json` فعلی ایجاد شود.

---

## ۱. وضعیت واقعی مخزن فعلی چیست؟ (`Current Workspace State`)

بررسی واقعی ریشه مخزن (`/`) و فایل `/package.json` نشان می‌دهد:
- محیط فعلی یک **قالب استاندارد اولیه Google AI Studio (Single-App Vite SPA)** است:
  - فایل‌های کُد رانتایم قالب: `src/App.tsx`, `src/main.tsx`, `src/index.css`, `index.html`, `vite.config.ts`, `tsconfig.json`, `metadata.json`, `.env.example`, `package.json`.
  - پکیج‌های قالب: `react ^19.0.1`, `vite ^8.3.0`, `express ^4.21.2`, `@google/genai ^2.4.0`, `tailwindcss ^4.3.3`, `typescript ^7.0.2`.
- **وضعیت پیاده‌سازی پلتفرم Erpkian:** **`NOT IMPLEMENTED`**. هیچ ماژول مالی، API بک‌اند NestJS، دیتابیس PostgreSQL، سرویس OCR FastAPI یا UI ۱۶ صفحه‌ای Erpkian در `src/` نوشته نشده است.
- **دارایی واقعی و بسیار ارزشمند موجود در مخزن:** پوشه `docs/` شامل:
  - `docs/PRD.md` (مرحله دوم)
  - `docs/data-model/` (۱۶ سند معماری داده و ۱۰۹ جدول — مرحله سوم)
  - `docs/processing/` (۱۳ سند + ۶ نمودار — مرحله چهارم)
  - `docs/architecture/` (۲۵ سند + ۱۰ نمودار — مرحله پنجم)

---

## ۲. کدام بخش‌ها حفظ و کدام بخش‌ها جایگزین یا آرشیو می‌شوند؟

| دارایی در مخزن فعلی | تکلیف در زمان گذار به پروژه هدف | دلیل فنی |
| :--- | :--- | :--- |
| **`docs/` (`PRD.md`, `data-model/`, `processing/`, `architecture/`)** | **حفظ ۱۰۰٪ به عنوان Source of Truth** | تمام قراردادهای داده، سرویس، API، امنیت و تست‌ها در این پوشه قرار دارند. |
| **`.env.example` (متغیرهای نمونه) و `.gitignore`** | **به‌روزرسانی و گسترش** | افزودن متغیرهای `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `OCR_SERVICE_URL`, `AI_GATEWAY_*`. |
| **`src/*`, `index.html`, `vite.config.ts`, `package.json` فعلی** | **جایگزینی / آرشیو در شاخه `legacy-template` (یا حذف پس از راه‌اندازی Monorepo)** | قالب فعلی یک SPA تک‌کانتینری با Vite است؛ در حالی که معماری هدف از **Next.js + NestJS + Python FastAPI + .NET Agent** تشکیل شده است. |
| **`metadata.json` و پوشه `public/assets/`** | **نگهداری در ریشه یا انتقال دارایی‌ها** | حفظ دارایی‌های استاتیک و هویت پروژه در AI Studio در صورت نیاز به نگهداری مخزن مشترک. |

---

## ۳. ساختار پیشنهادی مخزن پروژه هدف: Monorepo یا Multi-Repo؟

**تصمیم پیشنهادی (`PROPOSED_FOR_OWNER_APPROVAL`):** استفاده از **Monorepo یکپارچه با `pnpm workspaces + Turborepo`** (به جای ۴ مخزن جداگانه در فاز MVP) تا قراردادهای TypeScript بین Backend (`NestJS`)، Frontend (`Next.js`) و موتور ریاضی مشترک بدون انتشار پکیج npm همگام بمانند:

```text
erpkian-platform/                    # ساختار پیشنهادی پروژه هدف (پس از تأیید مرحله ۵)
├── docs/                            # حفظ کامل مستندات مراحل ۲ تا ۵
├── packages/
│   ├── shared-contracts/            # Zod Schemas, ApiResponseEnvelope, ErpkianReportEnvelope, ErrorCodes
│   ├── decimal-math/                # موتور قطعی Half-to-Even, فرمول‌های CF-*, اعتبارسنج کبیسه جلالی
│   └── db-schema/                   # Drizzle Schema + فایل‌های SQL Migration (001..011)
├── apps/
│   ├── api/                         # NestJS Modular Monolith (۲۵ ماژول + BullMQ Workers)
│   ├── web/                         # Next.js App Router RTL (۱۶ صفحه + ۱۷ جزء مکالمه‌ای)
│   ├── ocr-service/                 # Python 3.12 + FastAPI + PaddleOCR + OpenCV (Dockerfile مستقل)
│   └── windows-agent/               # .NET 8 Windows Service (Solution جداگانه با CI ویندوز)
├── infra/
│   ├── docker-compose.dev.yml       # PostgreSQL 16 + PgBouncer + Redis 7 + MinIO + OCR
│   └── k8s/                         # Manifests یا Helm Charts برای محیط تولید
└── package.json                     # Workspace root scripts (turbo build/test/lint)
```

---

## ۴. نقشه گام‌به‌گام گذار ایمن به پیاده‌سازی (`Zero-Breakage Migration Sequence`)

پس از تایید سندهای باز توسط مالک محصول (`OD-01, 03, 04, 05, 12` و موارد بخش ۲۳):
1. **گام ۱ (راه‌اندازی زیرساخت محلی و Git):** ایجاد مخزن Git واقعی (در صورت نبود `.git` در محیط فعلی)، تگ کردن وضعیت فعلی اسناد، و افزودن `infra/docker-compose.dev.yml` شامل `PostgreSQL 16`, `PgBouncer`, `Redis 7`, `MinIO`.
2. **گام ۲ (پکیج‌های مشترک و دیتابیس):** ایجاد `packages/shared-contracts`, `packages/decimal-math` (به همراه Golden Tests `GTC-01..12`) و `packages/db-schema` با اجرای `Migration 001..010 + 011_stage4_refinements`.
3. **گام ۳ (ستون فقرات NestJS API):** راه‌اندازی `apps/api` با `TenantTransactionRunner`, `Auth/RBAC Guards`, `Outbox`, `Audit` و پاس کردن فوری تست‌های منفی `NST-01..08`.
4. **گام ۴ (سرویس ایزوله OCR):** راه‌اندازی `apps/ocr-service` و اتصال به صف `BullMQ` و `MinIO`.
5. **گام ۵ (جایگزینی رابط وب):** راه‌اندازی `apps/web` (`Next.js` روی پورت `3000`) و بازنشستگی کامل `src/App.tsx` و `vite.config.ts` قالب اولیه.
6. **گام ۶ (عامل ویندوز و یکپارچه‌سازی ERP):** پس از دریافت فایل‌های نمونه هلو/سپیدار، تکمیل پارسرها و بیلد `apps/windows-agent`.

---

## ۵. تطبیق محیط توسعه (`Dev Environment`) با محدودیت فعلی پورت و ابزار
- در زمان اجرای محلی یا پیش‌نمایش یکپارچه، `Next.js` روی پورت `3000` و `NestJS API` روی پورت `4000` (یا پشت Reverse Proxy روی پورت `3000` با مسیردهی `/api/v1/*`) اجرا می‌شوند.
- پکیج `@google/genai` که در قالب فعلی نصب شده بود، در پروژه هدف از لایه مرورگر/قالب خارج شده و منحصراً پشت **`ProviderAgnosticAiGateway` در `apps/api`** (به عنوان یکی از آداپتورهای اختیاری در کنار مدل‌های دیگر) قرار می‌گیرد تا هیچ کلید یا فراخوانی AI مستقیماً از کلاینت انجام نشود.
