import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { ApiResponseEnvelope, PermissionCode, RoleCode } from '../../shared/contracts';
import { nowTehranParts } from '../../shared/jalali';
import type { ErpkianDb } from '../db/schema';

export class ErpkianAppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly messageFa: string;
  public readonly details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, messageFa: string, details?: Record<string, unknown>) {
    super(messageFa);
    this.statusCode = statusCode;
    this.code = code;
    this.messageFa = messageFa;
    this.details = details;
  }
}

export interface TenantMembershipContext {
  requestId: string;
  organizationId: string;
  organizationName: string;
  isDemoSynthetic: boolean;
  displayCurrencyCode: 'IRR' | 'IRT';
  membershipId: string;
  userId: string;
  fullNameFa: string;
  email: string;
  roles: RoleCode[];
  branchScopeId: string | null;
  permissions: Set<PermissionCode>;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function hashObject(obj: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj ?? {})).digest('hex');
}

export function recordAuditLog(
  db: ErpkianDb,
  params: {
    organizationId: string;
    entityType: string;
    entityId: string;
    action: string;
    actorMembershipId: string;
    sourceDocumentId?: string | null;
    beforeState?: unknown;
    afterState?: unknown;
  }
): string {
  const id = newId('aud');
  db.prepare(
    `INSERT INTO audit_logs (id, organization_id, entity_type, entity_id, action, actor_membership_id, source_document_id, before_state_json, after_state_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.organizationId,
    params.entityType,
    params.entityId,
    params.action,
    params.actorMembershipId,
    params.sourceDocumentId ?? null,
    params.beforeState !== undefined ? JSON.stringify(params.beforeState) : null,
    params.afterState !== undefined ? JSON.stringify(params.afterState) : null,
    new Date().toISOString()
  );
  return id;
}

export function recordSecurityEvent(
  db: ErpkianDb,
  params: {
    organizationId?: string | null;
    eventCode: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    actorMembershipId?: string | null;
    details: Record<string, unknown>;
  }
): string {
  const id = newId('sec');
  db.prepare(
    `INSERT INTO security_events (id, organization_id, event_code, severity, actor_membership_id, details_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.organizationId ?? null,
    params.eventCode,
    params.severity,
    params.actorMembershipId ?? null,
    JSON.stringify(params.details),
    new Date().toISOString()
  );
  return id;
}

export function resolveTenantContext(db: ErpkianDb, req: Request): TenantMembershipContext {
  const requestId = (req.header('x-request-id') || newId('req')).slice(0, 64);
  const membershipIdHeader = req.header('x-membership-id')?.trim();
  const orgIdHeader = req.header('x-organization-id')?.trim();

  const targetMembershipId = membershipIdHeader || 'mem-aria-owner';

  const row = db
    .prepare(
      `SELECT m.id as membership_id, m.organization_id, m.user_id, m.status as mem_status,
              u.full_name_fa, u.email, u.is_active,
              o.name as org_name, o.is_demo_synthetic, o.display_currency_code
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.id = ?`
    )
    .get(targetMembershipId) as
    | {
        membership_id: string;
        organization_id: string;
        user_id: string;
        mem_status: string;
        full_name_fa: string;
        email: string;
        is_active: number;
        org_name: string;
        is_demo_synthetic: number;
        display_currency_code: 'IRR' | 'IRT';
      }
    | undefined;

  if (!row || row.mem_status !== 'ACTIVE' || row.is_active !== 1) {
    recordSecurityEvent(db, {
      organizationId: orgIdHeader ?? null,
      eventCode: 'INVALID_MEMBERSHIP_TOKEN',
      severity: 'HIGH',
      actorMembershipId: targetMembershipId,
      details: { path: req.path, method: req.method },
    });
    throw new ErpkianAppError(401, 'AUTH_MEMBERSHIP_NOT_FOUND', 'عضویت یا کاربر معتبر نیست.');
  }

  // Cross-tenant spoofing guard: membership MUST belong to requested X-Organization-Id if sent
  if (orgIdHeader && orgIdHeader !== row.organization_id) {
    recordSecurityEvent(db, {
      organizationId: row.organization_id,
      eventCode: 'CROSS_TENANT_ACCESS_ATTEMPT',
      severity: 'HIGH',
      actorMembershipId: row.membership_id,
      details: {
        claimed_org: orgIdHeader,
        actual_org: row.organization_id,
        path: req.path,
      },
    });
    throw new ErpkianAppError(
      403,
      'CROSS_TENANT_ACCESS_DENIED',
      'دسترسی بین‌سازمانی مسدود شد؛ عضویت شما متعلق به سازمان درخواست‌شده نیست.'
    );
  }

  const roleRows = db
    .prepare(
      `SELECT r.code, mr.branch_scope_id
       FROM membership_roles mr
       JOIN roles r ON r.id = mr.role_id
       WHERE mr.membership_id = ? AND mr.organization_id = ?`
    )
    .all(row.membership_id, row.organization_id) as Array<{ code: RoleCode; branch_scope_id: string | null }>;

  const permRows = db
    .prepare(
      `SELECT DISTINCT rp.permission_code
       FROM membership_roles mr
       JOIN role_permissions rp ON rp.role_id = mr.role_id
       WHERE mr.membership_id = ? AND mr.organization_id = ?`
    )
    .all(row.membership_id, row.organization_id) as Array<{ permission_code: PermissionCode }>;

  const branchScope = roleRows.find((r) => r.branch_scope_id)?.branch_scope_id ?? null;

  return {
    requestId,
    organizationId: row.organization_id,
    organizationName: row.org_name,
    isDemoSynthetic: row.is_demo_synthetic === 1,
    displayCurrencyCode: row.display_currency_code === 'IRR' ? 'IRR' : 'IRT',
    membershipId: row.membership_id,
    userId: row.user_id,
    fullNameFa: row.full_name_fa,
    email: row.email,
    roles: roleRows.map((r) => r.code),
    branchScopeId: branchScope,
    permissions: new Set(permRows.map((p) => p.permission_code)),
  };
}

export function requirePermission(db: ErpkianDb, ctx: TenantMembershipContext, perm: PermissionCode): void {
  if (!ctx.permissions.has(perm)) {
    recordSecurityEvent(db, {
      organizationId: ctx.organizationId,
      eventCode: 'RBAC_PERMISSION_DENIED',
      severity: 'MEDIUM',
      actorMembershipId: ctx.membershipId,
      details: { required_permission: perm, roles: ctx.roles },
    });
    throw new ErpkianAppError(
      403,
      'RBAC_PERMISSION_DENIED',
      `دسترسی شما برای انجام این عملیات کافی نیست (نیازمند مجوز ${perm}).`,
      { required_permission: perm, current_roles: ctx.roles }
    );
  }
}

export function runIdempotent<T>(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  endpointScope: string,
  idempotencyKey: string | undefined,
  payload: unknown,
  action: () => { status?: number; body: T }
): { status: number; body: T; replayed: boolean } {
  const cleanKey = idempotencyKey?.trim();
  if (!cleanKey) {
    const out = action();
    return { status: out.status ?? 200, body: out.body, replayed: false };
  }

  const payloadHash = hashObject(payload);
  const existing = db
    .prepare(
      `SELECT payload_hash, response_status, response_json
       FROM idempotency_records
       WHERE organization_id = ? AND endpoint_scope = ? AND idempotency_key = ?`
    )
    .get(ctx.organizationId, endpointScope, cleanKey) as
    | { payload_hash: string; response_status: number; response_json: string }
    | undefined;

  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ErpkianAppError(
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        'این شناسه یکتا (Idempotency-Key) قبلاً برای داده متفاوتی استفاده شده است.'
      );
    }
    return {
      status: existing.response_status,
      body: JSON.parse(existing.response_json) as T,
      replayed: true,
    };
  }

  const out = action();
  const status = out.status ?? 200;
  db.prepare(
    `INSERT INTO idempotency_records (organization_id, endpoint_scope, idempotency_key, payload_hash, response_status, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(ctx.organizationId, endpointScope, cleanKey, payloadHash, status, JSON.stringify(out.body), new Date().toISOString());

  return { status, body: out.body, replayed: false };
}

export function sendOk<T>(
  res: Response,
  ctx: TenantMembershipContext | { requestId: string; organizationId: string | null; branchScopeId: string | null },
  data: T,
  statusCode = 200,
  pagination?: { cursor: string | null; limit: number; has_more: boolean }
): void {
  const tehran = nowTehranParts();
  const envelope: ApiResponseEnvelope<T> = {
    success: true,
    data,
    meta: {
      request_id: ctx.requestId,
      timestamp_utc: tehran.utcIso,
      timestamp_jalali: tehran.jalaliDateTime,
      organization_id: ctx.organizationId,
      branch_scope_id: ctx.branchScopeId,
      ...(pagination ? { pagination } : {}),
    },
    error: null,
  };
  res.status(statusCode).json(envelope);
}

export function sendError(
  res: Response,
  requestId: string,
  organizationId: string | null,
  branchScopeId: string | null,
  err: unknown
): void {
  const tehran = nowTehranParts();
  const appErr =
    err instanceof ErpkianAppError
      ? err
      : new ErpkianAppError(500, 'INTERNAL_SERVER_ERROR', err instanceof Error ? err.message : 'خطای غیرمنتظره سرور');

  const envelope: ApiResponseEnvelope<null> = {
    success: false,
    data: null,
    meta: {
      request_id: requestId,
      timestamp_utc: tehran.utcIso,
      timestamp_jalali: tehran.jalaliDateTime,
      organization_id: organizationId,
      branch_scope_id: branchScopeId,
    },
    error: {
      code: appErr.code,
      message_fa: appErr.messageFa,
      ...(appErr.details ? { details: appErr.details } : {}),
    },
  };
  res.status(appErr.statusCode).json(envelope);
}
