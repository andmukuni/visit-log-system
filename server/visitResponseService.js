import { maskVisitForViewer, maskVisitRows } from '../shared/visitorPrivacy.js';
import { writeAuditLog } from './auditService.js';

const VISIT_SELECT_FIELDS = `
  vis.*,
  v.full_name, v.phone, v.email, v.company, v.id_number_masked,
  vcd.id_type, vcd.id_number, vcd.confidential_notes,
  h.name AS host_name,
  vc.name AS category_name,
  vc.slug AS category_slug,
  COALESCE(vc.classification, 'standard') AS classification
`;

const VISIT_JOINS = `
  INNER JOIN visitors v ON v.id = vis.visitor_id
  LEFT JOIN visitor_contact_details vcd ON vcd.visitor_id = v.id
  LEFT JOIN hosts h ON h.id = vis.host_id
  LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
`;

export { VISIT_SELECT_FIELDS, VISIT_JOINS };

export async function formatVisitResponse(pool, row, permissions = [], { actorUserId, auditVipAccess = true } = {}) {
  if (!row) return row;

  const masked = maskVisitForViewer(row, permissions);

  if (auditVipAccess && masked._vipContactVisible && actorUserId) {
    const classification = String(row.classification || 'standard').toLowerCase();
    if (classification === 'vip' || classification === 'vvip') {
      await writeAuditLog(pool, {
        organisationId: row.organisation_id,
        actorUserId,
        action: 'vip.profile_access',
        targetType: 'visit',
        targetId: row.id,
        details: { classification, visitorId: row.visitor_id },
      });
    }
  }

  return masked;
}

export async function formatVisitListResponse(pool, rows, permissions = [], options = {}) {
  return Promise.all(rows.map((row) => formatVisitResponse(pool, maskVisitForViewer(row, permissions), permissions, options)));
}

export function applyVisitListMasking(rows, permissions = []) {
  return maskVisitRows(rows, permissions);
}
