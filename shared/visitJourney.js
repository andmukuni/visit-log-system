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

/**
 * Label for in_meeting — host sees their guest as "Guest with you";
 * everyone else sees the generic "With host".
 */
export function resolveInMeetingLabel({ viewerHostId, visitHostId } = {}) {
  const viewer = viewerHostId != null ? String(viewerHostId) : '';
  const assigned = visitHostId != null ? String(visitHostId) : '';
  if (viewer && assigned && viewer === assigned) {
    return 'Guest with you';
  }
  return 'With host';
}

/** Journey step label for a status key, or null if it has no journey equivalent. */
export function resolveJourneyLabel(status, hasCheckedIn, options = {}) {
  const key = resolveJourneyStatusKey(status, hasCheckedIn);
  if (!key) return null;
  if (key === 'in_meeting') {
    return resolveInMeetingLabel({
      viewerHostId: options.viewerHostId,
      visitHostId: options.visitHostId,
    });
  }
  return VISIT_JOURNEY_STEPS.find((step) => step.key === key)?.label || null;
}

/** Display label for a journey step key (e.g. progress tracker). */
export function resolveJourneyStepLabel(stepKey, options = {}) {
  if (stepKey === 'in_meeting') {
    return resolveInMeetingLabel(options);
  }
  return VISIT_JOURNEY_STEPS.find((step) => step.key === stepKey)?.label || null;
}

/** Status badge props for list/table rows — aligns wording with journey + action stages. */
export function resolveVisitStatusDisplay(status, hasCheckedIn = false, options = {}) {
  const journeyKey = resolveJourneyStatusKey(status, hasCheckedIn);
  const journeyLabel = resolveJourneyLabel(status, hasCheckedIn, options);
  if (journeyKey && journeyLabel) {
    return { status: journeyKey, label: journeyLabel };
  }
  return { status, label: null };
}
