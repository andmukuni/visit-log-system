/**
 * Org notification category keys and visit-event → category mapping.
 * Used by admin settings, preference resolution, and Host prefs UI.
 */

export const LIFECYCLE_NOTIFICATION_KEYS = [
  'visit_registered',
  'visit_host_booking',
  'visit_pending_approval',
  'visit_approved',
  'visit_rejected',
  'visit_cancelled',
  'visit_rescheduled',
  'visit_reminder',
  'visit_arrived_gate',
  'visit_checked_in',
  'visit_waiting',
  'visit_checked_out',
];

/** Keys kept in settings for future phases — hidden from admin UI this phase. */
export const COMING_SOON_NOTIFICATION_KEYS = [
  'vehicle_registered',
  'emergency_roll_call',
  'incident_reported',
];

export const VISITOR_NOTIFICATION_KEYS = [
  ...LIFECYCLE_NOTIFICATION_KEYS,
  ...COMING_SOON_NOTIFICATION_KEYS,
];

/** Categories shown in Admin Settings and Host preference toggles. */
export const NOTIFICATION_CATEGORY_META = [
  { key: 'visit_registered', label: 'Visit registered / invite', description: 'When a visitor is invited or pre-registered.' },
  { key: 'visit_host_booking', label: 'Host booking confirmed', description: 'When a host or executive books a confirmed visit.' },
  { key: 'visit_pending_approval', label: 'Pending approval', description: 'When a visit is waiting for host approval.' },
  { key: 'visit_approved', label: 'Visit approved', description: 'When a host or security approves a visit.' },
  { key: 'visit_rejected', label: 'Visit rejected', description: 'When a visit request is declined.' },
  { key: 'visit_cancelled', label: 'Visit cancelled', description: 'When a visit is cancelled.' },
  { key: 'visit_rescheduled', label: 'Visit rescheduled', description: 'When a visit time is changed.' },
  { key: 'visit_reminder', label: 'Pre-arrival reminder', description: 'About one hour before expected arrival.' },
  { key: 'visit_arrived_gate', label: 'Arrived at gate', description: 'When a visitor (or vehicle) arrives at the gate.' },
  { key: 'visit_checked_in', label: 'Reception check-in', description: 'When a visitor checks in at reception.' },
  { key: 'visit_waiting', label: 'Waiting / in meeting', description: 'When a visitor is waiting or a meeting starts.' },
  { key: 'visit_checked_out', label: 'Visit check-out', description: 'When a visitor completes their visit.' },
];

/** SMS on by default for these lifecycle categories. */
export const DEFAULT_SMS_ENABLED_KEYS = [
  'visit_registered',
  'visit_host_booking',
  'visit_pending_approval',
  'visit_approved',
  'visit_rejected',
  'visit_cancelled',
  'visit_rescheduled',
  'visit_reminder',
  'visit_arrived_gate',
  'visit_checked_in',
  'visit_waiting',
  'emergency_roll_call',
  'incident_reported',
];

export const EVENT_CATEGORY_MAP = {
  pre_registered: 'visit_registered',
  host_booking: 'visit_host_booking',
  pending_approval: 'visit_pending_approval',
  approved: 'visit_approved',
  rejected: 'visit_rejected',
  cancelled: 'visit_cancelled',
  rescheduled: 'visit_rescheduled',
  pre_arrival_reminder: 'visit_reminder',
  arrived_at_gate: 'visit_arrived_gate',
  entered_premises: 'visit_arrived_gate',
  reception_check_in: 'visit_checked_in',
  checked_in: 'visit_checked_in',
  waiting: 'visit_waiting',
  in_meeting: 'visit_waiting',
  checked_out: 'visit_checked_out',
  left_premises: 'visit_checked_out',
};

export function categoryKeyForEvent(eventType) {
  return EVENT_CATEGORY_MAP[eventType] || null;
}
