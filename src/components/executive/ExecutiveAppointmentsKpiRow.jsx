import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  UserCheck,
} from 'lucide-react';

const KPI_ITEMS = [
  {
    key: 'todayAppointments',
    primaryLabel: 'Today',
    secondaryLabel: 'Appointments',
    icon: CalendarCheck,
    iconWrap: 'bg-sky-50 text-sky-500',
  },
  {
    key: 'weekAppointments',
    primaryLabel: 'This Week',
    secondaryLabel: 'Appointments',
    icon: CalendarDays,
    iconWrap: 'bg-violet-50 text-violet-500',
  },
  {
    key: 'pendingApprovals',
    primaryLabel: 'Awaiting Approval',
    secondaryLabel: 'Appointments',
    icon: Clock3,
    iconWrap: 'bg-orange-50 text-orange-500',
  },
  {
    key: 'onSiteNow',
    primaryLabel: 'Visitors On-Site',
    secondaryLabel: 'Right Now',
    icon: UserCheck,
    iconWrap: 'bg-emerald-50 text-emerald-500',
  },
  {
    key: 'completedThisMonth',
    primaryLabel: 'Completed',
    secondaryLabel: 'This Month',
    icon: CheckCircle2,
    iconWrap: 'bg-sky-50 text-sky-500',
  },
];

export default function ExecutiveAppointmentsKpiRow({ kpis = {}, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5 ${className}`.trim()}>
      {KPI_ITEMS.map(({ key, primaryLabel, secondaryLabel, icon: Icon, iconWrap }) => (
        <div
          key={key}
          className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-none tabular-nums text-slate-900 sm:text-2xl">
              {Number(kpis[key] ?? 0)}
            </p>
            <p className="mt-1 text-xs font-semibold leading-tight text-gray-600 sm:text-sm">{primaryLabel}</p>
            <p className="mt-0.5 hidden text-xs leading-tight text-gray-400 sm:block">{secondaryLabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
