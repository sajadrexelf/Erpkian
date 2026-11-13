# 13 — معماری یکپارچه‌سازی با نرم‌افزارهای حسابداری و فایل‌های ورودی (`Integration Architecture`)

این سند معماری همگام‌سازی یک‌طرفه با **هلو، سپیدار، راهکاران، اکسل، CSV و PDF** را طراحی می‌کند.

---

## ۱. اصل حاکم بر نسخه اول (`OD-11` — `CONFIRMED`)
- **حالت انحصاری در v1:** تمام اتصالات در `integration_connections` دارای **`read_only = true`** هستند.
- **ممنوعیت Write-Back:** نوشتن یا تغییر رکورد در دیتابیس SQL Server هلو، سپیدار یا راهکاران در نسخه اول اکیداً ممنوع است تا ریسک قفل دیتابیس یا نقض یکپارچگی نرم‌افزار مبدأ صفر باشد.

---

## ۲. کانال‌های یکپارچه‌سازی پشتیبانی‌شده

| کانال (`source_systems.code`) | مکانیسم ورود | فرمت / پروتکل | وضعیت آمادگی |
| :--- | :--- | :--- | :--- |
| **`EXCEL` / `CSV`** | آپلود وب در `/integrations` یا `/treasury` | `.xlsx`, `.xls`, `.csv` (UTF-8 / Windows-1256 فارسی) | `MVP P0` |
| **`PDF` (گزارش خروجی ERP یا بانک)** | آپلود به `documents` + پارسر جدولی FastAPI | `.pdf` متنی یا اسکن‌شده | `MVP P0` |
| **`HOLOO` / `SEPIDAR` / `RAHKARAN` (File Export)** | الگوی نقشه‌برداری ستون (`Column Mapping Wizard`) روی فایل خروجی نرم‌افزار | خروجی استاندارد اکسل/CSV نرم‌افزار مبدأ | `MVP P0/P1` *(نیازمند فایل‌های نمونه — `BLOCKED` برای پارسر قطعی)* |
| **`WINDOWS_AGENT`** | ارسال خودکار از `.NET Windows Service` روی سرور/رایانه مشتری | JSON فشرده روی HTTPS (`POST /api/v1/agent/sync-batches`) | `MVP P1` |
| **`API` (Webhook / REST آینده)** | کلید API سازمانی Scoped | REST JSON | `DEFERRED_TO_FUTURE_PHASE` |

---

## ۳. خط لوله ورود، ضدتکرار و نگاشت موجودیت (`Ingestion & Deduplication Pipeline`)

```text
[1. فایل اکسل / بسته Agent]
   --> ثبت import_batches (source_system_id, file_sha256, idempotency_key)
   --> اگر فایل دقیقاً با همین sha256 قبلاً وارد و تایید شده: هشدار DUPLICATE_IMPORT_BATCH

[2. استخراج سطرها در import_rows]
   --> ذخیره سطر خام در raw_row_json (تضمین Provenance و قابل ممیزی)
   --> محاسبه row_hash = SHA256(normalized_key_fields + row_index_in_batch)

[3. کنترل ضدتکرار هوشمند (DQT-09)]
   --> الف) اگر external_id در رکورد وجود دارد: چک یکتایی (org_id, source_system_id, entity_domain, external_id) در external_entity_mappings
   --> ب) اگر external_id تغییر نکرده ولی محتوا تغییر کرده: ثبت در sync_errors / صف بازبینی (هرگز رکورد Posted قبلی بی‌صدا بازنویسی نمی‌شود!)
   --> ج) دو فاکتور مجزا با شماره سند متفاوت (#101 و #102) حتی با مبلغ و تاریخ و مشتری یکسان، جداگانه پذیرفته می‌شوند.

[4. نگاشت و یکتاسازی موجودیت (OD-10)]
   --> جستجو در external_entity_mappings (تطبیق قطعی ۱۰۰٪)
   --> جستجو بر اساس شناسه ملی / بارکد در contact_identifiers / product_identifiers (تطبیق قطعی)
   --> جستجوی فازی نام فارسی با pg_trgm -> درج در entity_match_candidates (PENDING)
   --> هرگز ادغام خودکار فقط با شباهت نام رخ نمی‌دهد؛ تا تایید کاربر در کارتابل /contacts، رکورد در Needs Review می‌ماند.

[5. اعتبارسنجی ریاضی و تاریخ و ارز]
   --> عبور از VR-MATH, VR-DATE (جلالی), VR-CURR (ریال/تومان), VR-UOM
   --> سطرهای خطادار در sync_errors ثبت و مابقی وارد پیش‌نویس (Needs Review / Verified) می‌شوند.
```

---

## ۴. پیش‌نیاز مسدودکننده برای پارسرهای اختصاصی (`BLOCKED` تا دریافت نمونه واقعی)
مطابق `docs/data-model/14-open-decisions.md` و بخش ۲۲: طراحی اسکلت `import_batches`، `external_entity_mappings` و `Mapping Wizard` قابل پیاده‌سازی است، اما نهایی‌سازی پارسرهای قطعی هلو/سپیدار/راهکاران برای ستون‌های اختصاصی (اشانتیون، پورسانت ویزیتور، مالیات خطی/کل و کُدینگ حساب) به **دریافت ۵ تا ۱۰ فایل خروجی واقعی و غیرحساس** از مالک محصول وابسته (`BLOCKED`) است.
