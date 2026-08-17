/** Visit statuses eligible for reception / host checkout. */
export const CHECKOUT_ELIGIBLE_STATUSES = Object.freeze([
  'checked_in',
  'reception_check_in',
  'waiting',
  'in_meeting',
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

export function isCheckoutEligible(status) {
  return CHECKOUT_ELIGIBLE_STATUSES.includes(String(status || '').toLowerCase());
}

export function isGateCheckoutEligible(status) {
  return GATE_CHECKOUT_ELIGIBLE_STATUSES.includes(String(status || '').toLowerCase());
}

export function isGateExitEligible(status) {
  return GATE_EXIT_ELIGIBLE_STATUSES.includes(String(status || '').toLowerCase());
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
