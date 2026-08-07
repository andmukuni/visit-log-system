/**
 * PDF-aligned visitor privacy — VIP/VVIP contact masking and classification rules.
 */

import { maskPhone, maskEmail } from './reportMasking.js';
import { permissionMatches } from './rbacPermissions.js';

export const VISITOR_CLASSIFICATIONS = ['standard', 'vip', 'vvip'];

/** PDF §8 — roles that may view full VIP/VVIP contact details */
export const EXECUTIVE_FULL_CONTACT_PERMISSION = 'executive.full_contact';
export const EXECUTIVE_ASSIGN_VIP_PERMISSION = 'executive.assign_vip';

/** PDF §9 — visitor journey statuses */
export const PDF_VISIT_STATUSES = [
  'expected',
  'arrived_at_gate',
  'entered_premises',
  'reception_check_in',
  'waiting',
  'in_meeting',
  'checked_out',
  'left_premises',
];

/** PDF §9 — vehicle journey statuses */
export const PDF_VEHICLE_STATUSES = [
  'expected',
  'arrived_at_gate',
  'entry_approved',
  'on_site',
  'exit_gate',
  'exited',
];

export function canViewFullVipContact(permissions = []) {
  return permissionMatches(permissions, EXECUTIVE_FULL_CONTACT_PERMISSION)
    || permissionMatches(permissions, 'super_admin')
    || (permissions || []).includes('*');
}

export function canAssignVipClassification(permissions = []) {
  return permissionMatches(permissions, EXECUTIVE_ASSIGN_VIP_PERMISSION)
    || permissionMatches(permissions, 'super_admin')
    || (permissions || []).includes('*');
}

export function isRestrictedClassification(classification = 'standard') {
  const c = String(classification || 'standard').toLowerCase();
  return c === 'vip' || c === 'vvip';
}

export function resolveVisitClassification(row = {}) {
  return String(row.classification || row.category_classification || 'standard').toLowerCase();
}

/**
 * Mask visitor/visit fields per PDF §8 for VIP/VVIP when caller lacks executive access.
 */
export function maskVisitForViewer(row = {}, permissions = []) {
  const classification = resolveVisitClassification(row);
  if (!isRestrictedClassification(classification)) {
    return { ...row };
  }
  if (canViewFullVipContact(permissions)) {
    return { ...row, _vipContactVisible: true };
  }

  const masked = { ...row };
  if (masked.phone) masked.phone = maskPhone(masked.phone);
  if (masked.email) masked.email = maskEmail(masked.email);
  if (masked.id_number) masked.id_number = '***';
  if (masked.id_number_masked) masked.id_number_masked = '***';
  if (masked.confidential_notes) masked.confidential_notes = '[Confidential]';
  if (masked.purpose) masked.purpose = '[Confidential meeting details]';
  masked._vipContactMasked = true;
  return masked;
}

export function maskVisitRows(rows = [], permissions = []) {
  return rows.map((row) => maskVisitForViewer(row, permissions));
}
