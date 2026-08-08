import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Clock3, Filter, User, UserCheck, Users } from 'lucide-react';
import { Spinner, IconButton } from '../ui';
import ExecutiveQuickAddPopover from './ExecutiveQuickAddPopover';
import ExecutiveAppointmentDetailPanel from './ExecutiveAppointmentDetailPanel';
import ExecutiveCalendarEventCard from './ExecutiveCalendarEventCard';
import { executiveApi } from '../../utils/visitorApi';
import { useToast } from '../../context/ToastContext';
import {
  addMinutes,
  CALENDAR_VIEW_OPTIONS,
  compareViewDensity,
  getPeriodDays,
  getViewConfig,
  gridBodyHeightPx,
  gridScrollHeightPx,
  formatPeriodRange,
  FUTURE_SCHEDULE_ERROR,
  navigatePeriod,
  normalizePeriodStart,
  isInPeriod,
  isSameDay,
  isPastDay,
  isScheduleInPast,
  isSameMonth,
  periodQueryRange,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  currentTimePositionPx,
  DEFAULT_EVENT_MINUTES,
  eventLayout,
  formatGutterLiveTime,
  formatDayHeader,
  formatHourLabel,
  formatTimeRange,
  getMonthGrid,
  GRID_VIEWPORT_HEIGHT_PX,
  HOUR_LABELS,
  HOUR_HEIGHT_PX,
  initialGridScrollTop,
  slotFromPointer,
  startOfWeek,
  startOfDay,
  weekQueryRange,
  computeSlotRect,
} from './calendarUtils';

const HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, i) => CALENDAR_START_HOUR + i,
);

function hourLabelTop(hour, hourHeight = HOUR_HEIGHT_PX) {
  return (hour - CALENDAR_START_HOUR) * hourHeight;
}

function GutterHourMark({ hour, hourHeight }) {
  const lineTop = hourLabelTop(hour, hourHeight);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-start justify-end pr-2 text-[11px] font-medium tabular-nums text-gray-400"
      style={{ top: `${lineTop}px`, transform: 'translateY(-50%)' }}
    >
      {formatHourLabel(hour)}
    </div>
  );
}

const TOOLBAR_VIEW_MODES = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

function ViewModeTabs({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="tablist" aria-label="Calendar view">
      {TOOLBAR_VIEW_MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={option.id === value}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            option.id === value
              ? 'bg-white text-[#1a73e8] shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}


function MiniMonth({ anchorDate, periodStart, viewMode, focusedDay, onPickDate, onMonthChange }) {
  const days = useMemo(() => getMonthGrid(anchorDate), [anchorDate]);
  const monthLabel = anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800">{monthLabel}</p>
        <div className="flex items-center gap-0.5">
          <IconButton
            icon={ChevronLeft}
            label="Previous month"
            tooltip="Previous month"
            variant="ghost"
            size="sm"
            onClick={() => onMonthChange(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1))}
          />
          <IconButton
            icon={ChevronRight}
            label="Next month"
            tooltip="Next month"
            variant="ghost"
            size="sm"
            onClick={() => onMonthChange(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1))}
          />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-1">
        {weekdayLabels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day) => {
          const inMonth = isSameMonth(day, anchorDate);
          const selected = isSameDay(day, focusedDay);
          const inPeriod = isInPeriod(day, periodStart, viewMode);
          const today = isSameDay(day, new Date());
          const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onPickDate(day)}
              className={`mx-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs transition-colors ${
                selected
                  ? 'bg-navy-900 text-white hover:bg-navy-900 shadow-sm'
                  : inPeriod
                    ? 'bg-navy-50 text-navy-700 hover:bg-navy-100'
                    : !inMonth
                      ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-700 hover:bg-gray-100'
              } ${today && !selected ? 'ring-1 ring-navy-500' : ''}`}
              aria-label={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              aria-pressed={selected}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const GLANCE_ACCENTS = {
  sky: {
    iconWrap: 'bg-sky-100 text-sky-700',
    value: 'text-sky-950',
  },
  violet: {
    iconWrap: 'bg-violet-100 text-violet-700',
    value: 'text-violet-950',
  },
  emerald: {
    iconWrap: 'bg-emerald-100 text-emerald-700',
    value: 'text-emerald-950',
  },
  amber: {
    iconWrap: 'bg-amber-100 text-amber-700',
    value: 'text-amber-950',
  },
};

const GLANCE_ITEMS = [
  { key: 'todayAppointments', label: 'Today', icon: CalendarCheck, accent: 'sky' },
  { key: 'weekAppointments', label: 'This week', icon: CalendarDays, accent: 'violet' },
  { key: 'onSiteNow', label: 'On-site', icon: UserCheck, accent: 'emerald' },
  { key: 'pendingApprovals', label: 'Pending', icon: Clock3, accent: 'amber' },
];

const LEGEND_ITEMS = [
  { label: 'Standard', swatch: 'bg-navy-100 border-navy-300' },
  { label: 'VIP', swatch: 'bg-violet-100 border-violet-300' },
  { label: 'VVIP', swatch: 'bg-amber-100 border-amber-300' },
  { label: 'Pending', swatch: 'bg-orange-50 border-orange-300' },
];

const SIDEBAR_LINKS = [
  {
    to: '/executive/visitors',
    label: 'My visitors',
    description: 'View visitor records',
    icon: Users,
    accent: 'bg-sky-100 text-sky-700',
  },
  {
    to: '/executive/notifications',
    label: 'Notifications',
    description: 'Alerts and updates',
    icon: Bell,
    accent: 'bg-violet-100 text-violet-700',
  },
];

function ExecutiveSidebarLinks() {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-2 shadow-sm">
      <div className="space-y-1">
        {SIDEBAR_LINKS.map(({ to, label, description, icon: Icon, accent }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-navy-50"
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>
              <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-navy-900">{label}</span>
              <span className="block truncate text-[11px] text-navy-400">{description}</span>
            </span>
            <ChevronRight
              size={14}
              className="shrink-0 text-navy-300 transition-transform group-hover:translate-x-0.5 group-hover:text-navy-500"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

function ExecutiveLegendPanel() {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-3 shadow-sm">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-navy-500">Event types</p>
      <div className="grid grid-cols-2 gap-1.5">
        {LEGEND_ITEMS.map(({ label, swatch }) => (
          <div key={label} className="flex min-w-0 items-center gap-2 rounded-lg bg-navy-50/40 px-2 py-1.5">
            <span className={`h-3 w-5 shrink-0 rounded border ${swatch}`} aria-hidden="true" />
            <span className="truncate text-[11px] font-medium text-navy-700">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutiveGlancePanel({ kpis = {} }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm">
      <div className="border-b border-navy-100 bg-gradient-to-r from-navy-50/90 to-white px-3.5 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">At a glance</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-navy-100/80">
        {GLANCE_ITEMS.map(({ key, label, icon: Icon, accent }) => {
          const value = Number(kpis[key] ?? 0);
          const theme = GLANCE_ACCENTS[accent];
          const highlight = key === 'pendingApprovals' && value > 0;

          return (
            <div key={key} className="group p-3 transition-colors hover:bg-navy-50/40">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium leading-tight text-navy-500">{label}</p>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${theme.iconWrap}`}>
                  <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
                </span>
              </div>
              <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${theme.value}`}>
                {value}
              </p>
              {highlight && (
                <p className="mt-1 text-[10px] font-medium text-amber-700">Needs review</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function executiveInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ExecutiveWeekCalendar({
  executive,
  kpis = {},
  appointments = [],
  loading = false,
  weekStart,
  viewMode = 'week',
  onViewModeChange,
  onWeekChange,
  onRefresh,
}) {
  const toast = useToast();
  const toolbarRef = useRef(null);
  const dayHeadersRef = useRef(null);
  const gridScrollRef = useRef(null);
  const [gridViewportHeight] = useState(GRID_VIEWPORT_HEIGHT_PX);
  const [sidebarMonth, setSidebarMonth] = useState(weekStart);
  const [focusedDay, setFocusedDay] = useState(() => startOfDay(new Date()));
  const [weekSlideDirection, setWeekSlideDirection] = useState(null);
  const [viewAnimClass, setViewAnimClass] = useState(null);
  const prevViewModeRef = useRef(viewMode);
  const [draft, setDraft] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [referenceData, setReferenceData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const viewConfig = useMemo(() => getViewConfig(viewMode), [viewMode]);
  const periodDays = useMemo(() => getPeriodDays(weekStart, viewMode), [weekStart, viewMode]);
  const gridBodyHeight = useMemo(() => gridBodyHeightPx(viewConfig.hourHeight), [viewConfig.hourHeight]);
  const gridScrollHeight = useMemo(() => gridScrollHeightPx(viewConfig.hourHeight), [viewConfig.hourHeight]);
  const gridTemplateColumns = useMemo(
    () => `52px repeat(${periodDays.length}, minmax(${viewConfig.minDayWidth}px, 1fr))`,
    [periodDays.length, viewConfig.minDayWidth],
  );
  const compactHeaders = periodDays.length > 14;
  const nowLinePx = currentTimePositionPx(now, gridBodyHeight);
  const gutterLiveTime = useMemo(() => formatGutterLiveTime(now), [now]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (prevViewModeRef.current === viewMode) return undefined;

    const density = compareViewDensity(prevViewModeRef.current, viewMode, weekStart);
    setViewAnimClass(density === 'neutral' ? null : `animate-gcal-view-${density}`);
    prevViewModeRef.current = viewMode;

    const timer = window.setTimeout(() => setViewAnimClass(null), 360);
    return () => window.clearTimeout(timer);
  }, [viewMode, weekStart]);

  useEffect(() => {
    if (!isInPeriod(focusedDay, weekStart, viewMode)) {
      setFocusedDay(startOfDay(weekStart));
    }
  }, [weekStart, focusedDay, viewMode]);

  const changePeriod = useCallback((nextPeriodStart, direction = null) => {
    setWeekSlideDirection(direction);
    setSidebarMonth(new Date(nextPeriodStart.getFullYear(), nextPeriodStart.getMonth(), 1));
    onWeekChange(normalizePeriodStart(nextPeriodStart, viewMode));
  }, [onWeekChange, viewMode]);

  const handleViewModeChange = useCallback((nextMode) => {
    onViewModeChange?.(nextMode);
  }, [onViewModeChange]);

  const handlePickDate = useCallback((day) => {
    const picked = startOfDay(day);
    const nextPeriodStart = normalizePeriodStart(picked, viewMode);
    let direction = null;

    if (nextPeriodStart.getTime() > weekStart.getTime()) {
      direction = 'forward';
    } else if (nextPeriodStart.getTime() < weekStart.getTime()) {
      direction = 'backward';
    }

    setFocusedDay(picked);
    setSidebarMonth(new Date(picked.getFullYear(), picked.getMonth(), 1));
    changePeriod(nextPeriodStart, direction);
  }, [weekStart, viewMode, changePeriod]);

  useEffect(() => {
    if (loading) return undefined;

    const el = gridScrollRef.current;
    if (!el) return undefined;

    const nowDate = new Date();
    const hasToday = periodDays.some((day) => isSameDay(day, nowDate));
    const focusHour = hasToday
      ? Math.max(CALENDAR_START_HOUR, nowDate.getHours())
      : 8;

    el.scrollTop = initialGridScrollTop(focusHour, gridViewportHeight);
    return undefined;
  }, [weekStart, loading, periodDays, gridViewportHeight, viewMode]);

  useEffect(() => {
    if (periodDays.length <= 7) return undefined;

    const grid = gridScrollRef.current;
    const headers = dayHeadersRef.current;
    if (!grid || !headers) return undefined;

    let syncing = false;
    const syncScroll = (source, target) => {
      if (syncing) return;
      syncing = true;
      target.scrollLeft = source.scrollLeft;
      syncing = false;
    };

    const onGridScroll = () => syncScroll(grid, headers);
    const onHeaderScroll = () => syncScroll(headers, grid);

    grid.addEventListener('scroll', onGridScroll, { passive: true });
    headers.addEventListener('scroll', onHeaderScroll, { passive: true });

    return () => {
      grid.removeEventListener('scroll', onGridScroll);
      headers.removeEventListener('scroll', onHeaderScroll);
    };
  }, [periodDays.length, viewMode, weekStart]);

  useEffect(() => {
    let cancelled = false;
    executiveApi.getReferenceData()
      .then((data) => {
        if (!cancelled) setReferenceData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshDraftSlotRect = useCallback((currentDraft) => {
    if (!currentDraft?.dayKey) return currentDraft;
    const column = document.querySelector(`[data-calendar-day="${currentDraft.dayKey}"]`);
    if (!column) return currentDraft;
    const slotRect = computeSlotRect(column, currentDraft.startAt, currentDraft.endAt, gridBodyHeight);
    if (!slotRect) return currentDraft;
    return { ...currentDraft, slotRect };
  }, [gridBodyHeight]);

  const handleSlotClick = useCallback((event, day) => {
    if (event.target.closest('[data-calendar-event]')) return;
    const column = event.currentTarget;
    const rect = column.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const startAt = slotFromPointer(day, offsetY, rect.height);
    if (isPastDay(day) || isScheduleInPast(startAt)) {
      toast.error(FUTURE_SCHEDULE_ERROR);
      return;
    }
    const endAt = addMinutes(startAt, DEFAULT_EVENT_MINUTES);
    const dayKey = day.toISOString();
    const slotRect = computeSlotRect(column, startAt, endAt, gridBodyHeight);
    setDraft({
      day,
      dayKey,
      startAt,
      endAt,
      title: '',
      slotRect,
      sessionId: `${dayKey}-${startAt.getTime()}-${Date.now()}`,
    });
  }, [gridBodyHeight, toast]);

  useEffect(() => {
    if (!draft) return undefined;

    const syncRect = () => {
      setDraft((current) => {
        if (!current) return current;
        const next = refreshDraftSlotRect(current);
        if (
          next?.slotRect?.top === current.slotRect?.top
          && next?.slotRect?.left === current.slotRect?.left
        ) {
          return current;
        }
        return next;
      });
    };

    syncRect();
    const scrollEl = gridScrollRef.current;
    scrollEl?.addEventListener('scroll', syncRect, { passive: true });
    window.addEventListener('resize', syncRect);
    window.addEventListener('scroll', syncRect, { passive: true });

    return () => {
      scrollEl?.removeEventListener('scroll', syncRect);
      window.removeEventListener('resize', syncRect);
      window.removeEventListener('scroll', syncRect);
    };
  }, [draft?.dayKey, draft?.startAt, draft?.endAt, refreshDraftSlotRect]);

  const handleSaveDraft = async (payload) => {
    if (!payload.visitorName) {
      toast.error('Visitor name is required.');
      return;
    }
    if (payload.scheduledAt && isScheduleInPast(payload.scheduledAt)) {
      toast.error(FUTURE_SCHEDULE_ERROR);
      return;
    }
    setSaving(true);
    try {
      await executiveApi.createAppointment(payload);
      toast.success('Appointment added to your schedule.');
      setDraft(null);
      onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Could not save appointment.');
    } finally {
      setSaving(false);
    }
  };

  const draftPreview = draft
    ? eventLayout(draft.startAt, Math.max(
      DEFAULT_EVENT_MINUTES,
      Math.round((draft.endAt - draft.startAt) / 60000),
    ))
    : null;

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const day of periodDays) {
      map.set(
        day.toDateString(),
        appointments.filter((appt) => {
          const d = new Date(appt.scheduled_at);
          return !Number.isNaN(d.getTime()) && isSameDay(d, day);
        }),
      );
    }
    return map;
  }, [appointments, periodDays]);

  const goToday = () => {
    const todayDate = startOfDay(new Date());
    const start = normalizePeriodStart(todayDate, viewMode);
    let direction = null;
    if (start.getTime() > weekStart.getTime()) direction = 'forward';
    else if (start.getTime() < weekStart.getTime()) direction = 'backward';
    setFocusedDay(todayDate);
    setSidebarMonth(todayDate);
    changePeriod(start, direction);
  };

  const navLabel = viewConfig.label.toLowerCase();

  const scrollToNow = useCallback(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const focusHour = Math.max(CALENDAR_START_HOUR, now.getHours());
    el.scrollTo({ top: initialGridScrollTop(focusHour, gridViewportHeight), behavior: 'smooth' });
  }, [now, gridViewportHeight]);

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:flex-row lg:items-start">
      {/* Left sidebar — executive profile, mini-month, KPIs, legend, quick links */}
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white shadow-sm ring-2 ring-navy-100">
            {executiveInitials(executive?.name) || <User size={18} strokeWidth={2} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">{executive?.title || 'Executive'}</p>
            <p className="truncate font-semibold text-gray-900">{executive?.name || 'Calendar'}</p>
          </div>
        </div>

        <MiniMonth
          anchorDate={sidebarMonth}
          periodStart={weekStart}
          viewMode={viewMode}
          focusedDay={focusedDay}
          onPickDate={handlePickDate}
          onMonthChange={setSidebarMonth}
        />

        <ExecutiveGlancePanel kpis={kpis} />

        <div className="space-y-2">
          <ExecutiveLegendPanel />
          <ExecutiveSidebarLinks />
        </div>
      </aside>

      {/* Main calendar */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm max-h-[calc(100vh-11rem)]">
        {/* Toolbar */}
        <div
          ref={toolbarRef}
          className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-5"
        >
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Today
          </button>
          <div className="flex items-center">
            <IconButton
              icon={ChevronLeft}
              label={`Previous ${navLabel}`}
              tooltip={`Previous ${navLabel}`}
              variant="ghost"
              size="sm"
              onClick={() => changePeriod(navigatePeriod(weekStart, viewMode, -1), 'backward')}
            />
            <IconButton
              icon={ChevronRight}
              label={`Next ${navLabel}`}
              tooltip={`Next ${navLabel}`}
              variant="ghost"
              size="sm"
              onClick={() => changePeriod(navigatePeriod(weekStart, viewMode, 1), 'forward')}
            />
          </div>
          <div className="flex min-w-0 items-center gap-2 text-gray-800">
            <CalendarDays size={18} className="shrink-0 text-gray-500" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              {formatPeriodRange(weekStart, viewMode)}
            </h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ViewModeTabs value={viewMode} onChange={handleViewModeChange} />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              aria-label="Filter calendar"
            >
              <Filter size={14} aria-hidden="true" />
              Filter
              <ChevronDown size={14} className="text-gray-400" aria-hidden="true" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size={32} />
          </div>
        ) : (
          <div
            key={`${viewMode}-${weekStart.toISOString()}`}
            className={`gcal-period-shell flex shrink-0 flex-col ${
              viewAnimClass
                || (weekSlideDirection === 'forward'
                  ? 'animate-gcal-week-forward'
                  : weekSlideDirection === 'backward'
                    ? 'animate-gcal-week-backward'
                    : '')
            }`}
          >
            {/* Day headers — fixed above scroll so they never cover hour rows */}
            <div
              ref={dayHeadersRef}
              className={`shrink-0 grid border-b border-gray-200 bg-white ${periodDays.length > 7 ? 'overflow-x-auto' : ''}`}
              style={{
                gridTemplateColumns,
                minWidth: periodDays.length > 7 ? `${52 + periodDays.length * viewConfig.minDayWidth}px` : undefined,
              }}
            >
              <div className="border-r border-gray-200 bg-white" aria-hidden="true" />
              {periodDays.map((day) => {
                const { weekday, day: dayNum, isToday } = formatDayHeader(day, now);
                return (
                  <div key={day.toISOString()} className="border-l border-gray-200 py-2.5 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {weekday}
                    </p>
                    <p className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday ? 'bg-navy-900 text-white' : 'text-gray-800'
                    }`}
                    >
                      {dayNum}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Time grid — viewport height matches sidebar baseline on desktop */}
            <div
              ref={gridScrollRef}
              className={`shrink-0 overflow-y-auto ${periodDays.length > 7 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}
              style={{ height: `${gridViewportHeight}px` }}
            >
              <div
                className={`gcal-period-grid relative grid ${viewAnimClass || ''}`}
                style={{
                  gridTemplateColumns,
                  height: `${gridScrollHeight}px`,
                  minWidth: `${52 + periodDays.length * viewConfig.minDayWidth}px`,
                }}
              >
                {nowLinePx != null && periodDays.some((day) => isSameDay(day, now)) && (
                  <div
                    className="pointer-events-none absolute right-0 z-[15] h-0.5 bg-red-500"
                    style={{ left: '52px', top: `${nowLinePx}px` }}
                    aria-hidden="true"
                  />
                )}

                {/* Hour labels + current time pill */}
                <div className="relative z-10 border-r border-gray-200 bg-white">
                  {HOUR_LABELS.map((hour) => (
                    <GutterHourMark
                      key={hour}
                      hour={hour}
                      hourHeight={viewConfig.hourHeight}
                    />
                  ))}
                  {nowLinePx != null && (
                    <div
                      className="pointer-events-none absolute right-0 z-30 flex justify-end pr-1"
                      style={{ top: `${nowLinePx}px`, transform: 'translateY(-50%)' }}
                    >
                      <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-sm">
                        {gutterLiveTime}
                      </span>
                    </div>
                  )}
                </div>

                {/* Day columns */}
                {periodDays.map((day) => {
                  const dayEvents = eventsByDay.get(day.toDateString()) || [];
                  const isToday = isSameDay(day, now);
                  const pastDay = isPastDay(day, now);

                  return (
                    <div
                      key={day.toISOString()}
                      data-calendar-day={day.toISOString()}
                      className={`relative border-l border-gray-200 ${pastDay ? 'bg-gray-50/80' : ''}`}
                    >
                      <div
                        className={`absolute inset-x-0 top-0 ${pastDay ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        style={{ height: `${gridBodyHeight}px` }}
                        onClick={pastDay ? undefined : (event) => handleSlotClick(event, day)}
                      >
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 border-t border-dashed border-gray-200/90"
                          style={{ top: `${((hour - CALENDAR_START_HOUR) / (CALENDAR_END_HOUR - CALENDAR_START_HOUR)) * 100}%` }}
                        />
                      ))}

                      {/* Selected slot preview — stays visible while popover slides left */}
                      {draft && isSameDay(day, draft.day) && draftPreview && (
                        <div
                          data-calendar-event
                          className="absolute inset-x-1.5 z-[25] overflow-hidden rounded-lg border border-[#1a73e8]/40 bg-[#039be5] px-2 py-1.5 text-left shadow-sm pointer-events-none animate-gcal-slot"
                          style={{ top: draftPreview.top, height: draftPreview.height, minHeight: '28px' }}
                        >
                          <p className="truncate text-[10px] font-medium text-white/90">
                            {formatTimeRange(draft.startAt, draft.endAt)}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-white">
                            {draft.title?.trim() || '(No title)'}
                          </p>
                        </div>
                      )}

                      {/* Events */}
                      {dayEvents.map((appt) => {
                        const layout = eventLayout(appt.scheduled_at, DEFAULT_EVENT_MINUTES);
                        if (!layout) return null;

                        return (
                          <ExecutiveCalendarEventCard
                            key={appt.id || appt.appointment_id}
                            appointment={appt}
                            layout={layout}
                            compactHeaders={compactHeaders}
                            onSelect={setSelectedAppointment}
                          />
                        );
                      })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <ExecutiveAppointmentDetailPanel
        appointment={selectedAppointment}
        open={Boolean(selectedAppointment)}
        onClose={() => setSelectedAppointment(null)}
      />

      <ExecutiveQuickAddPopover
        draft={draft}
        executive={executive}
        referenceData={referenceData}
        appointments={appointments}
        saving={saving}
        onClose={() => setDraft(null)}
        onDraftChange={(nextDraft) => {
          if (nextDraft?.startAt && isScheduleInPast(nextDraft.startAt)) {
            toast.error(FUTURE_SCHEDULE_ERROR);
            return;
          }
          setDraft((current) => {
            const merged = { ...current, ...nextDraft };
            return refreshDraftSlotRect(merged);
          });
        }}
        onSave={handleSaveDraft}
      />
    </div>
  );
}

export { startOfWeek, weekQueryRange, periodQueryRange, normalizePeriodStart };
