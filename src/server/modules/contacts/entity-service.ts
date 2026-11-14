import { normalizePersianText } from '../../../shared/jalali';
import type { ErpkianDb } from '../../db/schema';
import {
  ErpkianAppError,
  newId,
  recordAuditLog,
  requirePermission,
  type TenantMembershipContext,
} from '../../kernel/context';

function diceSimilarity(a: string, b: string): number {
  const s1 = normalizePersianText(a).replace(/\s+/g, '');
  const s2 = normalizePersianText(b).replace(/\s+/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      hits++;
      bigrams.set(bg, count - 1);
    }
  }
  return Number(((2 * hits) / (s1.length + s2.length - 2)).toFixed(3));
}

export function resolveOrSuggestContact(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  rawName: string,
  sourceDocumentId?: string
): {
  exact_match: { id: string; canonical_name: string } | null;
  candidates: Array<{ contact_id: string; canonical_name: string; score: number }>;
} {
  const norm = normalizePersianText(rawName);
  const contacts = db
    .prepare(`SELECT id, canonical_name, normalized_name FROM contacts WHERE organization_id = ? AND status = 'ACTIVE'`)
    .all(ctx.organizationId) as Array<{ id: string; canonical_name: string; normalized_name: string }>;

  const exact = contacts.find((c) => c.normalized_name === norm);
  if (exact) {
    return { exact_match: { id: exact.id, canonical_name: exact.canonical_name }, candidates: [] };
  }

  const scored = contacts
    .map((c) => ({
      contact_id: c.id,
      canonical_name: c.canonical_name,
      score: diceSimilarity(rawName, c.canonical_name),
    }))
    .filter((c) => c.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  for (const cand of scored) {
    const already = db
      .prepare(
        `SELECT id FROM entity_match_candidates
         WHERE organization_id = ? AND entity_domain = 'CONTACT' AND source_raw_name = ? AND candidate_entity_id = ? AND status = 'PENDING'`
      )
      .get(ctx.organizationId, rawName, cand.contact_id);
    if (!already) {
      db.prepare(
        `INSERT INTO entity_match_candidates (id, organization_id, entity_domain, source_raw_name, candidate_entity_id, similarity_score, status, source_document_id)
         VALUES (?, ?, 'CONTACT', ?, ?, ?, 'PENDING', ?)`
      ).run(newId('emc'), ctx.organizationId, rawName, cand.contact_id, cand.score, sourceDocumentId ?? null);
    }
  }

  return { exact_match: null, candidates: scored };
}

export function listContacts(db: ErpkianDb, ctx: TenantMembershipContext) {
  return db
    .prepare(
      `SELECT id, canonical_name, is_customer, is_supplier, credit_limit_irr, status, created_at
       FROM contacts
       WHERE organization_id = ? AND status = 'ACTIVE'
       ORDER BY canonical_name ASC`
    )
    .all(ctx.organizationId);
}

export function createContact(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  input: { canonicalName: string; isCustomer?: boolean; isSupplier?: boolean; creditLimitIrr?: number }
) {
  requirePermission(db, ctx, 'invoice:draft');
  const clean = input.canonicalName?.trim();
  if (!clean) {
    throw new ErpkianAppError(400, 'CONTACT_NAME_REQUIRED', 'نام طرف‌حساب الزامی است.');
  }
  const id = newId('cnt');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO contacts (id, organization_id, canonical_name, normalized_name, is_customer, is_supplier, credit_limit_irr, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`
  ).run(
    id,
    ctx.organizationId,
    clean,
    normalizePersianText(clean),
    input.isCustomer === false ? 0 : 1,
    input.isSupplier ? 1 : 0,
    input.creditLimitIrr ?? 0,
    now
  );

  recordAuditLog(db, {
    organizationId: ctx.organizationId,
    entityType: 'CONTACT',
    entityId: id,
    action: 'CONTACT_CREATED',
    actorMembershipId: ctx.membershipId,
    afterState: { canonical_name: clean },
  });

  return { id, canonical_name: clean };
}

export function listProductsWithStock(db: ErpkianDb, ctx: TenantMembershipContext) {
  const products = db
    .prepare(
      `SELECT p.id, p.sku, p.canonical_name, p.base_uom_name, p.default_sale_price_irr, p.default_purchase_price_irr,
              COALESCE((SELECT SUM(m.base_qty_signed) FROM inventory_movements m WHERE m.organization_id = p.organization_id AND m.product_id = p.id), 0) as stock_on_hand_base
       FROM products p
       WHERE p.organization_id = ?
       ORDER BY p.canonical_name ASC`
    )
    .all(ctx.organizationId) as Array<{
      id: string;
      sku: string;
      canonical_name: string;
      base_uom_name: string;
      default_sale_price_irr: number;
      default_purchase_price_irr: number;
      stock_on_hand_base: number;
    }>;

  const units = db
    .prepare(`SELECT product_id, uom_name, conversion_to_base FROM product_units WHERE organization_id = ?`)
    .all(ctx.organizationId) as Array<{ product_id: string; uom_name: string; conversion_to_base: number }>;

  return products.map((p) => ({
    ...p,
    units: [
      { uom_name: p.base_uom_name, conversion_to_base: 1 },
      ...units.filter((u) => u.product_id === p.id).map((u) => ({ uom_name: u.uom_name, conversion_to_base: u.conversion_to_base })),
    ],
  }));
}

export function resolveEntityCandidate(
  db: ErpkianDb,
  ctx: TenantMembershipContext,
  candidateId: string,
  action: 'MERGE' | 'CREATE_NEW' | 'REJECT'
) {
  requirePermission(db, ctx, 'invoice:verify');
  const row = db
    .prepare(`SELECT * FROM entity_match_candidates WHERE organization_id = ? AND id = ?`)
    .get(ctx.organizationId, candidateId) as
    | { id: string; entity_domain: string; source_raw_name: string; candidate_entity_id: string; status: string }
    | undefined;
  if (!row) {
    throw new ErpkianAppError(404, 'CANDIDATE_NOT_FOUND', 'کاندیدای تطبیق موجودیت یافت نشد.');
  }

  const now = new Date().toISOString();
  const nextStatus = action === 'MERGE' ? 'MERGED' : action === 'CREATE_NEW' ? 'CREATED_NEW' : 'REJECTED';
  let resolvedEntityId = row.candidate_entity_id;

  db.transaction(() => {
    if (action === 'CREATE_NEW' && row.entity_domain === 'CONTACT') {
      resolvedEntityId = newId('cnt');
      db.prepare(
        `INSERT INTO contacts (id, organization_id, canonical_name, normalized_name, is_customer, is_supplier, credit_limit_irr, status, created_at)
         VALUES (?, ?, ?, ?, 1, 0, 0, 'ACTIVE', ?)`
      ).run(resolvedEntityId, ctx.organizationId, row.source_raw_name, normalizePersianText(row.source_raw_name), now);
    }

    db.prepare(
      `UPDATE entity_match_candidates SET status = ?, resolved_by_membership_id = ?, resolved_at = ? WHERE id = ? AND organization_id = ?`
    ).run(nextStatus, ctx.membershipId, now, candidateId, ctx.organizationId);

    recordAuditLog(db, {
      organizationId: ctx.organizationId,
      entityType: 'ENTITY_MATCH_CANDIDATE',
      entityId: candidateId,
      action: `DOC_ENTITY_006_${nextStatus}`,
      actorMembershipId: ctx.membershipId,
      afterState: { status: nextStatus, resolved_entity_id: resolvedEntityId },
    });
  })();

  return { id: candidateId, status: nextStatus, resolved_entity_id: resolvedEntityId };
}
