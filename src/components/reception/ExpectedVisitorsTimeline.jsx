import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LogIn,
  Users,
} from 'lucide-react';
import {
  Button,
  FilterPills,
  IconButton,
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

function ArrivalCard({ row }) {
  const navigate = useNavigate();
  const visitId = visitIdOf(row);
  const classification = String(row.classification || 'standard').toLowerCase();
  const showType = classification === 'vip' || classification === 'vvip';
  const detailPath = `/reception/visitors/${visitId}`;
  const visitStatus = row.visit_status || row.status;
  const action = getReceptionVisitAction(visitStatus);
  const actionHref = receptionActionHref(action, visitId);

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
      className="flex cursor-pointer flex-col gap-3 rounded-xl border border-navy-100 bg-white p-3.5 transition-colors hover:border-navy-200 hover:bg-navy-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-navy-50 px-1.5 py-2 text-center">
          <span className="text-sm font-semibold tabular-nums text-navy-900">
            {row.scheduled_at ? formatTime(row.scheduled_at) : '—'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-navy-900">
              {row.visitor_name || 'Visitor'}
            </h3>
            {showType ? <VisitorTypeBadge classification={row.classification} size="xs" /> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-navy-500">
            Host: {row.host_name || '—'}
            {row.department_name ? ` · ${row.department_name}` : ''}
            {row.company ? ` · ${row.company}` : ''}
            {row.pass_code ? ` · Pass ${row.pass_code}` : ''}
          </p>
          <p className="mt-1 truncate text-xs text-navy-600" title={row.purpose || row.title || ''}>
            {row.purpose || row.title || '—'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={row.visit_status || row.status} />
            {row.expected_plates ? (
              <span className="inline-flex items-center rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600">
                {row.expected_plates}
              </span>
            ) : null}
          </div>
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
                      <ArrivalCard row={row} />
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
