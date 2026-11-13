# 09 — منشأ داده، نسخه‌بندی و حسابرسی (`Data Provenance, Versioning & Audit`)

این سند چگونگی پاسخ قطعی سامانه به پرسش بنیادین **«این عدد یا اطلاعات دقیقاً از کجا و از چه تغییری به دست آمده است؟»** را در کل چرخه عمر داده تعریف می‌کند.

---

## ۱. زنجیره کامل منشأ داده (`End-to-End Provenance Chain`)

هر داده مالی یا شاخص گزارشی از طریق یک زنجیره گسست‌ناپذیر به منبع فیزیکی و تصمیم انسانی متصل است:

```text
[فایل فیزیکی تغییرناپذیر: document_storage_objects (SHA-256)]
   └── [سند منطقی و نسخه پردازش تصویر: documents -> document_versions -> document_pages]
         └── [تلاش استخراج مدل: extraction_jobs -> extraction_attempts (model_version_id)]
               └── [مقدار خام و مختصات: extracted_fields / extracted_table_cells (raw_value, bbox, confidence)]
                     └── [بازبینی و اصلاح انسانی: extraction_reviews -> extraction_corrections (before -> after, actor)]
                           └── [رکورد مالی قطعی: invoices / invoice_lines / payments / inventory_movements (source_system, source_external_id, primary_document_id)]
                                 └── [شواهد گزارش نسخه‌بندی‌شده: report_executions -> report_versions -> report_metrics -> report_evidences]
```

### فیلدهای اجباری Provenance در لایه‌های مختلف
| مفهوم | محل نگهداری در مدل داده | توضیح |
| :--- | :--- | :--- |
| **Original Value** | `extracted_fields.raw_value`, `extracted_table_cells.raw_value`, `import_rows.raw_row_json`, `invoices.source_invoice_no_raw` | متن یا تاریخ/عدد دقیقاً همان‌طور که در فایل یا عکس مبدأ دیده شده است. |
| **Normalized Value** | `extracted_fields.normalized_value`, `invoices.issue_date`, `invoices.net_total_irr` | مقدار استانداردشده برای محاسبات (تبدیل ارقام فارسی، تقویم میلادی، ریال پایه). |
| **Source Identifier** | `invoices.source_external_id`, `external_entity_mappings.external_id`, `import_rows.row_number` | شناسه رکورد در نرم‌افزار مبدأ (هلو، سپیدار) یا شماره سطر در فایل اکسل. |
| **Source System** | `source_systems.code` (`MANUAL`, `OCR`, `EXCEL`, `CSV`, `PDF`, `HOLOO`, `SEPIDAR`, `API`, `WINDOWS_AGENT`, `IMPORTED_HISTORICAL`) | نوع کانال ورود داده. |
| **Source Document** | `primary_document_id` + جدول `document_relations` (برای M:N) | اتصال سند اصلی و مدارک پشتیبان به رکورد مالی. |
| **Extraction Version** | `extraction_attempts.model_version_id` + `attempt_number` | ثبت دقیق اینکه کدام موتور OCR/VLM و کدام نسخه خروجی را تولید کرده است. |
| **Correction History** | `extraction_corrections` + `audit_logs` | تمام مقادیر قبل و بعد از تغییر همراه با دلیل و شناسه کاربر. |
| **Verification Status** | `documents.lifecycle_status`, `invoices.lifecycle_status`, `extracted_fields.review_status` | تفکیک وضعیت استخراج‌شده (`Needs Review`) از تأییدشده (`Verified`) و ثبت‌شده (`Posted`). |
| **Actor & Timestamp** | `*_by_membership_id`, `created_at`, `reviewed_at`, `posted_at`, `audit_logs.occurred_at` | هویت سازمانی کاربر/سیستم و زمان دقیق رویداد با Timezone. |

---

## ۲. سیاست تغییر، ابطال و نسخه‌بندی در تمام سناریوهای عملیاتی

| عملیات | سیاست حاکم (`Append-Only / Versioning / Reversal`) | رفتار دقیق در دیتابیس |
| :--- | :--- | :--- |
| **اصلاح رکورد مالی در وضعیت `Needs Review` / `Verified`** | ویرایش مجاز با ثبت Audit | رکورد قابل ویرایش است؛ هر تغییر مهم در `audit_logs` (`before_state_json`, `after_state_json`) ثبت می‌شود. |
| **اصلاح رکورد مالی پس از `Posted`** | **ممنوعیت ویرایش مستقیم (Immutable + Reversal)** | پس از `Posted` (یا در دوره بسته)، تغییر مبلغ/تاریخ/طرف‌حساب مستقیم ممنوع است. باید: (۱) رکورد قبلی به `Reversed` تغییر یافته و یک سند معکوس یا `financial_adjustments` / `invoice_direction = 'SALE_RETURN'` ثبت شود، و (۲) سند جدید با ارجاع `reversed_invoice_id` یا `audit_logs` ساخته شود. |
| **ابطال یک عملیات مالی (پرداخت/فاکتور/حواله)** | ابطال منطقی بدون حذف | وضعیت رکورد به `Cancelled` یا `Reversed` تغییر می‌کند؛ `payment_allocations` مرتبط به وضعیت `REVERSED` می‌روند و `inventory_movements` معکوس ثبت می‌شود تا مانده کل صفر و تاریخچه ۱۰۰٪ حفظ شود. |
| **حذف سند آپلودشده (`Document`)** | Soft-Delete / Legal Hold Check | اسنادی که `Posted` شده یا به رکورد `Posted` متصل‌اند **هرگز حذف نمی‌شوند**. اسناد `Uploaded` یا `Rejected` فقط با بررسی `data_retention_policies` و ثبت در `document_access_logs` و `audit_logs` آرشیو/حذف منطقی می‌شوند. |
| **اصلاح اطلاعات استخراج‌شده OCR** | ردیابی در `extraction_corrections` | مقدار خام `raw_value` دست‌نخورده می‌ماند؛ مقدار اصلاح‌شده و `value_before / value_after` در `extraction_corrections` ذخیره و به عنوان داده آموزشی اختصاصی همان سازمان علامت‌گذاری می‌شود. |
| **اجرای مجدد OCR روی یک سند** | نسخه‌بندی غیرمخرب (`extraction_attempts`) | اجرای مجدد `attempt_number + 1` می‌سازد؛ نتایج و اصلاحات انسانی قبلی حذف نمی‌شوند تا در صورت نیاز قابل مقایسه باشند. |
| **اجرای مجدد پردازش (`Processing`)** | ایجاد `processing_job` جدید | هر اجرا شناسه، `algorithm_version` و `data_snapshot_hash` مستقل دارد. |
| **تغییر الگوریتم محاسبه** | نسخه‌بندی در `report_definitions.formula_version` و `processing_jobs.algorithm_version` | تغییر فرمول، نتایج تاریخ‌دار گذشته را بازنویسی نمی‌کند؛ هنگام بازخوانی گزارش قدیم، نسخه الگوریتم و Snapshot زمان اجرا نمایش داده می‌شود. |
| **نگهداری گزارش‌های قبلی با ورود داده جدید** | Snapshot-Bound Immutable Versions | هر `report_execution` به یک `report_data_snapshots` قفل می‌شود. با ثبت فاکتورهای جدید، گزارش قبلی ثابت می‌ماند و سیستم به کاربر اطلاع می‌دهد «داده‌های جدید پس از این گزارش ثبت شده‌اند — اجرای مجدد (`report_versions` نسخه `n+1` با `supersedes_report_version_id`)». |

---

## ۳. قانون تغییرناپذیری `audit_logs`
* نقش اتصال برنامه (`erpkian_app_runtime`) روی جدول `audit_logs` فقط مجوز **`INSERT` و `SELECT`** دارد؛ مجوزهای `UPDATE` و `DELETE` در سطح `GRANT` و `RLS` مسدود می‌شوند.
* برای جلوگیری از بزرگ‌شدن بی‌رویه فیلد `JSONB` در `audit_logs`، صرفاً فیلدهای تغییریافته یا خلاصه رکورد مالی ذخیره می‌شوند و فایل‌های تصویر هرگز در `audit_logs` کپی نمی‌شوند (فقط `source_document_id` ارجاع داده می‌شود).
