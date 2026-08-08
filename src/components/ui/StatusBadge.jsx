import {
  CheckCircle2, Clock, XCircle, AlertCircle, CircleDot, LogIn, LogOut, Shield,
} from 'lucide-react';

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
  expected: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/20', icon: Clock },
  pre_registered: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/20', icon: Clock },
  pending_approval: { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-600/20', icon: Clock },
  checked_in: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-600/20', icon: LogIn },
  checked_out: { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-500/20', icon: LogOut },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', icon: XCircle },
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
};

function formatStatusLabel(status, normalized) {
  if (labelMap[normalized]) return labelMap[normalized];
  if (!status) return '—';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function StatusBadge({ status, size = 'sm' }) {
  const normalized = status?.toLowerCase() || 'default';
  const colors = colorMap[normalized] || colorMap.default;
  const Icon = colors.icon || CircleDot;
  const displayLabel = formatStatusLabel(status, normalized);

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses[size]}`}
    >
      <Icon size={size === 'sm' ? 12 : 14} aria-hidden="true" />
      {displayLabel}
    </span>
  );
}
