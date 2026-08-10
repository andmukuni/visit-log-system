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
  pending_approval: 'expected',
  entered_premises: 'reception_check_in',
  waiting: 'checked_in',
};
