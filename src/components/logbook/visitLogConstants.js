export const VISIT_EVENT_LABELS = {
  registered: 'Registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  arrived_at_gate: 'Arrived at gate',
  reception_check_in: 'Reception check-in',
  entered_premises: 'Entered premises',
  in_meeting: 'In meeting',
  left_premises: 'Left premises',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  gate_arrival: 'Gate arrival',
  expired: 'Expired',
};

export const VISIT_JOURNEY_STEPS = [
  { key: 'expected', label: 'Expected' },
  { key: 'approved', label: 'Approved' },
  { key: 'arrived_at_gate', label: 'At gate' },
  { key: 'reception_check_in', label: 'Reception' },
  { key: 'checked_in', label: 'On site' },
  { key: 'in_meeting', label: 'In meeting' },
  { key: 'checked_out', label: 'Checked out' },
  { key: 'left_premises', label: 'Left premises' },
  { key: 'completed', label: 'Completed' },
];

export const VISIT_STATUS_ALIASES = {
  pre_registered: 'expected',
  // Default for a pre-arrival approval request. Overridden to 'checked_in' in
  // resolveJourneyStatusKey when the visitor already has a check-in timestamp —
  // reception can only queue an on-site visitor to pending_approval, so that
  // case must keep showing "On site" instead of regressing to "Expected".
  pending_approval: 'expected',
  entered_premises: 'reception_check_in',
  waiting: 'in_meeting',
};

/**
 * Resolve a raw visit status to its VISIT_JOURNEY_STEPS key, so any UI
 * showing status can agree with the "Progress through the company" tracker
 * instead of the raw technical status. Returns null for terminal/exception
 * statuses (rejected, cancelled, etc.) that aren't part of the journey.
 */
export function resolveJourneyStatusKey(status, hasCheckedIn) {
  const normalized = status === 'pending_approval' && hasCheckedIn
    ? 'checked_in'
    : VISIT_STATUS_ALIASES[status] || status;
  return VISIT_JOURNEY_STEPS.some((step) => step.key === normalized) ? normalized : null;
}
