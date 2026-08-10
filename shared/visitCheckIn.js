/** Visit statuses that can be checked in at reception / gate kiosk. */
export const CHECK_IN_ELIGIBLE_STATUSES = Object.freeze([
  'approved',
  'expected',
  'arrived_at_gate',
  'entered_premises',
]);

export function isCheckInEligible(status) {
  return CHECK_IN_ELIGIBLE_STATUSES.includes(String(status || '').toLowerCase());
}
