import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LogIn,
  LogOut,
  Users,
} from 'lucide-react';
import {
  Button,
  FilterPills,
  IconButton,
  RestrictedIndicator,
  Spinner,
  StatusBadge,
  VisitorTypeBadge,
} from '../ui';
import { formatTime } from '../../utils/helpers';
import { addDays, startOfDay } from '../executive/calendarUtils';
import {
  getReceptionVisitAction,
  receptionActionButtonClass,
  receptionActionHref,
} from '../../../shared/visitReceptionActions.js';
import { isCheckoutEligible } from '../../../shared/visitCheckout.js';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'expected', label: 'Expected' },
  { value: 'arrived_at_gate', label: 'Arrived at gate' },
  { value: 'vip', label: 'VIP' },
];

const EXPECTED_STATUSES = new Set([
  'approved',
  'expected',
  'pre_registered',
  'pending_approval',
]);

/** Light row tint + border, aligned with StatusBadge hues. */
const STATUS_CARD_TONES = {
  expected: 'border-blue-100 bg-blue-50/80 hover:border-blue-200 hover:bg-blue-50',
  approved: 'border-emerald-100 bg-emerald-50/80 hover:border-emerald-200 hover:bg-emerald-50',
  pre_registered: 'border-blue-100 bg-blue-50/80 hover:border-blue-200 hover:bg-blue-50',
  pending_approval: 'border-amber-100 bg-amber-50/80 hover:border-amber-200 hover:bg-amber-50',
  arrived_at_gate: 'border-cyan-100 bg-cyan-50/80 hover:border-cyan-200 hover:bg-cyan-50',
  entered_premises: 'border-cyan-100 bg-cyan-50/80 hover:border-cyan-200 hover:bg-cyan-50',
  reception_check_in: 'border-teal-100 bg-teal-50/80 hover:border-teal-200 hover:bg-teal-50',
  checked_in: 'border-green-100 bg-green-50/80 hover:border-green-200 hover:bg-green-50',
  waiting: 'border-sky-100 bg-sky-50/80 hover:border-sky-200 hover:bg-sky-50',
  in_meeting: 'border-violet-100 bg-violet-50/70 hover:border-violet-200 hover:bg-violet-50',
  on_site: 'border-green-100 bg-green-50/80 hover:border-green-200 hover:bg-green-50',
  checked_out: 'border-slate-200 bg-slate-50/90 hover:border-slate-300 hover:bg-slate-100',
  left_premises: 'border-slate-200 bg-slate-50/90 hover:border-slate-300 hover:bg-slate-100',
  completed: 'border-slate-200 bg-slate-50/90 hover:border-slate-300 hover:bg-slate-100',
  departed: 'border-slate-200 bg-slate-50/90 hover:border-slate-300 hover:bg-slate-100',
  overdue: 'border-orange-100 bg-orange-50/80 hover:border-orange-200 hover:bg-orange-50',
  rejected: 'border-red-100 bg-red-50/80 hover:border-red-200 hover:bg-red-50',
  cancelled: 'border-red-100 bg-red-50/70 hover:border-red-200 hover:bg-red-50',
  denied: 'border-red-100 bg-red-50/80 hover:border-red-200 hover:bg-red-50',
  expired: 'border-rose-100 bg-rose-50/70 hover:border-rose-200 hover:bg-rose-50',
  default: 'border-navy-100 bg-white hover:border-navy-200 hover:bg-navy-50/40',
};

const STATUS_TIME_CHIP_TONES = {
  expected: 'bg-blue-100/70 text-blue-900',
  approved: 'bg-emerald-100/70 text-emerald-900',
  pre_registered: 'bg-blue-100/70 text-blue-900',
  pending_approval: 'bg-amber-100/70 text-amber-900',
  arrived_at_gate: 'bg-cyan-100/70 text-cyan-900',
  entered_premises: 'bg-cyan-100/70 text-cyan-900',
  reception_check_in: 'bg-teal-100/70 text-teal-900',
  checked_in: 'bg-green-100/70 text-green-900',
  waiting: 'bg-sky-100/70 text-sky-900',
  in_meeting: 'bg-violet-100/70 text-violet-900',
  on_site: 'bg-green-100/70 text-green-900',
  checked_out: 'bg-slate-200/80 text-slate-700',
  left_premises: 'bg-slate-200/80 text-slate-700',
  completed: 'bg-slate-200/80 text-slate-700',
  departed: 'bg-slate-200/80 text-slate-700',
  overdue: 'bg-orange-100/70 text-orange-900',
  rejected: 'bg-red-100/70 text-red-900',
  cancelled: 'bg-red-100/70 text-red-800',
  denied: 'bg-red-100/70 text-red-900',
  expired: 'bg-rose-100/70 text-rose-800',
  default: 'bg-navy-50 text-navy-900',
};

function statusCardTone(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_CARD_TONES[key] || STATUS_CARD_TONES.default;
}

function statusTimeChipTone(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_TIME_CHIP_TONES[key] || STATUS_TIME_CHIP_TONES.default;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatChipDay(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function visitIdOf(row) {
  return row.visit_id || row.id;
}

function matchesStatusFilter(row, filter) {
  const status = String(row.visit_status || row.status || '').toLowerCase();
  const classification = String(row.classification || 'standard').toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'vip') return classification === 'vip' || classification === 'vvip';
  if (filter === 'arrived_at_gate') {
    return status === 'arrived_at_gate' || status === 'entered_premises';
  }
  if (filter === 'expected') {
    return EXPECTED_STATUSES.has(status);
  }
  return true;
}

function groupByHour(rows) {
  const groups = new Map();
  for (const row of rows) {
    const when = row.scheduled_at ? new Date(row.scheduled_at) : null;
    const hour = when && !Number.isNaN(when.getTime()) ? when.getHours() : -1;
    const key = hour < 0 ? 'unscheduled' : String(hour).padStart(2, '0');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === 'unscheduled') return 1;
      if (b === 'unscheduled') return -1;
      return Number(a) - Number(b);
    })
    .map(([key, items]) => ({
      key,
      label: key === 'unscheduled' ? 'Unscheduled' : `${key}:00`,
      items: items.sort((left, right) => {
        const leftTime = left.scheduled_at ? new Date(left.scheduled_at).getTime() : 0;
        const rightTime = right.scheduled_at ? new Date(right.scheduled_at).getTime() : 0;
        return leftTime - rightTime;
      }),
    }));
}

function KpiTile({ label, value, accent = 'navy' }) {
  const accents = {
    navy: 'text-navy-900',
    cyan: 'text-cyan-700',
    amber: 'text-amber-700',
    violet: 'text-violet-700',
  };
  return (
    <div className="rounded-xl border border-navy-100 bg-white px-3 py-2.5 sm:px-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accents[accent] || accents.navy}`}>
        {value}
      </p>
    </div>
  );
}

function ArrivalCard({ row, onCheckOut, checkingOut }) {
  const navigate = useNavigate();
  const visitId = visitIdOf(row);
  const isRestricted = row._accessLevel === 'restricted';
  const classification = String(row.classification || 'standard').toLowerCase();
  const showType = !isRestricted && (classification === 'vip' || classification === 'vvip');
  const detailPath = `/reception/visitors/${visitId}`;
  const visitStatus = row.visit_status || row.status;
  const action = isRestricted ? { show: false } : getReceptionVisitAction(visitStatus);
  const actionHref = receptionActionHref(action, visitId);
  const cardTone = statusCardTone(visitStatus);
  const timeChipTone = statusTimeChipTone(visitStatus);
  const hasMeta = Boolean(row.host_name || row.department_name || row.company || row.pass_code);
  const hasPurpose = Boolean(row.purpose || row.title);
  const canCheckOut = !isRestricted && Boolean(onCheckOut) && isCheckoutEligible(visitStatus);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`View ${row.visitor_name || 'visitor'}`}
      onClick={() => navigate(detailPath)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(detailPath);
        }
      }}
      className={`flex cursor-pointer flex-col gap-3 rounded-xl border p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 ${cardTone}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-lg px-1.5 py-2 text-center ${timeChipTone}`}>
          <span className="text-sm font-semibold tabular-nums">
            {row.scheduled_at ? formatTime(row.scheduled_at) : '—'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-navy-900">
              {row.visitor_name || 'Visitor'}
            </h3>
            {showType ? <VisitorTypeBadge classification={row.classification} size="xs" /> : null}
            {isRestricted ? <RestrictedIndicator size="xs" /> : null}
          </div>
          {hasMeta ? (
            <p className="mt-0.5 truncate text-xs text-navy-500">
              {row.host_name ? `Host: ${row.host_name}` : null}
              {row.department_name ? ` · ${row.department_name}` : ''}
              {row.company ? ` · ${row.company}` : ''}
              {row.pass_code ? ` · Pass ${row.pass_code}` : ''}
            </p>
          ) : null}
          {hasPurpose ? (
            <p className="mt-1 truncate text-xs text-navy-600">
              {row.purpose || row.title}
            </p>
          ) : null}
          {!isRestricted ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={row.visit_status || row.status} />
              {row.expected_plates ? (
                <span className="inline-flex items-center rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600">
                  {row.expected_plates}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center justify-end gap-1.5 sm:pl-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Link to={detailPath} aria-label={`View ${row.visitor_name || 'visitor'}`}>
          <IconButton icon={Eye} label="View" tooltip="View" size="sm" variant="ghost" />
        </Link>
        {canCheckOut ? (
          <IconButton
            icon={LogOut}
            label="Check out"
            tooltip="Check out"
            size="sm"
            variant="ghost"
            loading={checkingOut}
            onClick={() => onCheckOut(row)}
          />
        ) : null}
        {action.show && actionHref ? (
          action.disabled ? (
            <Button
              size="sm"
              variant="primary"
              disabled
              className={receptionActionButtonClass(action.tone)}
            >
              <LogIn size={14} aria-hidden="true" />
              {action.label}
            </Button>
          ) : (
            <Link
              to={actionHref}
              aria-label={`${action.label} ${row.visitor_name || 'visitor'}`}
            >
              <Button
                size="sm"
                variant="primary"
                className={receptionActionButtonClass(action.tone)}
              >
                <LogIn size={14} aria-hidden="true" />
                {action.label}
              </Button>
            </Link>
          )
        ) : null}
      </div>
    </article>
  );
}

export default function ExpectedVisitorsTimeline({
  appointments = [],
  selectedDate,
  onDateChange,
  kpis = {},
  loading = false,
  statusFilter = 'all',
  onStatusFilterChange,
  onCheckOut,
  checkingOutId = null,
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const selected = useMemo(() => startOfDay(selectedDate || new Date()), [selectedDate]);
  const isToday = isSameDay(selected, today);

  const dayStrip = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(selected, index - 3)),
    [selected],
  );

  const filtered = useMemo(
    () => appointments.filter((row) => matchesStatusFilter(row, statusFilter)),
    [appointments, statusFilter],
  );

  const hourGroups = useMemo(() => groupByHour(filtered), [filtered]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-navy-100 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onDateChange?.(today)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                isToday
                  ? 'bg-cyan-600 text-white'
                  : 'border border-navy-200 bg-white text-navy-700 hover:bg-navy-50'
              }`}
            >
              Today
            </button>
            <div className="inline-flex items-center rounded-lg border border-navy-200 bg-navy-50/60">
              <button
                type="button"
                aria-label="Previous day"
                onClick={() => onDateChange?.(addDays(selected, -1))}
                className="rounded-l-lg p-1.5 text-navy-600 hover:bg-white"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next day"
                onClick={() => onDateChange?.(addDays(selected, 1))}
                className="rounded-r-lg p-1.5 text-navy-600 hover:bg-white"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm font-semibold text-navy-900">{formatDayLabel(selected)}</p>
          </div>

          <FilterPills
            size="sm"
            variant="outline"
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={onStatusFilterChange}
          />
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
          {dayStrip.map((day) => {
            const active = isSameDay(day, selected);
            const dayIsToday = isSameDay(day, today);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onDateChange?.(day)}
                className={`flex min-w-[3.25rem] flex-col items-center rounded-xl px-2 py-2 text-center transition-colors ${
                  active
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'border border-navy-100 bg-navy-50/70 text-navy-700 hover:bg-navy-100'
                }`}
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? 'text-cyan-100' : 'text-navy-400'}`}>
                  {formatChipDay(day)}
                </span>
                <span className="mt-0.5 text-sm font-bold tabular-nums">{day.getDate()}</span>
                {dayIsToday && !active ? (
                  <span className="mt-1 h-1 w-1 rounded-full bg-cyan-600" aria-hidden="true" />
                ) : (
                  <span className="mt-1 h-1 w-1" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiTile label="Expected today" value={kpis.expectedToday ?? 0} accent="cyan" />
        <KpiTile label="At reception" value={kpis.onSiteNow ?? 0} accent="navy" />
        <KpiTile label="Pending approvals" value={kpis.pendingApprovals ?? 0} accent="amber" />
        <KpiTile label="VIP today" value={kpis.vipToday ?? 0} accent="violet" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-navy-100 bg-white">
        {loading && appointments.length === 0 ? (
          <div className="flex justify-center py-20">
            <Spinner size={28} />
          </div>
        ) : hourGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-navy-100 bg-navy-50 text-navy-400">
              <Users size={22} aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-navy-700">No expected visitors for this day</p>
            <p className="max-w-sm text-xs text-navy-400">
              Scheduled and gate-bound visits will appear here by arrival time.
            </p>
            {statusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => onStatusFilterChange?.('all')}
                className="mt-1 text-sm font-medium text-cyan-700 hover:text-cyan-800"
              >
                Clear filter
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5 p-3 sm:p-4">
            {hourGroups.map((group) => (
              <section key={group.key} className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700">
                    <Clock3 size={12} aria-hidden="true" />
                    {group.label}
                  </span>
                  <span className="text-xs text-navy-400">
                    {group.items.length} visitor{group.items.length === 1 ? '' : 's'}
                  </span>
                  <div className="h-px flex-1 bg-navy-100" />
                </div>
                <ul className="space-y-2">
                  {group.items.map((row) => (
                    <li key={visitIdOf(row)}>
                      <ArrivalCard
                        row={row}
                        onCheckOut={onCheckOut}
                        checkingOut={checkingOutId === visitIdOf(row)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {loading && appointments.length > 0 ? (
        <p className="shrink-0 text-center text-xs text-navy-400">Refreshing…</p>
      ) : null}
    </div>
  );
}
