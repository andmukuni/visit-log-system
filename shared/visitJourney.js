/**
 * Canonical visit lifecycle vocabulary — the single source of truth for how
 * a visit's status is described to a reader, so every page (log book,
 * calendar, gate, reception, host, security, admin) agrees on wording
 * instead of each surfacing its own raw technical status label.
 */

export const VISIT_JOURNEY_STEPS = [
  { key: 'expected', label: 'Expected' },
  { key: 'approved', label: 'Approved' },
  { key: 'arrived_at_gate', label: 'At gate' },
  { key: 'reception_check_in', label: 'Reception' },
  { key: 'waiting', label: 'Waiting for host' },
  { key: 'in_meeting', label: 'With host' },
  { key: 'checked_out', label: 'Checked out' },
  { key: 'left_premises', label: 'Left premises' },
  { key: 'completed', label: 'Completed' },
];

export const VISIT_STATUS_ALIASES = {
  pre_registered: 'expected',
  pending_approval: 'expected',
  entered_premises: 'reception_check_in',
  checked_in: 'reception_check_in',
};

/**
 * Resolve a raw visit status to its VISIT_JOURNEY_STEPS key, so any UI
 * showing status can agree with the "Progress through the company" tracker
 * instead of the raw technical status. Returns null for terminal/exception
 * statuses (rejected, cancelled, etc.) that aren't part of the journey.
 */
export function resolveJourneyStatusKey(status, hasCheckedIn) {
  if (status === 'pending_approval' && hasCheckedIn) {
    return 'waiting';
  }
  if (status === 'rejected' && hasCheckedIn) {
    return 'reception_check_in';
  }
  const normalized = VISIT_STATUS_ALIASES[status] || status;
  return VISIT_JOURNEY_STEPS.some((step) => step.key === normalized) ? normalized : null;
}

/** Journey step label for a status key, or null if it has no journey equivalent. */
export function resolveJourneyLabel(status, hasCheckedIn) {
  const key = resolveJourneyStatusKey(status, hasCheckedIn);
  if (!key) return null;
  return VISIT_JOURNEY_STEPS.find((step) => step.key === key)?.label || null;
}

/** Status badge props for list/table rows — aligns wording with journey + action stages. */
export function resolveVisitStatusDisplay(status, hasCheckedIn = false) {
  const journeyKey = resolveJourneyStatusKey(status, hasCheckedIn);
  const journeyLabel = resolveJourneyLabel(status, hasCheckedIn);
  if (journeyKey && journeyLabel) {
    return { status: journeyKey, label: journeyLabel };
  }
  return { status, label: null };
}
