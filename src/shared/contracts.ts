export type RoleCode =
  | 'OWNER'
  | 'CEO'
  | 'CFO'
  | 'SENIOR_ACCOUNTANT'
  | 'ACCOUNTANT'
  | 'SALES_MANAGER'
  | 'INVENTORY_MANAGER'
  | 'OPERATOR'
  | 'PERSONAL_USER';

export type PermissionCode =
  | 'document:upload'
  | 'document:review_ocr'
  | 'invoice:draft'
  | 'invoice:verify'
  | 'invoice:post'
  | 'invoice:reverse'
  | 'payment:post'
  | 'check:manage'
  | 'bank:reconcile'
  | 'ar:view_aging'
  | 'ar:draft_reminder'
  | 'inventory:move'
  | 'inventory:reconcile'
  | 'inventory:post_adjustment'
  | 'report:view_cost_profit'
  | 'report:export'
  | 'period:soft_lock'
  | 'period:close_reopen'
  | 'tax:prepare_validate'
  | 'org:manage_rbac_sync';

export type DocumentLifecycleStatus =
  | 'Uploaded'
  | 'Processing'
  | 'Needs Review'
  | 'Verified'
  | 'Eligible for Posting'
  | 'Posted'
  | 'Rejected';

export type InvoiceLifecycleStatus =
  | 'Needs Review'
  | 'Verified'
  | 'Awaiting Approval'
  | 'Posted'
  | 'Reversed'
  | 'Cancelled';

export type InvoiceDirection = 'SALE' | 'PURCHASE' | 'SALE_RETURN' | 'PURCHASE_RETURN';
export type CurrencyCode = 'IRR' | 'IRT' | 'USD' | 'EUR';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type AgingBucketCode = 'CURRENT' | 'BUCKET_1_30' | 'BUCKET_31_60' | 'BUCKET_61_90' | 'BUCKET_90_PLUS';

export interface ApiErrorPayload {
  code: string;
  message_fa: string;
  details?: Record<string, unknown>;
}

export interface ApiResponseMeta {
  request_id: string;
  timestamp_utc: string;
  timestamp_jalali: string;
  organization_id: string | null;
  branch_scope_id: string | null;
  pagination?: {
    cursor: string | null;
    limit: number;
    has_more: boolean;
  };
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T | null;
  meta: ApiResponseMeta;
  error: ApiErrorPayload | null;
}

export interface ReportWarning {
  warning_code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message_fa: string;
  affected_record_ids: string[];
}

export interface ReportEvidenceItem {
  metric_key: string;
  source_entity_type:
    | 'INVOICE'
    | 'INVOICE_LINE'
    | 'PAYMENT'
    | 'PAYMENT_ALLOCATION'
    | 'CHECK'
    | 'BANK_TRANSACTION'
    | 'INVENTORY_MOVEMENT'
    | 'INVENTORY_ADJUSTMENT'
    | 'FINANCIAL_ADJUSTMENT';
  source_entity_id: string;
  source_document_id: string | null;
  contribution_amount_irr: number;
  document_number: string;
  issue_jalali: string;
  contact_name?: string;
}

export interface ReportSummaryMetric {
  metric_key: string;
  label_fa: string;
  value_irr: number;
  value_display: number;
  unit?: 'IRR' | 'IRT' | 'COUNT' | 'PCT';
  formula_code: string;
}

export interface NextBestAction {
  action_code: string;
  title_fa: string;
  target_service_code: string;
  target_route?: string;
}

export interface ErpkianReportEnvelope<TRow = Record<string, unknown>> {
  schema_version: '1.0.0';
  service_code: string;
  algorithm_version: string;
  formula_version: string;
  is_demo_synthetic_data: boolean;
  execution_meta: {
    organization_id: string;
    branch_scope_id: string | null;
    report_execution_id: string;
    report_version_id: string;
    version_number: number;
    generated_at_utc: string;
    generated_at_jalali: string;
    display_currency: CurrencyCode;
    canonical_currency: 'IRR';
    exchange_rate_applied: number;
  };
  data_snapshot: {
    data_snapshot_id: string;
    as_of_date_iso: string;
    as_of_date_jalali: string;
    snapshot_hash: string;
    included_document_count: number;
    pending_document_count: number;
    confidence_level: ConfidenceLevel;
  };
  summary_metrics: ReportSummaryMetric[];
  rows: TRow[];
  warnings_and_limitations: ReportWarning[];
  evidences: ReportEvidenceItem[];
  next_best_actions: NextBestAction[];
}

export type DeclarativeWidgetType =
  | 'NarrativeExplanationBlock'
  | 'KpiSummaryStrip'
  | 'ConfidenceAndWarningBanner'
  | 'InteractiveDataTable'
  | 'EvidenceDrawerTrigger'
  | 'ClarificationPromptCard'
  | 'NextBestActionChips';

export interface DeclarativeWidget {
  type: DeclarativeWidgetType;
  props: Record<string, unknown>;
}

export interface AgingCustomerRow {
  contact_id: string;
  contact_name: string;
  invoice_count: number;
  total_invoiced_irr: number;
  cleared_paid_irr: number;
  pending_cheques_irr: number;
  open_balance_irr: number;
  unallocated_credit_irr: number;
  current_irr: number;
  bucket_1_30_irr: number;
  bucket_31_60_irr: number;
  bucket_61_90_irr: number;
  bucket_90_plus_irr: number;
  max_days_past_due: number;
  evidence_invoice_ids: string[];
}
