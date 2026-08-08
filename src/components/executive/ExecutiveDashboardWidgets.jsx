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

export function ExecutiveGlancePanel({ kpis = {}, compact = false }) {
  return (
    <div className="shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`border-b border-gray-100 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-900">Today at a Glance</p>
      </div>
      <div className={`grid grid-cols-2 grid-rows-2 ${compact ? 'gap-1.5 p-2' : 'gap-1.5 p-2.5'}`}>
        {GLANCE_ITEMS.map(({ key, label, icon: Icon, iconWrap, valueClass }) => (
          <div
            key={key}
            className={`flex min-h-[92px] flex-col items-center justify-center rounded-lg bg-navy-50/50 ${
              compact ? 'px-1 py-2' : 'px-1.5 py-2.5'
            }`}
          >
            <span className={`flex shrink-0 items-center justify-center rounded-md ${iconWrap} ${
              compact ? 'h-6 w-6' : 'h-7 w-7'
            }`}
            >
              <Icon size={compact ? 13 : 15} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <p className={`mt-1 font-bold tabular-nums leading-none tracking-tight ${valueClass} ${
              compact ? 'text-sm' : 'text-lg'
            }`}
            >
              {Number(kpis[key] ?? 0)}
            </p>
            <p className={`mt-1 line-clamp-2 text-center font-medium leading-snug text-gray-600 ${
              compact ? 'text-[10px]' : 'text-[11px]'
            }`}
            >
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

export function ExecutiveNextAppointmentCard({ appointment, onViewDetails, onReschedule, compact = false }) {
  if (!appointment) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${compact ? 'p-3' : 'p-4'}`}>
        <p className={`font-semibold uppercase tracking-wider text-navy-500 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Next Appointment</p>
        <p className={`text-gray-500 ${compact ? 'mt-2 text-xs' : 'mt-3 text-sm'}`}>No upcoming appointments scheduled.</p>
      </div>
    );
  }

  const title = appointment.title || appointment.visitor_name || 'Upcoming visit';
  const subtitle = resolveAppointmentSubtitle(appointment);
  const countdown = formatCountdown(appointment.scheduled_at);

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${compact ? 'p-3' : 'p-4'}`}>
      <p className={`font-semibold uppercase tracking-wider text-navy-500 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Next Appointment</p>

      <div className={`flex items-center gap-2 text-navy-900 ${compact ? 'mt-2' : 'mt-3'}`}>
        <Clock size={compact ? 16 : 18} strokeWidth={2} className="shrink-0 text-navy-700" aria-hidden="true" />
        <span className={`font-bold tabular-nums tracking-tight ${compact ? 'text-xl' : 'text-2xl'}`}>
          {formatAppointmentTime(appointment.scheduled_at)}
        </span>
      </div>

      <div className="mt-1.5 min-w-0">
        <p className={`truncate font-medium text-navy-900 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
        {subtitle && (
          <p className={`truncate text-gray-500 ${compact ? 'text-[11px]' : 'text-xs'}`}>{subtitle}</p>
        )}
        {countdown && (
          <p className={`font-semibold text-emerald-600 ${compact ? 'mt-1 text-xs' : 'mt-1.5 text-sm'}`}>{countdown}</p>
        )}
      </div>

      <div className={`grid grid-cols-2 gap-2 ${compact ? 'mt-2.5' : 'mt-4'}`}>
        <button
          type="button"
          onClick={onViewDetails}
          className={`rounded-xl border border-navy-900 bg-white font-semibold text-navy-900 transition-colors hover:bg-navy-50 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}
        >
          View Details
        </button>
        <button
          type="button"
          onClick={onReschedule}
          className={`rounded-xl bg-navy-900 font-semibold text-white transition-colors hover:bg-navy-800 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}
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

function QuickActionRowContent({ label, icon: Icon, badge = 0, showBadge = false, compact = false }) {
  return (
    <>
      <span className={`flex shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}>
        <Icon size={compact ? 14 : 16} strokeWidth={2.25} aria-hidden="true" />
      </span>
      <span className={`min-w-0 flex-1 truncate font-medium text-navy-800 ${compact ? 'text-xs' : 'text-sm'}`}>{label}</span>
      {showBadge ? (
        <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-violet-600 font-bold text-white ${compact ? 'h-5 min-w-[1.25rem] px-1.5 text-[10px]' : 'h-6 min-w-[1.5rem] px-2 text-[11px]'}`}>
          {badge > 9 ? '9+' : badge}
        </span>
      ) : (
        <ChevronRight
          size={compact ? 14 : 16}
          className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-600"
          aria-hidden="true"
        />
      )}
    </>
  );
}

export function ExecutiveQuickActions({ kpis = {}, onNewAppointment, className = '', compact = false }) {
  const rowClass = `group flex w-full items-center text-left transition-colors hover:bg-navy-50/60 ${compact ? 'gap-2 px-3 py-2' : 'gap-3 px-4 py-3'}`;

  return (
    <div className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`.trim()}>
      <div className={`border-b border-gray-100 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <p className={`font-semibold uppercase tracking-wider text-navy-900 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Quick Actions</p>
      </div>
      <div className="divide-y divide-gray-100">
        {QUICK_ACTIONS.map(({ key, label, icon, to, action, badgeKey }) => {
          const badge = badgeKey ? Number(kpis[badgeKey] ?? 0) : 0;

          if (action === 'new') {
            return (
              <button
                key={key}
                type="button"
                onClick={onNewAppointment}
                className={rowClass}
              >
                <QuickActionRowContent label={label} icon={icon} compact={compact} />
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
                compact={compact}
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
    <div className={`border-t border-gray-200 bg-white px-3 py-2 sm:px-4 ${className}`}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
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
