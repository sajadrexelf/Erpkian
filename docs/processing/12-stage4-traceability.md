# 12 — ماتریس ردیابی مرحله چهارم و تطبیق مدل داده (`Stage 4 Traceability & Schema Delta`)

این سند ارتباط کامل بین **۶۲ خدمت** و **۱۰ گردشکار** مرحله چهارم را با **۱۰۹ جدول مدل داده مرحله سوم** (`docs/data-model/02-data-dictionary.md`) برقرار می‌کند، کفایت جداول موجود را راستی‌آزمایی می‌کند و تغییرات جزئی پیشنهادی را بدون ایجاد فایل یا جدول تکراری در قالب **پیش‌نویس غیرقابل اجرای Migration `011`** مستند می‌سازد.

---

## ۱. ماتریس ردیابی خدمات به جداول مرحله سوم و خروجی‌های مرحله چهارم

| دسته / بازه خدمات | سرویس‌های متناظر (`01-service-catalog.md`) | گردشکار (`04-workflow-specifications.md`) | جداول اصلی مرحله سوم (`02-data-dictionary.md`) | قوانین اعتبارسنجی و فرمول‌ها | وضعیت انطباق Schema |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **A. اسناد و OCR (`DOC-*`)** | `DOC-INGEST-001` تا `DOC-LINK-009` | `WF-DOC-OCR-001`, `WF-INV-REG-001` | `document_batches`, `documents`, `document_versions`, `document_pages`, `document_storage_objects`, `document_relations`, `document_access_logs`, `extraction_jobs`, `extraction_attempts`, `ocr_page_results`, `extracted_fields`, `extracted_tables`, `extracted_table_rows`, `extracted_table_cells`, `extraction_reviews`, `extraction_corrections`, `entity_match_candidates`, `entity_merge_history`, `approval_requests` | `VR-MATH-01..05`, `VR-DUP-01`, `VR-ENT-01..02` | `COMPLETE` *(با پیشنهاد افزودن thresholdهای تنظیم به `organization_settings` در 011)* |
| **B. حساب‌های دریافتنی (`FIN-AR-*`)** | `FIN-AR-INV-001` تا `FIN-AR-PROFILE-001` | `WF-INV-REG-001`, `WF-PAY-ALLOC-001`, `WF-AR-AGING-001` | `contacts`, `contact_roles`, `contact_identifiers`, `invoices`, `invoice_lines`, `invoice_adjustments`, `payments`, `payment_allocations`, `checks`, `report_data_snapshots`, `report_executions`, `report_versions`, `report_metrics`, `report_evidences` | `VR-MATH-01..08`, `VR-CURR`, `VR-DUP-02`, `CF-INV-01`, `CF-AR-01..03` | `MINOR_DELTA` *(افزودن `is_promotional_free_item`, `promo_reason`, `discount_pct` به `invoice_lines`)* |
| **C. حساب‌های پرداختنی (`FIN-AP-*`)** | `FIN-AP-INV-001` تا `FIN-AP-PRIO-001` | `WF-INV-REG-001`, `WF-PAY-ALLOC-001` | `contacts`, `invoices`, `invoice_lines`, `invoice_adjustments`, `payments`, `payment_allocations`, `checks`, `reconciliation_runs`, `reconciliation_matches`, `reconciliation_exceptions` | `VR-MATH-01..08`, `CF-INV-01`, `CF-AR-01` | `COMPLETE` *(بهره‌مندی از دلتای `invoice_lines`)* |
| **D. بانک و خزانه (`TRS-*`)** | `TRS-BANK-IMP-001` تا `TRS-CASH-REC-001` | `WF-BANK-REC-001`, `WF-PAY-ALLOC-001` | `bank_accounts`, `bank_transactions`, `payments`, `checks`, `check_status_history`, `reconciliation_rules`, `reconciliation_runs`, `reconciliation_matches`, `reconciliation_exceptions`, `import_batches`, `import_rows` | `VR-DUP-03`, `VR-ENT-01`, `CF-TRS-01`, `CF-TRS-02` | `COMPLETE` |
| **E. کالا و انبار (`INV-*`)** | `INV-MASTER-001` تا `INV-SLOW-001` | `WF-INV-REG-001`, `WF-INV-ADJ-001` | `product_categories`, `products`, `product_identifiers`, `product_units`, `units_of_measure`, `unit_conversions`, `warehouses`, `inventory_locations`, `inventory_movements`, `inventory_adjustments`, `stock_snapshots`, `reconciliation_*` | `VR-UOM-01..04`, `VR-INV-01..03`, `CF-INV-01` | `MINOR_DELTA` *(افزودن `transfer_group_id` به `inventory_movements`؛ بچ/انقضا برای P2)* |
| **F. فروش، خرید و اتصال (`SLS-*`, `PUR-*`, `INT-*`)** | `SLS-RPT-001` تا `INT-SYNC-001` | `WF-ERP-SYNC-001` | `invoices`, `invoice_lines`, `source_systems`, `integration_connections`, `external_entity_mappings`, `sync_jobs`, `sync_cursors`, `sync_errors`, `import_batches`, `import_rows` | `VR-DUP-05`, `CF-PRF-01` | `COMPLETE` *(نیازمند نمونه فایل واقعی هلو/سپیدار پیش از کدنویسی Parser)* |
| **G. سودآوری و بها (`PRF-*`)** | `PRF-COGS-001` تا `PRF-LOSS-001` | `WF-PROFIT-PNL-001` | `accounting_policies`, `inventory_movements`, `stock_snapshots`, `invoices`, `invoice_lines`, `invoice_adjustments`, `report_*`, `processing_warnings`, `processing_errors` | `CF-COST-01`, `CF-COST-02`, `CF-PRF-01`, `CF-PRF-02` | `COMPLETE` |
| **H. گزارش‌های مدیریتی (`RPT-*`)** | `RPT-DASH-001` تا `RPT-EXPORT-001` | `WF-AR-AGING-001`, `WF-PROFIT-PNL-001` | `report_definitions`, `report_data_snapshots`, `report_executions`, `report_versions`, `report_metrics`, `report_evidences`, `report_outputs`, `document_storage_objects` | `ErpkianReportEnvelope v1` | `MINOR_DELTA` *(افزودن `algorithm_version` به `report_versions`)* |
| **I. مالیات و انطباق (`TAX-*`)** | `TAX-PREP-*`, `TAX-VAL-*`, `TAX-SUB-*` | `WF-TAX-PREP-001` | `invoices`, `invoice_lines`, `contacts`, `contact_identifiers`, `product_identifiers`, `fiscal_periods`, `report_*` | `VR-ENT-01`, `CF-TAX` | `COMPLETE` *(برای Prep/Val؛ بخش `TAX-SUB-*` در v1 قفل است)* |

---

## ۲. بررسی کفایت جداول کلیدی بخش ۸ دستورالعمل مرحله چهارم

در ممیزی جداول طراحی‌شده مرحله سوم، موارد زیر بررسی و نتیجه‌گیری شد:

| جدول مرحله سوم | ارزیابی کفایت برای نیازهای مرحله چهارم | تغییر پیشنهادی (بدون تکرار جدول) |
| :--- | :--- | :--- |
| **`service_definitions`** | کاتالوگ خدمات `01-service-catalog.md` نیاز به دسته‌بندی `A..I`، اتصال به مجوز RBAC و نمایش وضعیت آمادگی/قفل دارد. | افزودن `category_code VARCHAR(10)`, `required_permission_code VARCHAR(80)` و `is_locked_in_v1 BOOLEAN`. |
| **`workflow_definitions`** | وجود `service_id`, `workflow_code`, `version_number`, `is_active` کافی است. | بدون تغییر ساختاری (صرفاً پیشنهاد اختیاری `step_graph_json JSONB`). |
| **`workflow_executions`** | دارای `current_state` (۱۰ وضعیت)، `input_params_json`، `checkpoint_state_json` و `idempotency_key` است؛ برای مدیریت Retry خودکار و پیام توقف، نیاز به فیلد کمکی دارد. | افزودن `paused_reason_code VARCHAR(50)` و `retry_count SMALLINT DEFAULT 0` و `finished_at TIMESTAMPTZ`. |
| **`workflow_step_executions`** | تاریخچه گام‌ها و انتقال‌ها را کامل پوشش می‌دهد. | بدون تغییر ساختاری. |
| **`processing_jobs`** | دارای `job_type`, `job_status`, `algorithm_version`, `started_at`, `finished_at` است. | افزودن `service_code VARCHAR(60)` یا ارجاع به `service_definitions(id)` جهت پیوند مستقیم. |
| **`processing_results`** | `confidence_level`, `summary_json`, `data_snapshot_hash` کامل است. | بدون تغییر ساختاری. |
| **`processing_result_sources`** | اتصال نتیجه به `source_entity_type`, `source_entity_id`, `source_document_id` کامل است. | بدون تغییر ساختاری. |
| **`processing_warnings`** | دارای `warning_code` و `message_fa` است؛ برای تفکیک سطح اهمیت هشدار در UI، `severity` مفید است. | افزودن `severity VARCHAR(15) DEFAULT 'MEDIUM'`. |
| **`processing_errors`** | دارای `error_code`, `is_recoverable`, `message_fa` است؛ کامل است. | بدون تغییر ساختاری. |
| **`approval_requests`** | دارای `target_entity_type/id`, `required_permission_code`, `requested_by`, `decided_by` است؛ برای انقضای درخواست‌های بلاتکلیف و Dual Approval صریح، تکمیل می‌شود. | افزودن `requires_dual_approval BOOLEAN DEFAULT false` و `expires_at TIMESTAMPTZ`. |
| **`report_definitions`..`report_outputs`** | معماری Snapshot، نسخه‌بندی `v1->v2`، شاخص‌های `NUMERIC(20,4)` و `report_evidences` بسیار کامل است؛ فقط ثبت `algorithm_version` روی `report_versions` ممیزی بازتولید را کامل‌تر می‌کند. | افزودن `algorithm_version VARCHAR(20) DEFAULT '1.0.0'` به `report_versions`. |

---

## ۳. پیش‌نویس پیشنهادی تغییرات تکمیلی (`Draft Migration 011_stage4_refinements.sql`)

> **توجه اکید:** این بخش صرفاً **مشخصات پیشنهادی غیرقابل اجرا** برای تکمیل فاز بعدی Backend است؛ هیچ تغییری در دیتابیس واقعی یا فایل‌های مرحله سوم اعمال نشده است.

```sql
-- DRAFT ONLY (NOT EXECUTED) — Migration 011: Stage 4 Refinements

-- 1. پشتیبانی صریح اشانتیون و درصد تخفیف ردیفی (OD-03, OD-04)
ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS is_promotional_free_item BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_reason VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NULL CHECK (discount_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS discount_rule_tier VARCHAR(40) NULL,
  ADD CONSTRAINT chk_promo_zero_price CHECK (NOT is_promotional_free_item OR unit_price_irr = 0);

-- 2. جفت‌سازی اتمیک انتقال بین انبارها (OD-05)
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS transfer_group_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_im_transfer_group ON inventory_movements (organization_id, transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

-- 3. آستانه‌های OCR قابل تنظیم سازمانی (OD-12)
ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS ocr_min_quality_score NUMERIC(4,3) NOT NULL DEFAULT 0.650,
  ADD COLUMN IF NOT EXISTS ocr_auto_review_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.850;

-- 4. تکمیل جداول Orchestration، هشدارها، تاییدیه‌ها و نسخه‌های گزارش
ALTER TABLE service_definitions
  ADD COLUMN IF NOT EXISTS category_code VARCHAR(10) NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS required_permission_code VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS is_locked_in_v1 BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS paused_reason_code VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS retry_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ NULL;

ALTER TABLE processing_warnings
  ADD COLUMN IF NOT EXISTS severity VARCHAR(15) NOT NULL DEFAULT 'MEDIUM';

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS requires_dual_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL,
  ADD CONSTRAINT chk_dual_approval_diff_actor CHECK (
    NOT requires_dual_approval OR decided_by_membership_id IS NULL OR decided_by_membership_id <> requested_by_membership_id
  );

ALTER TABLE report_versions
  ADD COLUMN IF NOT EXISTS algorithm_version VARCHAR(20) NOT NULL DEFAULT '1.0.0';
```
