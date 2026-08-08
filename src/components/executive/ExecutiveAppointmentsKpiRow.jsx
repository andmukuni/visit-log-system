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

export default function ExecutiveAppointmentsKpiRow({ kpis = {} }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {KPI_ITEMS.map(({ key, primaryLabel, secondaryLabel, icon: Icon, iconWrap }) => (
        <div
          key={key}
          className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-sm"
        >
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconWrap}`}>
            <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-3xl font-bold leading-none tabular-nums text-slate-900">
              {Number(kpis[key] ?? 0)}
            </p>
            <p className="mt-2.5 text-sm font-semibold text-gray-600">{primaryLabel}</p>
            <p className="mt-1 text-xs text-gray-400">{secondaryLabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
