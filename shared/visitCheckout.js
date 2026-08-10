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

export function isCheckoutEligible(status) {
  return CHECKOUT_ELIGIBLE_STATUSES.includes(String(status || '').toLowerCase());
}

export function isGateCheckoutEligible(status) {
  return GATE_CHECKOUT_ELIGIBLE_STATUSES.includes(String(status || '').toLowerCase());
}
