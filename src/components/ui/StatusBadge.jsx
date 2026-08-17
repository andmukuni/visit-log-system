import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Clock,
  LogIn,
  LogOut,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { VISIT_STATUS_ALIASES } from '../../../shared/visitJourney.js';

const colorMap = {
  upcoming: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/20', icon: Clock },
  ongoing: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20', icon: CircleDot },
  completed: { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-500/20', icon: CheckCircle2 },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', icon: XCircle },
  featured: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-600/20', icon: AlertCircle },
  draft: { bg: 'bg-gray-50', text: 'text-gray-500', ring: 'ring-gray-500/20', icon: Clock },
  published: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20', icon: CheckCircle2 },
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/20', icon: CheckCircle2 },
  attended: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-600/20', icon: CheckCircle2 },
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-600/20', icon: Clock },
  waitlisted: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/20', icon: Clock },
  past: { bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-400/20', icon: Clock },
  closed: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-600/20', icon: XCircle },
  paid: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20', icon: CheckCircle2 },
  unpaid: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', icon: XCircle },
  not_required: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-600/20', icon: CheckCircle2 },
  free: { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-600/20', icon: CheckCircle2 },
  waived: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-600/20', icon: CheckCircle2 },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/20', icon: CheckCircle2 },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/20', icon: CheckCircle2 },
  inactive: { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-500/20', icon: CircleDot },
  expected: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-600/20', icon: Clock },
  arrived_at_gate: { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-600/20', icon: ShieldCheck },
  entered_premises: { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-600/20', icon: ShieldCheck },
  pre_registered: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-600/20', icon: Clock },
  pending_approval: { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-600/20', icon: Clock },
  reception_check_in: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-600/20', icon: UserCheck },
  checked_in: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20', icon: LogIn },
  waiting: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-600/20', icon: Users },
  in_meeting: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-600/20', icon: UserCheck },
  checked_out: { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-500/20', icon: LogOut },
  left_premises: { bg: 'bg-slate-50', text: 'text-slate-600', ring: 'ring-slate-500/20', icon: LogOut },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', icon: XCircle },
  denied: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', icon: XCircle },
  expired: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-600/20', icon: AlertCircle },
  overdue: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-600/20', icon: AlertCircle },
  on_site: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20', icon: LogIn },
  departed: { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-500/20', icon: LogOut },
  default: { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-500/20', icon: Shield },
};

const labelMap = {
  not_required: 'Complimentary',
  waived: 'Waived',
  paid: 'Paid',
  unpaid: 'Unpaid',
  pending: 'Pending',
  failed: 'Failed',
  confirmed: 'Confirmed',
  attended: 'Attended',
  cancelled: 'Cancelled',
  waitlisted: 'Waitlisted',
  draft: 'Draft',
  published: 'Published',
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  past: 'Past',
  closed: 'Closed',
  free: 'Free',
  active: 'Active',
  inactive: 'Inactive',
  expected: 'Expected',
  pre_registered: 'Pre-registered',
  arrived_at_gate: 'At gate',
  entered_premises: 'Entered premises',
  approved: 'Approved',
  pending_approval: 'Pending approval',
  reception_check_in: 'At reception',
  checked_in: 'Checked in',
  waiting: 'Waiting for host',
  in_meeting: 'With host',
  checked_out: 'Checked out',
  left_premises: 'Left premises',
  completed: 'Completed',
  rejected: 'Rejected',
  denied: 'Denied',
  expired: 'Expired',
  overdue: 'Overdue',
  on_site: 'On site',
  departed: 'Departed',
};

function normalizeStatusKey(status) {
  const raw = String(status || 'default')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  // Collapse visit statuses that mean the same thing in different places
  // (e.g. 'waiting' and 'in_meeting') onto one canonical key, so every page
  // that renders a visit status agrees on wording and color. These keys are
  // exclusive to visits — no other entity in the app uses them.
  return VISIT_STATUS_ALIASES[raw] || raw;
}

function formatStatusLabel(status, normalized) {
  if (labelMap[normalized]) return labelMap[normalized];
  if (!status) return '—';
  return String(status)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function StatusBadge({ status, size = 'sm', iconOnly = false, label }) {
  const normalized = normalizeStatusKey(status);
  const colors = colorMap[normalized] || colorMap.default;
  const Icon = colors.icon || CircleDot;
  const displayLabel = label || formatStatusLabel(status, normalized);
  const iconSize = size === 'sm' ? 12 : 14;

  const sizeClasses = iconOnly
    ? {
      sm: 'h-7 w-7 justify-center',
      md: 'h-8 w-8 justify-center',
    }
    : {
      sm: 'text-xs px-2 py-0.5 gap-1',
      md: 'text-sm px-2.5 py-1 gap-1.5',
    };

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full font-medium ring-1 ring-inset whitespace-nowrap ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses[size]}`}
      aria-label={displayLabel}
    >
      <Icon size={iconOnly ? (size === 'sm' ? 14 : 16) : iconSize} className="shrink-0" aria-hidden="true" />
      {!iconOnly ? <span className="truncate">{displayLabel}</span> : null}
    </span>
  );
}
