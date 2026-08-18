/** Visit statuses eligible for reception / host checkout. */
export const CHECKOUT_ELIGIBLE_STATUSES = Object.freeze([
  'checked_in',
  'reception_check_in',
  'waiting',
  'in_meeting',
  'overdue',
]);

/** Gate kiosk checkout — includes arrivals logged at the gate before reception check-in. */
export const GATE_CHECKOUT_ELIGIBLE_STATUSES = Object.freeze([
  ...CHECKOUT_ELIGIBLE_STATUSES,
  'arrived_at_gate',
  'entered_premises',
]);

/**
 * Everyone the gate exit screen should list: visits still eligible for a
 * direct gate checkout, plus visits already checked out elsewhere (e.g.
 * reception) that are now just waiting on the gate to confirm they've
 * physically left the premises.
 */
export const GATE_EXIT_ELIGIBLE_STATUSES = Object.freeze([
  ...GATE_CHECKOUT_ELIGIBLE_STATUSES,
  'checked_out',
]);

export function visitHasCheckedIn(visit) {
  if (!visit || typeof visit !== 'object') return false;
  return Boolean(visit.checked_in_at || visit.check_in_at);
}

function normalizeCheckoutStatus(statusOrVisit) {
  if (statusOrVisit && typeof statusOrVisit === 'object') {
    return String(statusOrVisit.status || '').toLowerCase();
  }
  return String(statusOrVisit || '').toLowerCase();
}

function resolveCheckoutVisit(statusOrVisit, visit) {
  if (visit && typeof visit === 'object') return visit;
  if (statusOrVisit && typeof statusOrVisit === 'object') return statusOrVisit;
  return null;
}

function isOnSiteExceptionStatus(status, visit) {
  return ['pending_approval', 'rejected'].includes(status)
    && visitHasCheckedIn(visit);
}

export function isCheckoutEligible(statusOrVisit, visit) {
  const status = normalizeCheckoutStatus(statusOrVisit);
  if (CHECKOUT_ELIGIBLE_STATUSES.includes(status)) return true;
  return isOnSiteExceptionStatus(status, resolveCheckoutVisit(statusOrVisit, visit));
}

export function isGateCheckoutEligible(statusOrVisit, visit) {
  const status = normalizeCheckoutStatus(statusOrVisit);
  if (GATE_CHECKOUT_ELIGIBLE_STATUSES.includes(status)) return true;
  return isOnSiteExceptionStatus(status, resolveCheckoutVisit(statusOrVisit, visit));
}

export function isGateExitEligible(statusOrVisit, visit) {
  const status = normalizeCheckoutStatus(statusOrVisit);
  if (GATE_EXIT_ELIGIBLE_STATUSES.includes(status)) return true;
  return isOnSiteExceptionStatus(status, resolveCheckoutVisit(statusOrVisit, visit));
}

/** Gate / station checkout button copy. */
export function getGateCheckoutActionLabel(statusOrVisit) {
  return { label: 'Check out', loadingLabel: 'Checking out…' };
}

/** Visits that are no longer on the live reception desk workload for today. */
export const VISIT_CLOSED_STATUSES = Object.freeze([
  'cancelled',
  'rejected',
  'denied',
  'checked_out',
  'left_premises',
  'completed',
  'expired',
]);
