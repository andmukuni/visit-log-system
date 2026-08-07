import { canAssignVipClassification } from '../shared/visitorPrivacy.js';

export async function loadCategoryClassification(pool, categoryId, organisationId) {
  if (!categoryId) return 'standard';
  const [[cat]] = await pool.query(
    `SELECT classification, slug FROM visitor_categories
     WHERE id = ? AND organisation_id = ? LIMIT 1`,
    [categoryId, organisationId],
  );
  return String(cat?.classification || cat?.slug || 'standard').toLowerCase();
}

export async function assertCanAssignCategory(pool, {
  categoryId,
  organisationId,
  permissions,
}) {
  const classification = await loadCategoryClassification(pool, categoryId, organisationId);
  if (classification === 'vip' || classification === 'vvip') {
    if (!canAssignVipClassification(permissions)) {
      return {
        ok: false,
        status: 403,
        message: 'Only authorised executive roles may assign VIP or VVIP visitors.',
      };
    }
  }
  return { ok: true, classification };
}

export function permissionsFromRequest(req) {
  return req.adminClaims?.permissions || [];
}
