# 09 — قراردادهای استاندارد خروجی و شواهد (`Output & Evidence Contracts`)

تمامی سرویس‌های پردازشی و گزارشی پلتفرم `Erpkian` موظف‌اند خروجی خود را در چهارچوب قراردادهای استاندارد این سند تولید کنند تا رابط کاربری (`Next.js`)، دستیار هوشمند (لایه توضیحی)، فایل‌های چاپی (`PDF`) و فایل‌های تحلیلی (`Excel/CSV`) دارای ساختار یکسان، عدد واحد و ردپای ممیزی کامل باشند.

---

## ۱. قرارداد استاندارد پاسخ JSON (`ErpkianReportEnvelope v1`)

هر پاسخ API یک سرویس گزارش یا پردازش باید شامل ۷ بخش اجباری زیر باشد:

```json
{
  "schema_version": "1.0.0",
  "service_code": "FIN-AR-AGING-001",
  "algorithm_version": "1.0.0",
  "formula_version": "1.0.0",
  "execution_meta": {
    "organization_id": "0193a000-0000-7000-8000-000000000001",
    "branch_scope_id": null,
    "workflow_execution_id": "0193we00-0000-7000-8000-000000000001",
    "processing_job_id": "0193pj00-0000-7000-8000-000000000001",
    "report_execution_id": "0193rex0-0000-7000-8000-000000000001",
    "report_version_id": "0193rv00-0000-7000-8000-000000000001",
    "version_number": 1,
    "generated_at_utc": "2026-11-15T10:30:00Z",
    "generated_at_jalali": "1405/08/24 14:00",
    "display_currency": "IRT",
    "canonical_currency": "IRR",
    "exchange_rate_applied": 10
  },
  "data_snapshot": {
    "data_snapshot_id": "0193rds0-0000-7000-8000-000000000001",
    "as_of_date_jalali": "1405/08/24",
    "snapshot_hash": "9b74c9897bac770ffc029102a200c5de...",
    "included_document_count": 40,
    "pending_document_count": 2,
    "confidence_level": "MEDIUM"
  },
  "summary_metrics": [
    {
      "metric_key": "total_open_ar_irr",
      "label_fa": "جمع کل مطالبات باز مشتریان",
      "value_irr": 450000000,
      "value_display": 45000000,
      "formula_code": "AR_OPEN_BAL_V1"
    }
  ],
  "rows": [],
  "warnings_and_limitations": [
    {
      "warning_code": "PENDING_DOCS_EXCLUDED",
      "severity": "MEDIUM",
      "message_fa": "۲ فاکتور و ۱ رسید در وضعیت Needs Review در این گزارش لحاظ نشده‌اند.",
      "affected_record_ids": ["0193iv00-...-0041", "0193iv00-...-0042"]
    }
  ],
  "evidences": [
    {
      "metric_key": "total_open_ar_irr",
      "source_entity_type": "INVOICE",
      "source_entity_id": "0193iv00-0000-7000-8000-000000000001",
      "source_document_id": "0193d000-0000-7000-8000-000000000001",
      "contribution_amount_irr": 120000000,
      "document_number": "S-1405-4021",
      "issue_jalali": "1405/07/10"
    }
  ],
  "next_best_actions": [
    {
      "action_code": "REVIEW_PENDING_DOCS",
      "title_fa": "بررسی ۲ فاکتور معلق و بازتولید نسخه ۲ گزارش",
      "target_service_code": "DOC-REVIEW-007"
    }
  ]
}
```

### قواعد اجباری قرارداد JSON:
1. تمام مبالغ پولی در JSON همیشه هم با مقیاس پایه **`*_irr` (عدد صحیح ریال)** و در صورت انتخاب نمایش تومانی کاربر با فیلد کمکی `*_display` ارسال می‌شوند تا هیچ اشتباه ۱۰ برابری رخ ندهد.
2. فیلدهای `confidence_level` (`HIGH` | `MEDIUM` | `LOW`) و آرایه `warnings_and_limitations` هرگز حذف نمی‌شوند (در نبود هشدار، آرایه `[]` برگردانده می‌شود).
3. هر سطر تحلیلی می‌تواند آرایه کوتاه `evidence_refs` داشته باشد که به آرایه `evidences` متصل است.

---

## ۲. قرارداد استاندارد خروجی PDF (`Persian RTL Print Contract`)

تمام فایل‌های PDF تولیدی توسط Worker (`report_outputs.output_format = 'PDF'`) باید دارای ساختار ۵ بخشی زیر باشند:
1. **سربرگ رسمی سازمان (`Header`):** نام تجاری/حقوقی سازمان، نام شعبه (یا «کل شعب»)، عنوان فارسی گزارش، شناسه گزارش (`RPT_...` + `v1/v2`)، بازه تاریخ شمسی و واحد پول نمایشی (ریال/تومان).
2. **باکس مشخصات ممیزی و کیفیت داده (`Audit & Trust Box`):** تاریخ/ساعت تولید شمسی، نام کاربر درخواست‌کننده، وضعیت سطح اطمینان (`HIGH`/`MEDIUM`/`LOW`)، تعداد اسناد `Posted` لحاظ‌شده و تعداد اسناد معلق لحاظ‌نشده.
3. **باکس هشدارها و محدودیت‌ها (`Limitations Callout`):** در صورت وجود هشدار (مانند اسناد `Needs Review`، پوشش ناقص بهای خرید، یا غیررسمی بودن پیش‌نویس مالیاتی)، کادر زرد/نارنجی برجسته در صفحه اول چاپ می‌شود.
4. **خلاصه شاخص‌ها و جداول تفکیکی (`KPIs & Data Tables`):**
   - چیدمان راست‌به‌چپ (`RTL`)، فونت فارسی استاندارد (`Vazirmatn` / `IRANSansX`)، ارقام جدول با تراز عددی و جداکننده سه‌رقمی، و سرستون تکراری در تمام صفحات چندبرگی.
5. **پاورقی هر صفحه و پیوست شواهد (`Footer & Evidence Appendix`):** شماره صفحه (`صفحه X از Y`)، کد پیگیری و `snapshot_hash` کوتاه‌شده (۱۲ کاراکتر اول)؛ و در انتهای PDF جدول فشرده مراجع (`شماره سند مبدأ، تاریخ، طرف حساب، مبلغ`).

---

## ۳. قرارداد استاندارد خروجی Excel (`Multi-Sheet Workbook Contract`)

هر فایل خروجی `.xlsx` (`report_outputs.output_format = 'EXCEL'`) شامل **۴ شیت استاندارد** با چیدمان RTL و فرمت عددی واقعی (نه متن!) است:

| شماره شیت | نام فارسی شیت | محتوا و ساختار استاندارد |
| :---: | :--- | :--- |
| **شیت ۱** | `خلاصه مدیریتی` | متادیتای سازمان، `snapshot_hash`، پارامترهای اجرا، واحد پول، جدول KPIها با فرمول‌های جمع اکسل واقعی (`SUM`) |
| **شیت ۲** | `جزئیات محاسبات` | جدول تفصیلی ردیف‌ها (مشتریان، فاکتورها، کالاها یا تراکنش‌ها) با سطر عنوان Freeze‌شده، AutoFilter فعال و تراز جمع در انتها |
| **شیت ۳** | `شواهد و اسناد مبدأ` | نگاشت دقیق ردیف‌های گزارش به `invoice_number`، `document_id`، `source_system`، `external_id` و لینک بازکردن سند در پلتفرم |
| **شیت ۴** | `هشدارها و اسناد معلق` | فهرست کامل اسناد `Needs Review` / `Verified` لحاظ‌نشده، مغایرت‌های باز یا اقلام فاقد بهای خرید با علت دقیق |

---

## ۴. قرارداد خروجی CSV و JSON Export
- فایل **`CSV`**: با کدگذاری **`UTF-8 with BOM`** (برای باز شدن صحیح کاراکترهای فارسی در Excel ویندوز)، جداکننده `,`، ستون‌های جداگانه برای `*_jalali` و `*_date_iso`، و بدون فرمت‌دهی سه‌رقمی روی اعداد پولی تا برای تحلیل اکسل آماده باشد.
- فایل **`JSON`**: مطابق دقیق `ErpkianReportEnvelope v1` جهت دانلود آرشیوی یا مصرف API.

---

## ۵. قرارداد ساختار شواهد (`Evidence Structure`)
هر رکورد در جدول `report_evidences` و خروجی آن شامل:
- `source_entity_type`: یکی از `INVOICE` | `INVOICE_LINE` | `PAYMENT` | `PAYMENT_ALLOCATION` | `CHECK` | `BANK_TRANSACTION` | `INVENTORY_MOVEMENT` | `INVENTORY_ADJUSTMENT` | `FINANCIAL_ADJUSTMENT`
- `source_entity_id`: UUID رکورد مالی در دیتابیس
- `source_document_id`: UUID پرونده تصویر/PDF/اکسل در `documents` (در صورت ثبت دستی بدون پیوست، مقدار `null` همراه با برچسب `MANUAL_ENTRY_NO_ATTACHMENT`)
- `contribution_amount_irr`: سهم دقیق عددی این رکورد در شاخص گزارش به ریال؛ به طوری که در ممیزی مجموع `contribution_amount_irr` با مقدار `report_metrics.numeric_value` مطابقت داشته باشد.
