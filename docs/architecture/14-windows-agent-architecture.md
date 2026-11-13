# 14 — معماری عامل محلی ویندوز (`Windows Agent Architecture — .NET 8`)

این سند معماری عامل ویندوز (`.NET 8 Windows Service`) را برای استخراج امن، زمان‌بندی‌شده و **اکیداً خواندنی (`read_only = true`)** از سیستم‌های مشتری (هلو، سپیدار، راهکاران و پوشه‌های فایل محلی) تشریح می‌کند.

---

## ۱. هدف و اصول امنیتی طراحی Agent
بسیاری از شرکت‌های پخش ایران سرور حسابداری خود را داخل شبکه داخلی بدون IP عمومی و پشت NAT/فایروال نگهداری می‌کنند. Agent این مشکل را با الگوی **Outbound-Only HTTPS** حل می‌کند:
1. **عدم نیاز به باز کردن پورت ورودی روی سیستم مشتری (`Zero Inbound Ports`).**
2. **حالت انحصاری `read_only = true` در v1 (`CONFIRMED`):** Agent تنها مجاز به `SELECT` از Viewهای مجاز SQL Server (با کاربر دیتابیس Read-Only محلی) یا خواندن فایل از **پوشه‌های صریحاً انتخاب‌شده توسط کاربر (`Folder Allowlist`)** است.
3. **عدم اسکن کل سیستم‌فایل:** دسترسی به خارج از پوشه‌های Allowlist در سطح کد و پیکربندی امضاشده مسدود است.
4. **اتصال تک‌سازمانی (`Single-Org Binding`):** هر نصب Agent دارای یک `agent_device_id` یکتا در جدول `integration_connections` است که منحصراً به یک `organization_id` مقید شده است.

---

## ۲. اجزای داخلی `.NET 8 Windows Agent`

| جزء | مسئولیت |
| :--- | :--- |
| **`Erpkian.Agent.Service`** | سرویس پس‌زمینه ویندوز (`BackgroundService`) برای اجرای زمان‌بند همگام‌سازی و FileSystemWatcher |
| **`Erpkian.Agent.ConfigTray`** | رابط سبک دسکتاپ فقط برای ثبت توکن جفت‌سازی اولیه (`Pairing Code`)، انتخاب پوشه‌های مجاز و تست اتصال |
| **`ReadOnlySqlExtractor`** | آداپتور `Microsoft.Data.SqlClient` برای خواندن View/جدول‌های Read-Only با `ApplicationIntent=ReadOnly` و Timeout کوتاه |
| **`FolderWatcherExtractor`** | پایش فایل‌های جدید/تغییریافته `.xlsx`, `.csv`, `.pdf` در پوشه‌های منتخب با محاسبه SHA-256 محلی |
| **`LocalCheckpointStore`** | ذخیره `sync_cursors` محلی (مثلاً آخرین `LastModifiedAt` یا `LastInvoiceId`) در فایل رمزنگاری‌شده با **Windows DPAPI** |
| **`ResilientUploadClient`** | فشرده‌سازی `Gzip`، قطعه‌بندی دسته‌های حداکثر ۵۰۰ ردیفی، ارسال با `Idempotency-Key` و Retry با Exponential Backoff |

---

## ۳. چرخه ثبت، احراز هویت و ابطال دستگاه (`Enrollment, Auth & Kill-Switch`)

1. **ثبت اولیه (`Pairing Flow`):**
   - مدیر سازمان (`OWNER`/`CFO`) در پنل وب کد جفت‌سازی یک‌بارمصرف (`15 دقیقه` اعتبار) ایجاد می‌کند.
   - کاربر کد را در `ConfigTray` وارد می‌کند؛ Agent یک جفت کلید تولید کرده و همراه با `Machine Fingerprint` به `POST /api/v1/agent/enroll` می‌فرستد.
   - سرور یک `Device Secret` اختصاصی صادر می‌کند که روی دستگاه با **Windows DPAPI (`ProtectedData`)** و در سرور به صورت Hash ذخیره می‌شود.
2. **ارسال Heartbeat و داده:**
   - هر ارسال شامل هدرهای `X-Agent-Device-Id`، `X-Agent-Device-Key` (یا امضای HMAC به همراه Timestamp برای جلوگیری از Replay Attack) و `Idempotency-Key` است.
   - سرویس هر ۵ دقیقه یک Heartbeat سبک ارسال می‌کند تا وضعیت آنلاین/آفلاین دستگاه در داشبورد مدیر نمایش داده شود.
3. **ابطال فوری (`Instant Revocation / Kill Switch`):**
   - اگر لپ‌تاپ حسابدار گم شود یا دسترسی لغو گردد، `OWNER`/`CFO` از پنل وب وضعیت `integration_connections` را به `REVOKED` تغییر می‌دهد.
   - از آن لحظه تمام درخواست‌های آن `agent_device_id` با خطای `401 AGENT_DEVICE_REVOKED` رد شده و در `security_events` ثبت می‌شوند؛ Agent با دریافت کد `401`، ارسال را متوقف و توکن محلی خود را پاک می‌کند.

---

## ۴. به‌روزرسانی امن (`Signed Auto-Update — PROPOSED_FOR_OWNER_APPROVAL`)
- بسته‌های بروزرسانی Agent باید دارای **امضای دیجیتال کد (`Authenticode Code Signing`)** و کنترل `SHA-256` باشند تا از اجرای کد جعلی روی سیستم مالی مشتری جلوگیری شود.
