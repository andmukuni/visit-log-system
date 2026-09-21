import { visitHasCheckedIn } from './visitCheckout.js';

/** Pre-arrival bookings that can still be cancelled. */
export const CANCEL_ELIGIBLE_STATUSES = Object.freeze([
  'pre_registered',
  'pending_approval',
  'approved',
  'expected',
]);

function normalizeStatus(statusOrVisit) {
  if (statusOrVisit && typeof statusOrVisit === 'object') {
    return String(statusOrVisit.visit_status || statusOrVisit.status || '').toLowerCase();
  }
  return String(statusOrVisit || '').toLowerCase();
}

function resolveVisit(statusOrVisit, visit) {
  if (visit && typeof visit === 'object') return visit;
  if (statusOrVisit && typeof statusOrVisit === 'object') return statusOrVisit;
  return null;
}

/** True when a booking has not arrived and can still be cancelled. */
export function isCancelEligible(statusOrVisit, visit = null) {
  const row = resolveVisit(statusOrVisit, visit);
  if (visitHasCheckedIn(row)) return false;
  return CANCEL_ELIGIBLE_STATUSES.includes(normalizeStatus(statusOrVisit));
}
