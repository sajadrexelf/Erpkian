import type { ErpkianDb } from '../../db/schema';
import {
  ErpkianAppError,
  newId,
  recordAuditLog,
  recordSecurityEvent,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';

export function listSwitchablePersonas(db: ErpkianDb) {
  return db
    .prepare(
      `SELECT m.id as membership_id, m.organization_id, o.name as organization_name, o.is_demo_synthetic,
              u.full_name_fa, u.email, r.code as role_code, r.name_fa as role_name_fa, mr.branch_scope_id
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       JOIN organizations o ON o.id = m.organization_id
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       ORDER BY o.id ASC, m.id ASC`
    )
    .all();
}

export function getOrganizationSettings(db: ErpkianDb, ctx: TenantMembershipContext) {
  const settings = db
    .prepare('SELECT * FROM organization_settings WHERE organization_id = ?')
    .get(ctx.organizationId);
  const org = db
    .prepare('SELECT * FROM organizations WHERE id = ?')
    .get(ctx.organizationId);
  return { organization: org, settings };
}

export function updateOrganizationSettings(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  patch: {
    allow_negative_stock?: boolean;
    require_dual_approval_above_irr?: number;
    display_currency_code?: 'IRR' | 'IRT';
  }
) {
  requirePermission(db, ctx, 'org:manage_rbac_sync');
  const before = getOrganizationSettings(db, ctx);
  const now = new Date().toISOString();

  db.transaction(() => {
    if (patch.allow_negative_stock !== undefined) {
      db.prepare('UPDATE organization_settings SET allow_negative_stock = ?, updated_at = ? WHERE organization_id = ?')
        .run(patch.allow_negative_stock ? 1 : 0, now, ctx.organizationId);
    }
    if (patch.require_dual_approval_above_irr !== undefined) {
      if (patch.require_dual_approval_above_irr < 0) {
        throw new ErpkianAppError(400, 'INVALID_THRESHOLD', 'آستانه تایید دوامضایی نمی‌تواند منفی باشد.');
      }
      db.prepare('UPDATE organization_settings SET require_dual_approval_above_irr = ?, updated_at = ? WHERE organization_id = ?')
        .run(patch.require_dual_approval_above_irr, now, ctx.organizationId);
    }
    if (patch.display_currency_code) {
      db.prepare('UPDATE organizations SET display_currency_code = ? WHERE id = ?')
        .run(patch.display_currency_code, ctx.organizationId);
    }
    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'ORGANIZATION_SETTINGS',
      entityId: ctx.organizationId,
      action: 'SETTINGS_UPDATED',
      actorMembershipId: ctx.membershipId,
      beforeState: before,
      afterState: patch,
    });
  })();

  return getOrganizationSettings(db, ctx);
}

export function listFiscalPeriods(db: ErpkianDb, ctx: TenantMembershipContext) {
  return db
    .prepare(
      `SELECT fp.*, fy.code as fiscal_year_code
       FROM fiscal_periods fp
       JOIN fiscal_years fy ON fy.id = fp.fiscal_year_id
       WHERE fp.organization_id = ?
       ORDER BY fp.period_number ASC`
    )
    .all(ctx.organizationId);
}

export function transitionFiscalPeriod(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  periodId: string,
  action: 'CLOSE' | 'SOFT_LOCK' | 'REOPEN',
  reasonFa: string
) {
  if (action === 'SOFT_LOCK') {
    requirePermission(db, ctx, 'period:soft_lock');
  } else {
    requirePermission(db, ctx, 'period:close_reopen');
  }

  const fp = db
    .prepare('SELECT * FROM fiscal_periods WHERE organization_id = ? AND id = ?')
    .get(ctx.organizationId, periodId) as { id: string; name_fa: string; status: string } | undefined;

  if (!fp) {
    throw new ErpkianAppError(404, 'FISCAL_PERIOD_NOT_FOUND', 'دوره مالی یافت نشد.');
  }

  const nextStatus = action === 'CLOSE' ? 'CLOSED' : action === 'SOFT_LOCK' ? 'SOFT_LOCKED' : 'OPEN';
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare('UPDATE fiscal_periods SET status = ? WHERE id = ? AND organization_id = ?')
      .run(nextStatus, periodId, ctx.organizationId);

    db.prepare(
      `INSERT INTO period_locks (id, organization_id, fiscal_period_id, action, reason_fa, actor_membership_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(newId('plk'), ctx.organizationId, periodId, action, reasonFa || `تغییر وضعیت دوره توسط ${ctx.fullNameFa}`, ctx.membershipId, now);

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'FISCAL_PERIOD',
      entityId: periodId,
      action: `PERIOD_${action}`,
      actorMembershipId: ctx.membershipId,
      beforeState: { status: fp.status },
      afterState: { status: nextStatus, reason_fa: reasonFa },
    });
  })();

  return { id: periodId, name_fa: fp.name_fa, status: nextStatus };
}

export function listAuditAndSecurityLogs(db: ErpkianDb, ctx: TenantMembershipContext) {
  const auditLogs = db
    .prepare(
      `SELECT a.*, u.full_name_fa as actor_name
       FROM audit_logs a
       LEFT JOIN organization_memberships m ON m.id = a.actor_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE a.organization_id = ?
       ORDER BY a.occurred_at DESC
       LIMIT 60`
    )
    .all(ctx.organizationId);

  const securityEvents = db
    .prepare(
      `SELECT s.*, u.full_name_fa as actor_name
       FROM security_events s
       LEFT JOIN organization_memberships m ON m.id = s.actor_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE s.organization_id = ?
       ORDER BY s.occurred_at DESC
       LIMIT 40`
    )
    .all(ctx.organizationId);

  const services = db.prepare('SELECT * FROM service_definitions ORDER BY category_code ASC, code ASC').all();

  return { audit_logs: auditLogs, security_events: securityEvents, services };
}

export function attemptLockedTaxSubmission(db: ErpkianDb, ctx: TenantMembershipContext, serviceCode: string): never {
  recordSecurityEvent(db, {
    organizationId: ctx.organizationId,
    eventCode: 'LOCKED_SERVICE_ACCESS_ATTEMPT',
    severity: 'MEDIUM',
    actorMembershipId: ctx.membershipId,
    details: { service_code: serviceCode },
  });
  throw new ErpkianAppError(
    403,
    'FEATURE_LOCKED_IN_V1',
    `سرویس ${serviceCode} (ارسال رسمی به سامانه مودیان / اظهارنامه) در نسخه ۱ غیرفعال و قفل است.`
  );
}
