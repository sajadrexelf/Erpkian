import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type ErpkianDb = Database.Database;

export function openErpkianDatabase(dbPath?: string): ErpkianDb {
  const resolved = dbPath ?? process.env.ERPKIAN_DB_PATH ?? path.resolve(process.cwd(), 'data', 'erpkian.sqlite');
  if (resolved !== ':memory:') {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyErpkianSchema(db);
  return db;
}

export function applyErpkianSchema(db: ErpkianDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      business_type_code TEXT NOT NULL DEFAULT 'distribution_wholesale',
      base_currency_code TEXT NOT NULL DEFAULT 'IRR',
      display_currency_code TEXT NOT NULL DEFAULT 'IRT',
      is_demo_synthetic INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organization_settings (
      organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
      default_invoice_due_days INTEGER NOT NULL DEFAULT 30,
      allow_negative_stock INTEGER NOT NULL DEFAULT 0,
      require_dual_approval_above_irr INTEGER NOT NULL DEFAULT 500000000,
      inventory_valuation_method TEXT NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
      default_tax_rate_pct REAL NOT NULL DEFAULT 10,
      ocr_min_quality_score REAL NOT NULL DEFAULT 0.65,
      ocr_auto_review_confidence REAL NOT NULL DEFAULT 0.85,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      code TEXT NOT NULL,
      name_fa TEXT NOT NULL,
      UNIQUE (organization_id, id),
      UNIQUE (organization_id, code)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name_fa TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_fa TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      code TEXT PRIMARY KEY,
      module_name TEXT NOT NULL,
      description_fa TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id),
      permission_code TEXT NOT NULL REFERENCES permissions(code),
      PRIMARY KEY (role_id, permission_code)
    );

    CREATE TABLE IF NOT EXISTS organization_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      UNIQUE (organization_id, user_id),
      UNIQUE (organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS membership_roles (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      role_id TEXT NOT NULL REFERENCES roles(id),
      branch_scope_id TEXT NULL REFERENCES branches(id),
      UNIQUE (membership_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS fiscal_years (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      code TEXT NOT NULL,
      name_fa TEXT NOT NULL,
      start_date_iso TEXT NOT NULL,
      end_date_iso TEXT NOT NULL,
      start_jalali TEXT NOT NULL,
      end_jalali TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      UNIQUE (organization_id, code)
    );

    CREATE TABLE IF NOT EXISTS fiscal_periods (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      fiscal_year_id TEXT NOT NULL REFERENCES fiscal_years(id),
      period_number INTEGER NOT NULL,
      name_fa TEXT NOT NULL,
      start_date_iso TEXT NOT NULL,
      end_date_iso TEXT NOT NULL,
      start_jalali TEXT NOT NULL,
      end_jalali TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SOFT_LOCKED', 'CLOSED')),
      UNIQUE (organization_id, fiscal_year_id, period_number)
    );

    CREATE TABLE IF NOT EXISTS period_locks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      fiscal_period_id TEXT NOT NULL REFERENCES fiscal_periods(id),
      action TEXT NOT NULL CHECK (action IN ('CLOSE', 'SOFT_LOCK', 'REOPEN')),
      reason_fa TEXT NOT NULL,
      actor_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      canonical_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      is_customer INTEGER NOT NULL DEFAULT 1,
      is_supplier INTEGER NOT NULL DEFAULT 0,
      credit_limit_irr INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MERGED')),
      merged_into_contact_id TEXT NULL REFERENCES contacts(id),
      created_at TEXT NOT NULL,
      UNIQUE (organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS contact_identifiers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      identifier_type TEXT NOT NULL,
      identifier_value TEXT NOT NULL,
      UNIQUE (organization_id, identifier_type, identifier_value)
    );

    CREATE TABLE IF NOT EXISTS entity_match_candidates (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      entity_domain TEXT NOT NULL CHECK (entity_domain IN ('CONTACT', 'PRODUCT')),
      source_raw_name TEXT NOT NULL,
      candidate_entity_id TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'MERGED', 'CREATED_NEW', 'REJECTED')),
      source_document_id TEXT NULL,
      resolved_by_membership_id TEXT NULL,
      resolved_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      sku TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      base_uom_name TEXT NOT NULL DEFAULT 'عدد',
      default_sale_price_irr INTEGER NOT NULL DEFAULT 0,
      default_purchase_price_irr INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE (organization_id, sku)
    );

    CREATE TABLE IF NOT EXISTS product_units (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      uom_name TEXT NOT NULL,
      conversion_to_base REAL NOT NULL CHECK (conversion_to_base > 0),
      UNIQUE (organization_id, product_id, uom_name)
    );

    CREATE TABLE IF NOT EXISTS document_storage_objects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      storage_key TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      sha256_hash TEXT NOT NULL,
      is_immutable_original INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      branch_id TEXT NULL REFERENCES branches(id),
      document_type_code TEXT NOT NULL DEFAULT 'UNKNOWN',
      title_fa TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'Uploaded' CHECK (
        lifecycle_status IN ('Uploaded', 'Processing', 'Needs Review', 'Verified', 'Eligible for Posting', 'Posted', 'Rejected')
      ),
      duplicate_of_document_id TEXT NULL REFERENCES documents(id),
      uploaded_by_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      uploaded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      version_number INTEGER NOT NULL,
      version_kind TEXT NOT NULL CHECK (version_kind IN ('ORIGINAL', 'MERGED_PDF', 'IMAGE_ENHANCED')),
      storage_object_id TEXT NOT NULL REFERENCES document_storage_objects(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_pages (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      document_version_id TEXT NOT NULL REFERENCES document_versions(id),
      page_number INTEGER NOT NULL,
      storage_object_id TEXT NOT NULL REFERENCES document_storage_objects(id),
      quality_score REAL NULL,
      is_blurry_flagged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS document_relations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      relation_role TEXT NOT NULL DEFAULT 'PRIMARY',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_access_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      actor_membership_id TEXT NOT NULL,
      action TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extraction_jobs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      status TEXT NOT NULL DEFAULT 'QUEUED',
      engine_adapter TEXT NOT NULL,
      created_at TEXT NOT NULL,
      finished_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS extraction_attempts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      extraction_job_id TEXT NOT NULL REFERENCES extraction_jobs(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      attempt_number INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      ocr_status TEXT NOT NULL,
      detected_doc_type TEXT NOT NULL DEFAULT 'UNKNOWN',
      detected_currency TEXT NULL,
      raw_payload_json TEXT NOT NULL,
      math_validation_passed INTEGER NOT NULL DEFAULT 0,
      average_confidence REAL NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extracted_fields (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      extraction_attempt_id TEXT NOT NULL REFERENCES extraction_attempts(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      field_key TEXT NOT NULL,
      raw_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      confidence REAL NOT NULL,
      bbox_json TEXT NULL,
      review_status TEXT NOT NULL DEFAULT 'UNREVIEWED' CHECK (review_status IN ('UNREVIEWED', 'FLAGGED', 'CORRECTED', 'CONFIRMED'))
    );

    CREATE TABLE IF NOT EXISTS extraction_reviews (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      extraction_attempt_id TEXT NOT NULL REFERENCES extraction_attempts(id),
      reviewer_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      decision TEXT NOT NULL CHECK (decision IN ('VERIFIED', 'REJECTED')),
      notes_fa TEXT NULL,
      reviewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extraction_corrections (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      extraction_review_id TEXT NOT NULL REFERENCES extraction_reviews(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      field_key TEXT NOT NULL,
      value_before TEXT NOT NULL,
      value_after TEXT NOT NULL,
      actor_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      branch_id TEXT NULL REFERENCES branches(id),
      fiscal_period_id TEXT NULL REFERENCES fiscal_periods(id),
      invoice_direction TEXT NOT NULL CHECK (invoice_direction IN ('SALE', 'PURCHASE', 'SALE_RETURN', 'PURCHASE_RETURN')),
      invoice_number TEXT NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      primary_document_id TEXT NULL REFERENCES documents(id),
      issue_date_iso TEXT NOT NULL,
      issue_jalali TEXT NOT NULL,
      due_date_iso TEXT NOT NULL,
      due_jalali TEXT NOT NULL,
      source_currency_code TEXT NOT NULL DEFAULT 'IRR',
      exchange_rate_to_base REAL NOT NULL DEFAULT 1,
      subtotal_irr INTEGER NOT NULL CHECK (subtotal_irr >= 0),
      line_discount_total_irr INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_total_irr >= 0),
      invoice_discount_irr INTEGER NOT NULL DEFAULT 0 CHECK (invoice_discount_irr >= 0),
      tax_total_irr INTEGER NOT NULL DEFAULT 0 CHECK (tax_total_irr >= 0),
      net_total_irr INTEGER NOT NULL CHECK (net_total_irr >= 0),
      lifecycle_status TEXT NOT NULL DEFAULT 'Needs Review' CHECK (
        lifecycle_status IN ('Needs Review', 'Verified', 'Awaiting Approval', 'Posted', 'Reversed', 'Cancelled')
      ),
      reversed_invoice_id TEXT NULL REFERENCES invoices(id),
      idempotency_key TEXT NULL,
      created_by_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      posted_by_membership_id TEXT NULL REFERENCES organization_memberships(id),
      posted_at TEXT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (organization_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      line_number INTEGER NOT NULL,
      product_id TEXT NULL REFERENCES products(id),
      description TEXT NOT NULL,
      uom_name TEXT NOT NULL DEFAULT 'عدد',
      conversion_to_base REAL NOT NULL DEFAULT 1,
      quantity REAL NOT NULL CHECK (quantity > 0),
      base_quantity REAL NOT NULL CHECK (base_quantity > 0),
      unit_price_irr REAL NOT NULL CHECK (unit_price_irr >= 0),
      is_promotional_free_item INTEGER NOT NULL DEFAULT 0,
      promo_reason TEXT NULL,
      discount_pct REAL NULL,
      discount_amount_irr INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_irr >= 0),
      tax_rate_pct REAL NOT NULL DEFAULT 10,
      tax_amount_irr INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount_irr >= 0),
      net_line_amount_irr INTEGER NOT NULL CHECK (net_line_amount_irr >= 0)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      branch_id TEXT NULL REFERENCES branches(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      movement_type TEXT NOT NULL CHECK (
        movement_type IN ('OPENING', 'PURCHASE_IN', 'SALE_OUT', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
      ),
      source_uom_name TEXT NOT NULL,
      source_qty REAL NOT NULL,
      base_qty_signed REAL NOT NULL CHECK (base_qty_signed <> 0),
      unit_cost_irr REAL NOT NULL DEFAULT 0,
      source_entity_type TEXT NOT NULL,
      source_entity_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      branch_id TEXT NULL REFERENCES branches(id),
      fiscal_period_id TEXT NULL REFERENCES fiscal_periods(id),
      direction TEXT NOT NULL CHECK (direction IN ('RECEIPT_IN', 'PAYMENT_OUT')),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      method TEXT NOT NULL CHECK (method IN ('CASH', 'POS', 'TRANSFER', 'CHEQUE')),
      source_currency_code TEXT NOT NULL DEFAULT 'IRR',
      exchange_rate_to_base REAL NOT NULL DEFAULT 1,
      amount_irr INTEGER NOT NULL CHECK (amount_irr > 0),
      tracking_code TEXT NULL,
      payment_date_iso TEXT NOT NULL,
      payment_jalali TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'Posted' CHECK (lifecycle_status IN ('Needs Review', 'Verified', 'Posted', 'Reversed')),
      idempotency_key TEXT NULL,
      created_by_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      created_at TEXT NOT NULL,
      UNIQUE (organization_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS checks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      payment_id TEXT NOT NULL REFERENCES payments(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      check_direction TEXT NOT NULL CHECK (check_direction IN ('RECEIVABLE', 'PAYABLE')),
      sayad_id TEXT NOT NULL,
      amount_irr INTEGER NOT NULL CHECK (amount_irr > 0),
      due_date_iso TEXT NOT NULL,
      due_jalali TEXT NOT NULL,
      current_status TEXT NOT NULL DEFAULT 'IN_HAND' CHECK (current_status IN ('IN_HAND', 'DEPOSITED', 'ENDORSED', 'CLEARED', 'BOUNCED', 'CANCELLED')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS check_status_history (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      check_id TEXT NOT NULL REFERENCES checks(id),
      from_status TEXT NULL,
      to_status TEXT NOT NULL,
      note_fa TEXT NULL,
      actor_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      payment_id TEXT NOT NULL REFERENCES payments(id),
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      allocated_amount_irr INTEGER NOT NULL CHECK (allocated_amount_irr > 0),
      allocation_method TEXT NOT NULL CHECK (allocation_method IN ('EXPLICIT', 'FIFO_AUTO')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVERSED')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      target_entity_type TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      required_permission_code TEXT NOT NULL,
      requires_dual_approval INTEGER NOT NULL DEFAULT 1,
      amount_irr INTEGER NOT NULL,
      reason_fa TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      requested_by_membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      decided_by_membership_id TEXT NULL REFERENCES organization_memberships(id),
      decision_note_fa TEXT NULL,
      requested_at TEXT NOT NULL,
      decided_at TEXT NULL,
      CHECK (NOT requires_dual_approval OR decided_by_membership_id IS NULL OR decided_by_membership_id <> requested_by_membership_id)
    );

    CREATE TABLE IF NOT EXISTS service_definitions (
      code TEXT PRIMARY KEY,
      category_code TEXT NOT NULL,
      priority TEXT NOT NULL,
      title_fa TEXT NOT NULL,
      required_permission_code TEXT NULL,
      is_locked_in_v1 INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS report_data_snapshots (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      as_of_date_iso TEXT NOT NULL,
      as_of_date_jalali TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      included_document_count INTEGER NOT NULL,
      pending_document_count INTEGER NOT NULL,
      confidence_level TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_executions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      service_code TEXT NOT NULL,
      branch_scope_id TEXT NULL,
      requested_by_membership_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_versions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      report_execution_id TEXT NOT NULL REFERENCES report_executions(id),
      data_snapshot_id TEXT NOT NULL REFERENCES report_data_snapshots(id),
      version_number INTEGER NOT NULL,
      supersedes_report_version_id TEXT NULL REFERENCES report_versions(id),
      algorithm_version TEXT NOT NULL DEFAULT '1.0.0',
      envelope_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_outputs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      report_version_id TEXT NOT NULL REFERENCES report_versions(id),
      output_format TEXT NOT NULL CHECK (output_format IN ('PDF', 'EXCEL', 'CSV', 'JSON')),
      storage_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      title_fa TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      sender TEXT NOT NULL CHECK (sender IN ('USER', 'ASSISTANT')),
      text_fa TEXT NOT NULL,
      widgets_json TEXT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_invocations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      conversation_id TEXT NULL REFERENCES conversations(id),
      membership_id TEXT NOT NULL REFERENCES organization_memberships(id),
      tool_name TEXT NOT NULL,
      service_code TEXT NOT NULL,
      output_status TEXT NOT NULL CHECK (output_status IN ('SUCCESS', 'DENIED', 'MISSING_INPUT', 'ERROR')),
      summary_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_membership_id TEXT NOT NULL,
      source_document_id TEXT NULL,
      before_state_json TEXT NULL,
      after_state_json TEXT NULL,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NULL,
      event_code TEXT NOT NULL,
      severity TEXT NOT NULL,
      actor_membership_id TEXT NULL,
      details_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_records (
      organization_id TEXT NOT NULL,
      endpoint_scope TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, endpoint_scope, idempotency_key)
    );

    -- Immutability triggers on audit_logs (Append-Only) and physical DELETE protection on invoices
    CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'AUDIT_LOGS_IMMUTABLE');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'AUDIT_LOGS_IMMUTABLE');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_invoices_no_delete
    BEFORE DELETE ON invoices
    BEGIN
      SELECT RAISE(ABORT, 'INVOICES_CANNOT_BE_PHYSICALLY_DELETED');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_invoices_posted_immutable
    BEFORE UPDATE ON invoices
    WHEN OLD.lifecycle_status = 'Posted' AND NOT (NEW.lifecycle_status = 'Reversed' AND OLD.net_total_irr = NEW.net_total_irr AND OLD.contact_id = NEW.contact_id AND OLD.issue_date_iso = NEW.issue_date_iso)
    BEGIN
      SELECT RAISE(ABORT, 'POSTED_INVOICE_IMMUTABLE');
    END;
  `);
}
