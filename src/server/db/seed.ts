import { jalaliToIso } from '../../shared/jalali';
import type { PermissionCode, RoleCode } from '../../shared/contracts';
import type { ErpkianDb } from './schema';

const ROLES: Array<{ id: string; code: RoleCode; name_fa: string }> = [
  { id: 'role-owner', code: 'OWNER', name_fa: 'صاحب کسب‌وکار' },
  { id: 'role-ceo', code: 'CEO', name_fa: 'مدیرعامل' },
  { id: 'role-cfo', code: 'CFO', name_fa: 'مدیر مالی' },
  { id: 'role-senior-acc', code: 'SENIOR_ACCOUNTANT', name_fa: 'حسابدار ارشد' },
  { id: 'role-acc', code: 'ACCOUNTANT', name_fa: 'حسابدار' },
  { id: 'role-sales-mgr', code: 'SALES_MANAGER', name_fa: 'مدیر فروش' },
  { id: 'role-inv-mgr', code: 'INVENTORY_MANAGER', name_fa: 'مدیر انبار' },
  { id: 'role-operator', code: 'OPERATOR', name_fa: 'اپراتور ثبت سند' },
  { id: 'role-personal', code: 'PERSONAL_USER', name_fa: 'کاربر مستقل' },
];

const PERMISSIONS: Array<{ code: PermissionCode; module_name: string; description_fa: string }> = [
  { code: 'document:upload', module_name: 'Documents', description_fa: 'بارگذاری تصویر، PDF و فایل' },
  { code: 'document:review_ocr', module_name: 'OCR', description_fa: 'بازبینی و اصلاح استخراج OCR' },
  { code: 'invoice:draft', module_name: 'Financial', description_fa: 'ثبت پیش‌نویس فاکتور' },
  { code: 'invoice:verify', module_name: 'Financial', description_fa: 'تایید و ارتقا به Verified' },
  { code: 'invoice:post', module_name: 'Financial', description_fa: 'ثبت قطعی فاکتور (Posted)' },
  { code: 'invoice:reverse', module_name: 'Financial', description_fa: 'صدور سند معکوس' },
  { code: 'payment:post', module_name: 'Treasury', description_fa: 'ثبت دریافت/پرداخت و تخصیص' },
  { code: 'check:manage', module_name: 'Treasury', description_fa: 'مدیریت چک صیادی' },
  { code: 'bank:reconcile', module_name: 'Reconciliation', description_fa: 'مغایرت‌گیری بانک' },
  { code: 'ar:view_aging', module_name: 'Financial', description_fa: 'مشاهده سنی مطالبات مشتریان' },
  { code: 'ar:draft_reminder', module_name: 'Financial', description_fa: 'تهیه یادآوری وصول مطالبات' },
  { code: 'inventory:move', module_name: 'Inventory', description_fa: 'ثبت حرکات و موجودی انبار' },
  { code: 'inventory:reconcile', module_name: 'Inventory', description_fa: 'مغایرت‌گیری انبارگردانی' },
  { code: 'inventory:post_adjustment', module_name: 'Inventory', description_fa: 'ثبت قطعی تعدیل انبار' },
  { code: 'report:view_cost_profit', module_name: 'Profitability', description_fa: 'مشاهده بهای خرید و سود' },
  { code: 'report:export', module_name: 'Reporting', description_fa: 'دانلود رسمی PDF/Excel/CSV' },
  { code: 'period:soft_lock', module_name: 'Fiscal', description_fa: 'قفل موقت دوره مالی' },
  { code: 'period:close_reopen', module_name: 'Fiscal', description_fa: 'بستن یا بازگشایی دوره مالی' },
  { code: 'tax:prepare_validate', module_name: 'Tax', description_fa: 'پیش‌نویس و اعتبارسنجی مالیاتی' },
  { code: 'org:manage_rbac_sync', module_name: 'Core', description_fa: 'مدیریت سازمان، نقش‌ها و تنظیمات' },
];

const ROLE_PERMISSION_MAP: Record<RoleCode, PermissionCode[]> = {
  OWNER: PERMISSIONS.map((p) => p.code),
  CEO: ['ar:view_aging', 'report:view_cost_profit', 'report:export', 'invoice:post'],
  CFO: PERMISSIONS.map((p) => p.code),
  SENIOR_ACCOUNTANT: [
    'document:upload', 'document:review_ocr', 'invoice:draft', 'invoice:verify', 'invoice:post',
    'payment:post', 'check:manage', 'bank:reconcile', 'ar:view_aging', 'ar:draft_reminder',
    'inventory:move', 'inventory:reconcile', 'report:view_cost_profit', 'report:export',
    'period:soft_lock', 'tax:prepare_validate',
  ],
  ACCOUNTANT: [
    'document:upload', 'document:review_ocr', 'invoice:draft', 'invoice:verify',
    'check:manage', 'bank:reconcile', 'ar:view_aging', 'ar:draft_reminder',
    'inventory:move', 'report:export', 'tax:prepare_validate',
  ],
  SALES_MANAGER: ['invoice:draft', 'ar:view_aging', 'ar:draft_reminder', 'report:export'],
  INVENTORY_MANAGER: ['document:upload', 'document:review_ocr', 'inventory:move', 'inventory:reconcile', 'report:export'],
  OPERATOR: ['document:upload', 'invoice:draft'],
  PERSONAL_USER: [
    'document:upload', 'document:review_ocr', 'invoice:draft', 'invoice:verify', 'invoice:post',
    'invoice:reverse', 'payment:post', 'check:manage', 'ar:view_aging', 'report:view_cost_profit', 'report:export',
  ],
};

const SERVICES = [
  { code: 'DOC-INGEST-001', cat: 'A', prio: 'P0', title: 'دریافت، بارگذاری و کنترل تکراری اسناد', perm: 'document:upload', locked: 0 },
  { code: 'DOC-MERGE-002', cat: 'A', prio: 'P0', title: 'ادغام چند تصویر و ساخت سند چندصفحه‌ای', perm: 'document:upload', locked: 0 },
  { code: 'DOC-OCR-003', cat: 'A', prio: 'P0', title: 'استخراج متن، فیلدها و جداول سند', perm: 'document:review_ocr', locked: 0 },
  { code: 'DOC-CLASS-004', cat: 'A', prio: 'P0', title: 'تشخیص نوع و جهت مالی سند', perm: 'document:review_ocr', locked: 0 },
  { code: 'DOC-MATH-005', cat: 'A', prio: 'P0', title: 'کنترل ریاضی، تاریخ شمسی و واحد پول', perm: 'document:review_ocr', locked: 0 },
  { code: 'DOC-ENTITY-006', cat: 'A', prio: 'P0', title: 'تطبیق و یکتاسازی طرف‌حساب و کالا', perm: 'invoice:verify', locked: 0 },
  { code: 'DOC-REVIEW-007', cat: 'A', prio: 'P0', title: 'بازبینی انسانی و ثبت اصلاحات OCR', perm: 'document:review_ocr', locked: 0 },
  { code: 'DOC-POST-008', cat: 'A', prio: 'P0', title: 'تایید نهایی و ثبت قطعی سند مالی', perm: 'invoice:post', locked: 0 },
  { code: 'FIN-AR-INV-001', cat: 'B', prio: 'P0', title: 'ثبت و کنترل فاکتور فروش', perm: 'invoice:draft', locked: 0 },
  { code: 'FIN-AR-PAY-002', cat: 'B', prio: 'P0', title: 'ثبت دریافت وجه از مشتری', perm: 'payment:post', locked: 0 },
  { code: 'FIN-AR-ALLOC-003', cat: 'B', prio: 'P0', title: 'تخصیص پرداخت به فاکتورها (صریح / FIFO)', perm: 'payment:post', locked: 0 },
  { code: 'FIN-AR-AGING-001', cat: 'B', prio: 'P0', title: 'تحلیل بدهی معوق و گزارش سنی مطالبات', perm: 'ar:view_aging', locked: 0 },
  { code: 'RPT-DASH-001', cat: 'H', prio: 'P0', title: 'داشبورد وضعیت مالی مدیران', perm: null, locked: 0 },
  { code: 'RPT-EXPORT-001', cat: 'H', prio: 'P0', title: 'خروجی رسمی Excel / PDF / CSV با شواهد', perm: 'report:export', locked: 0 },
  { code: 'TAX-SUB-MOADIAN-001', cat: 'I', prio: 'P3', title: 'ارسال رسمی به سامانه مودیان (قفل در نسخه ۱)', perm: null, locked: 1 },
  { code: 'TAX-SUB-RETURN-001', cat: 'I', prio: 'P3', title: 'ارسال رسمی اظهارنامه و گزارش فصلی (قفل در نسخه ۱)', perm: null, locked: 1 },
];

const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export function seedErpkianDatabase(db: ErpkianDb): void {
  const existingOrg = db.prepare('SELECT id FROM organizations LIMIT 1').get();
  if (existingOrg) return;

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const insRole = db.prepare('INSERT OR IGNORE INTO roles (id, code, name_fa) VALUES (?, ?, ?)');
    for (const r of ROLES) insRole.run(r.id, r.code, r.name_fa);

    const insPerm = db.prepare('INSERT OR IGNORE INTO permissions (code, module_name, description_fa) VALUES (?, ?, ?)');
    for (const p of PERMISSIONS) insPerm.run(p.code, p.module_name, p.description_fa);

    const insRp = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES (?, ?)');
    for (const r of ROLES) {
      for (const pCode of ROLE_PERMISSION_MAP[r.code]) {
        insRp.run(r.id, pCode);
      }
    }

    const insSvc = db.prepare(
      'INSERT OR IGNORE INTO service_definitions (code, category_code, priority, title_fa, required_permission_code, is_locked_in_v1) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const s of SERVICES) insSvc.run(s.code, s.cat, s.prio, s.title, s.perm, s.locked);

    // Users
    const insUser = db.prepare('INSERT INTO users (id, email, full_name_fa, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)');
    insUser.run('user-owner', 'owner@ariagostar.demo', 'مهندس رضا کیانی (صاحب کسب‌وکار)', 'dev-hash-only', now);
    insUser.run('user-cfo', 'cfo@ariagostar.demo', 'خانم مریم راد (مدیر مالی)', 'dev-hash-only', now);
    insUser.run('user-acc', 'acc@ariagostar.demo', 'آقای علی محمدی (حسابدار ارشد)', 'dev-hash-only', now);
    insUser.run('user-inv', 'inv@ariagostar.demo', 'آقای حسین کریمی (مدیر انبار)', 'dev-hash-only', now);
    insUser.run('user-beta', 'owner@beta.demo', 'آقای سهراب تهرانی (سازمان دوم)', 'dev-hash-only', now);

    // Org A (Synthetic Demo Distribution Co) & Org B (Tenant Isolation Test Co)
    const insOrg = db.prepare(
      'INSERT INTO organizations (id, name, business_type_code, base_currency_code, display_currency_code, is_demo_synthetic, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insOrg.run('org-demo-aria', 'پخش آریا گستر (داده آزمایشی Synthetic)', 'distribution_wholesale', 'IRR', 'IRT', 1, now);
    insOrg.run('org-demo-beta', 'بازرگانی نمونه دوم (Tenant B)', 'distribution_wholesale', 'IRR', 'IRR', 1, now);

    const insSet = db.prepare(
      `INSERT INTO organization_settings
      (organization_id, default_invoice_due_days, allow_negative_stock, require_dual_approval_above_irr, inventory_valuation_method, default_tax_rate_pct, ocr_min_quality_score, ocr_auto_review_confidence, updated_at)
      VALUES (?, 30, 0, 500000000, 'WEIGHTED_AVERAGE', 10, 0.65, 0.85, ?)`
    );
    insSet.run('org-demo-aria', now);
    insSet.run('org-demo-beta', now);

    const insBranch = db.prepare('INSERT INTO branches (id, organization_id, code, name_fa) VALUES (?, ?, ?, ?)');
    insBranch.run('br-aria-hq', 'org-demo-aria', 'HQ', 'شعبه مرکزی تهران');
    insBranch.run('br-aria-west', 'org-demo-aria', 'WEST', 'شعبه غرب');
    insBranch.run('br-beta-hq', 'org-demo-beta', 'HQ', 'شعبه مرکزی');

    const insMem = db.prepare(`INSERT INTO organization_memberships (id, organization_id, user_id, status) VALUES (?, ?, ?, 'ACTIVE')`);
    insMem.run('mem-aria-owner', 'org-demo-aria', 'user-owner');
    insMem.run('mem-aria-cfo', 'org-demo-aria', 'user-cfo');
    insMem.run('mem-aria-acc', 'org-demo-aria', 'user-acc');
    insMem.run('mem-aria-inv', 'org-demo-aria', 'user-inv');
    insMem.run('mem-beta-owner', 'org-demo-beta', 'user-beta');

    const insMr = db.prepare('INSERT INTO membership_roles (id, organization_id, membership_id, role_id, branch_scope_id) VALUES (?, ?, ?, ?, ?)');
    insMr.run('mr-1', 'org-demo-aria', 'mem-aria-owner', 'role-owner', null);
    insMr.run('mr-2', 'org-demo-aria', 'mem-aria-cfo', 'role-cfo', null);
    insMr.run('mr-3', 'org-demo-aria', 'mem-aria-acc', 'role-senior-acc', null);
    insMr.run('mr-4', 'org-demo-aria', 'mem-aria-inv', 'role-inv-mgr', 'br-aria-west');
    insMr.run('mr-5', 'org-demo-beta', 'mem-beta-owner', 'role-owner', null);

    // Fiscal Year 1405 for both Orgs
    const insFy = db.prepare(
      `INSERT INTO fiscal_years (id, organization_id, code, name_fa, start_date_iso, end_date_iso, start_jalali, end_jalali, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`
    );
    insFy.run('fy-aria-1405', 'org-demo-aria', '1405', 'سال مالی ۱۴۰۵', jalaliToIso('1405/01/01'), jalaliToIso('1405/12/29'), '1405/01/01', '1405/12/29');
    insFy.run('fy-beta-1405', 'org-demo-beta', '1405', 'سال مالی ۱۴۰۵', jalaliToIso('1405/01/01'), jalaliToIso('1405/12/29'), '1405/01/01', '1405/12/29');

    const insFp = db.prepare(
      'INSERT INTO fiscal_periods (id, organization_id, fiscal_year_id, period_number, name_fa, start_date_iso, end_date_iso, start_jalali, end_jalali, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const endDay = m <= 6 ? '31' : m <= 11 ? '30' : '29';
      const sJal = `1405/${mm}/01`;
      const eJal = `1405/${mm}/${endDay}`;
      const status = m <= 5 ? 'CLOSED' : 'OPEN';
      insFp.run(`fp-aria-1405-${mm}`, 'org-demo-aria', 'fy-aria-1405', m, `${JALALI_MONTH_NAMES[m - 1]} ۱۴۰۵`, jalaliToIso(sJal), jalaliToIso(eJal), sJal, eJal, status);
      insFp.run(`fp-beta-1405-${mm}`, 'org-demo-beta', 'fy-beta-1405', m, `${JALALI_MONTH_NAMES[m - 1]} ۱۴۰۵`, jalaliToIso(sJal), jalaliToIso(eJal), sJal, eJal, 'OPEN');
    }

    // Contacts
    const insContact = db.prepare(
      `INSERT INTO contacts (id, organization_id, canonical_name, normalized_name, is_customer, is_supplier, credit_limit_irr, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`
    );
    insContact.run('cnt-aria-bahar', 'org-demo-aria', 'فروشگاه زنجیره‌ای بهار (نمونه)', 'فروشگاه زنجیره ای بهار نمونه', 1, 0, 2000000000, now);
    insContact.run('cnt-aria-alborz', 'org-demo-aria', 'پخش مواد غذایی البرز (نمونه)', 'پخش مواد غذایی البرز نمونه', 1, 0, 1500000000, now);
    insContact.run('cnt-aria-pars', 'org-demo-aria', 'کارخانجات روغن پارس (نمونه)', 'کارخانجات روغن پارس نمونه', 0, 1, 0, now);
    insContact.run('cnt-beta-sadaf', 'org-demo-beta', 'مشتری محرمانه سازمان دوم (صرفاً تست ایزولاسیون)', 'مشتری محرمانه سازمان دوم', 1, 0, 500000000, now);

    db.prepare('INSERT INTO contact_identifiers (id, organization_id, contact_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?, ?)')
      .run('cid-1', 'org-demo-aria', 'cnt-aria-bahar', 'NATIONAL_ID', '10103456789');

    // Products + Multi-UoM + Opening Inventory
    const insProd = db.prepare(
      'INSERT INTO products (id, organization_id, sku, canonical_name, normalized_name, base_uom_name, default_sale_price_irr, default_purchase_price_irr, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    insProd.run('prd-aria-oil', 'org-demo-aria', 'OIL-5L', 'روغن سرخ‌کردنی ۵ لیتری (نمونه)', 'روغن سرخ کردنی ۵ لیتری نمونه', 'بطری', 3500000, 2900000, now);
    insProd.run('prd-aria-paste', 'org-demo-aria', 'TOM-800', 'رب گوجه فرنگی ۸۰۰ گرمی (نمونه)', 'رب گوجه فرنگی ۸۰۰ گرمی نمونه', 'قوطی', 950000, 760000, now);
    insProd.run('prd-aria-rice', 'org-demo-aria', 'RIC-10K', 'برنج هاشمی ۱۰ کیلویی (نمونه)', 'برنج هاشمی ۱۰ کیلویی نمونه', 'کیسه', 14500000, 12500000, now);

    const insPu = db.prepare('INSERT INTO product_units (id, organization_id, product_id, uom_name, conversion_to_base) VALUES (?, ?, ?, ?, ?)');
    insPu.run('pu-1', 'org-demo-aria', 'prd-aria-oil', 'کارتن', 4);
    insPu.run('pu-2', 'org-demo-aria', 'prd-aria-paste', 'کارتن', 12);

    const insMov = db.prepare(
      'INSERT INTO inventory_movements (id, organization_id, branch_id, product_id, movement_type, source_uom_name, source_qty, base_qty_signed, unit_cost_irr, source_entity_type, source_entity_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    insMov.run('mov-seed-1', 'org-demo-aria', 'br-aria-hq', 'prd-aria-oil', 'OPENING', 'بطری', 400, 400, 2900000, 'OPENING_SEED', 'seed-1', now);
    insMov.run('mov-seed-2', 'org-demo-aria', 'br-aria-hq', 'prd-aria-paste', 'OPENING', 'قوطی', 600, 600, 760000, 'OPENING_SEED', 'seed-2', now);
    insMov.run('mov-seed-3', 'org-demo-aria', 'br-aria-hq', 'prd-aria-rice', 'OPENING', 'کیسه', 150, 150, 12500000, 'OPENING_SEED', 'seed-3', now);

    // Seed Synthetic Invoices + Payment + Pending Sayad Check for Immediate Verifiable Vertical Slice
    const insInv = db.prepare(
      `INSERT INTO invoices
      (id, organization_id, branch_id, fiscal_period_id, invoice_direction, invoice_number, contact_id, primary_document_id,
       issue_date_iso, issue_jalali, due_date_iso, due_jalali, source_currency_code, exchange_rate_to_base,
       subtotal_irr, line_discount_total_irr, invoice_discount_irr, tax_total_irr, net_total_irr, lifecycle_status,
       idempotency_key, created_by_membership_id, posted_by_membership_id, posted_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'IRR', 1, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insLine = db.prepare(
      `INSERT INTO invoice_lines
      (id, organization_id, invoice_id, line_number, product_id, description, uom_name, conversion_to_base, quantity, base_quantity,
       unit_price_irr, is_promotional_free_item, promo_reason, discount_pct, discount_amount_irr, tax_rate_pct, tax_amount_irr, net_line_amount_irr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 10, ?, ?)`
    );

    // Invoice 1: Overdue > 45 days (1405/06/10 due 1405/07/10, 80,000,000 IRR total, 30,000,000 IRR cleared paid -> 50,000,000 IRR open)
    insInv.run(
      'inv-demo-1', 'org-demo-aria', 'br-aria-hq', 'fp-aria-1405-06', 'SALE', 'S-1405-1001', 'cnt-aria-alborz',
      jalaliToIso('1405/06/10'), '1405/06/10', jalaliToIso('1405/07/10'), '1405/07/10',
      72727273, 0, 7272727, 80000000, 'Posted', 'seed-inv-1', 'mem-aria-acc', 'mem-aria-cfo', now, now
    );
    insLine.run('inl-demo-1', 'org-demo-aria', 'inv-demo-1', 1, 'prd-aria-oil', 'روغن سرخ‌کردنی ۵ لیتری (نمونه)', 'بطری', 1, 20, 20, 3636363.65, 0, 0, 7272727, 80000000);

    // Invoice 2: Overdue ~5 days (1405/07/20 due 1405/08/20, 40,000,000 IRR, covered by IN_HAND Sayad check -> still open AR!)
    insInv.run(
      'inv-demo-2', 'org-demo-aria', 'br-aria-hq', 'fp-aria-1405-07', 'SALE', 'S-1405-1002', 'cnt-aria-alborz',
      jalaliToIso('1405/07/20'), '1405/07/20', jalaliToIso('1405/08/20'), '1405/08/20',
      36363636, 0, 3636364, 40000000, 'Posted', 'seed-inv-2', 'mem-aria-acc', 'mem-aria-cfo', now, now
    );
    insLine.run('inl-demo-2', 'org-demo-aria', 'inv-demo-2', 1, 'prd-aria-paste', 'رب گوجه فرنگی ۸۰۰ گرمی (نمونه)', 'قوطی', 1, 40, 40, 909090.9, 0, 0, 3636364, 40000000);

    // Invoice 3: Bahar store Needs Review (excluded from official aging until Verified + Posted!)
    insInv.run(
      'inv-demo-3', 'org-demo-aria', 'br-aria-west', 'fp-aria-1405-08', 'SALE', 'S-1405-1003', 'cnt-aria-bahar',
      jalaliToIso('1405/08/18'), '1405/08/18', jalaliToIso('1405/09/18'), '1405/09/18',
      114000000, 0, 11400000, 125400000, 'Needs Review', 'seed-inv-3', 'mem-aria-acc', null, null, now
    );
    insLine.run('inl-demo-3', 'org-demo-aria', 'inv-demo-3', 1, 'prd-aria-rice', 'برنج هاشمی ۱۰ کیلویی (نمونه)', 'کیسه', 1, 8, 8, 14250000, 0, 0, 11400000, 125400000);

    // Org B confidential invoice (for Cross-Tenant isolation testing)
    insInv.run(
      'inv-beta-secret', 'org-demo-beta', 'br-beta-hq', 'fp-beta-1405-08', 'SALE', 'B-1405-999', 'cnt-beta-sadaf',
      jalaliToIso('1405/08/15'), '1405/08/15', jalaliToIso('1405/09/15'), '1405/09/15',
      90000000, 0, 9000000, 99000000, 'Posted', 'seed-beta-1', 'mem-beta-owner', 'mem-beta-owner', now, now
    );

    // Cleared Payment 30M IRR on inv-demo-1 + Pending Sayad Check 40M IRR on inv-demo-2
    const insPay = db.prepare(
      `INSERT INTO payments (id, organization_id, branch_id, fiscal_period_id, direction, contact_id, method, source_currency_code, exchange_rate_to_base, amount_irr, tracking_code, payment_date_iso, payment_jalali, lifecycle_status, idempotency_key, created_by_membership_id, created_at)
       VALUES (?, ?, ?, ?, 'RECEIPT_IN', ?, ?, 'IRR', 1, ?, ?, ?, ?, 'Posted', ?, ?, ?)`
    );
    insPay.run('pay-demo-1', 'org-demo-aria', 'br-aria-hq', 'fp-aria-1405-07', 'cnt-aria-alborz', 'TRANSFER', 30000000, 'TRK-884210', jalaliToIso('1405/07/12'), '1405/07/12', 'seed-pay-1', 'mem-aria-acc', now);
    insPay.run('pay-demo-2', 'org-demo-aria', 'br-aria-hq', 'fp-aria-1405-08', 'cnt-aria-alborz', 'CHEQUE', 40000000, 'SAYAD-123456', jalaliToIso('1405/08/01'), '1405/08/01', 'seed-pay-2', 'mem-aria-acc', now);

    db.prepare(`INSERT INTO payment_allocations (id, organization_id, payment_id, invoice_id, allocated_amount_irr, allocation_method, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`)
      .run('alloc-demo-1', 'org-demo-aria', 'pay-demo-1', 'inv-demo-1', 30000000, 'EXPLICIT', now);

    db.prepare(`INSERT INTO checks (id, organization_id, payment_id, contact_id, check_direction, sayad_id, amount_irr, due_date_iso, due_jalali, current_status, created_at) VALUES (?, ?, ?, ?, 'RECEIVABLE', ?, ?, ?, ?, 'IN_HAND', ?)`)
      .run('chk-demo-1', 'org-demo-aria', 'pay-demo-2', 'cnt-aria-alborz', '4001234567890123', 40000000, jalaliToIso('1405/09/05'), '1405/09/05', now);

    db.prepare(`INSERT INTO check_status_history (id, organization_id, check_id, from_status, to_status, note_fa, actor_membership_id, occurred_at) VALUES (?, ?, ?, NULL, 'IN_HAND', 'ثبت چک صیادی دریافتی (داده نمونه)', ?, ?)`)
      .run('chkh-demo-1', 'org-demo-aria', 'chk-demo-1', 'mem-aria-acc', now);
  });

  tx();
}
