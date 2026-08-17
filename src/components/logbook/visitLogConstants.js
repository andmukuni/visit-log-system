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

export {
  VISIT_JOURNEY_STEPS,
  VISIT_STATUS_ALIASES,
  resolveJourneyStatusKey,
  resolveJourneyLabel,
} from '../../../shared/visitJourney.js';
