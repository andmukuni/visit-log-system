import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  Clock,
  Clock3,
  UserCheck,
  Users,
} from 'lucide-react';

const GLANCE_ITEMS = [
  {
    key: 'todayAppointments',
    label: 'Appointments Today',
    icon: CalendarCheck,
    iconWrap: 'bg-sky-100 text-sky-700',
    valueClass: 'text-navy-900',
  },
  {
    key: 'weekAppointments',
    label: 'This Week',
    icon: CalendarDays,
    iconWrap: 'bg-violet-100 text-violet-700',
    valueClass: 'text-violet-950',
  },
  {
    key: 'pendingApprovals',
    label: 'Awaiting Approval',
    icon: Clock3,
    iconWrap: 'bg-amber-100 text-amber-700',
    valueClass: 'text-navy-900',
  },
  {
    key: 'onSiteNow',
    label: 'Visitors On-Site',
    icon: UserCheck,
    iconWrap: 'bg-emerald-100 text-emerald-700',
    valueClass: 'text-navy-900',
  },
];

export function ExecutiveGlancePanel({ kpis = {} }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-900">Today at a Glance</p>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {GLANCE_ITEMS.map(({ key, label, icon: Icon, iconWrap, valueClass }) => (
          <div
            key={key}
            className="flex flex-col items-center rounded-xl bg-navy-50/50 px-2 py-3.5"
          >
            <div className="flex items-center gap-2.5">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
                <Icon size={18} strokeWidth={2.25} aria-hidden="true" />
              </span>
              <p className={`text-2xl font-bold tabular-nums leading-none tracking-tight ${valueClass}`}>
                {Number(kpis[key] ?? 0)}
              </p>
            </div>
            <p className="mt-2.5 text-center text-[11px] font-medium leading-snug text-gray-600">
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCountdown(scheduledAt) {
  const target = new Date(scheduledAt);
  if (Number.isNaN(target.getTime())) return '';

  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'Starting now';

  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `In ${hours}h ${minutes}m`;
  return `In ${minutes}m`;
}

function formatAppointmentTime(scheduledAt) {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function resolveAppointmentSubtitle(appointment) {
  if (appointment.category_name) return appointment.category_name;
  if (appointment.purpose?.trim()) return appointment.purpose.trim();
  if (appointment.company?.trim()) return appointment.company.trim();
  if (appointment.classification) {
    const label = String(appointment.classification).replace(/_/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return null;
}

export function ExecutiveNextAppointmentCard({ appointment, onViewDetails, onReschedule }) {
  if (!appointment) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">Next Appointment</p>
        <p className="mt-3 text-sm text-gray-500">No upcoming appointments scheduled.</p>
      </div>
    );
  }

  const title = appointment.title || appointment.visitor_name || 'Upcoming visit';
  const subtitle = resolveAppointmentSubtitle(appointment);
  const countdown = formatCountdown(appointment.scheduled_at);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">Next Appointment</p>

      <div className="mt-3 flex items-center gap-2 text-navy-900">
        <Clock size={18} strokeWidth={2} className="shrink-0 text-navy-700" aria-hidden="true" />
        <span className="text-2xl font-bold tabular-nums tracking-tight">
          {formatAppointmentTime(appointment.scheduled_at)}
        </span>
      </div>

      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-medium text-navy-900">{title}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
        )}
        {countdown && (
          <p className="mt-1.5 text-sm font-semibold text-emerald-600">{countdown}</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onViewDetails}
          className="rounded-xl border border-navy-900 bg-white px-3 py-2 text-xs font-semibold text-navy-900 transition-colors hover:bg-navy-50"
        >
          View Details
        </button>
        <button
          type="button"
          onClick={onReschedule}
          className="rounded-xl bg-navy-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800"
        >
          Reschedule
        </button>
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  {
    key: 'new',
    label: 'New Appointment',
    icon: CalendarPlus,
    action: 'new',
  },
  {
    key: 'visitors',
    label: 'View Visitors',
    icon: Users,
    to: '/executive/visitors',
  },
  {
    key: 'requests',
    label: 'Appointment Requests',
    icon: ClipboardList,
    to: '/executive/appointments',
    badgeKey: 'pendingApprovals',
  },
];

function QuickActionRowContent({ label, icon: Icon, badge = 0, showBadge = false }) {
  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
        <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy-800">{label}</span>
      {showBadge ? (
        <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-violet-600 px-2 text-[11px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : (
        <ChevronRight
          size={16}
          className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-600"
          aria-hidden="true"
        />
      )}
    </>
  );
}

export function ExecutiveQuickActions({ kpis = {}, onNewAppointment }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-900">Quick Actions</p>
      </div>
      <div className="divide-y divide-gray-100">
        {QUICK_ACTIONS.map(({ key, label, icon, to, action, badgeKey }) => {
          const badge = badgeKey ? Number(kpis[badgeKey] ?? 0) : 0;
          const rowClass = 'group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-navy-50/60';

          if (action === 'new') {
            return (
              <button
                key={key}
                type="button"
                onClick={onNewAppointment}
                className={rowClass}
              >
                <QuickActionRowContent label={label} icon={icon} />
              </button>
            );
          }

          return (
            <Link
              key={key}
              to={to}
              className={rowClass}
            >
              <QuickActionRowContent
                label={label}
                icon={icon}
                badge={badge}
                showBadge={Boolean(badgeKey)}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const VISITOR_TYPE_LEGEND = [
  { label: 'Standard', dot: 'bg-[#1a73e8]' },
  { label: 'VIP', dot: 'bg-violet-500' },
  { label: 'VVIP', dot: 'bg-amber-400' },
];

const STATUS_LEGEND = [
  { label: 'Confirmed', dot: 'bg-emerald-500' },
  { label: 'Pending', dot: 'bg-orange-400' },
  { label: 'Cancelled', dot: 'bg-red-500' },
  { label: 'Completed', dot: 'bg-gray-400' },
];

export function ExecutiveCalendarLegend({ className = '' }) {
  return (
    <div className={`border-t border-gray-200 bg-white px-4 py-3 sm:px-5 ${className}`}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Visitor type</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {VISITOR_TYPE_LEGEND.map(({ label, dot }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
                <span className="text-xs font-medium text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Status</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {STATUS_LEGEND.map(({ label, dot }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
                <span className="text-xs font-medium text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function mapNextAppointmentToCalendarRow(nextAppointment) {
  if (!nextAppointment) return null;
  return {
    id: nextAppointment.visit_id || nextAppointment.appointment_id,
    appointment_id: nextAppointment.appointment_id,
    visit_id: nextAppointment.visit_id,
    title: nextAppointment.title,
    visitor_name: nextAppointment.visitor_name,
    scheduled_at: nextAppointment.scheduled_at,
    status: nextAppointment.visit_status,
    classification: nextAppointment.classification,
    category_name: nextAppointment.category_name,
    purpose: nextAppointment.purpose,
    company: nextAppointment.company,
  };
}

export function formatExecutiveDashboardDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
