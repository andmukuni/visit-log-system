import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Clock, CalendarDays, Filter } from 'lucide-react';
import { Spinner, IconButton } from '../ui';
import ExecutiveQuickAddPopover from './ExecutiveQuickAddPopover';
import ExecutiveAppointmentDetailPanel from './ExecutiveAppointmentDetailPanel';
import ExecutiveCalendarEventCard from './ExecutiveCalendarEventCard';
import {
  ExecutiveCalendarLegend,
  ExecutiveGlancePanel,
  ExecutiveNextAppointmentCard,
  ExecutiveQuickActions,
  mapNextAppointmentToCalendarRow,
} from './ExecutiveDashboardWidgets';
import { executiveApi } from '../../utils/visitorApi';
import { useToast } from '../../context/ToastContext';
import {
  addDays,
  addMinutes,
  CALENDAR_VIEW_OPTIONS,
  compareViewDensity,
  getPeriodDays,
  getViewConfig,
  fitHourHeight,
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
  GRID_PADDING_BOTTOM_PX,
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
const MIN_SIDEBAR_SCALE = 0.72;

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


function MiniMonth({ anchorDate, periodStart, viewMode, focusedDay, onPickDate, onMonthChange, compact = false }) {
  const days = useMemo(() => getMonthGrid(anchorDate), [anchorDate]);
  const monthLabel = anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`flex items-center justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
        <p className={`font-semibold text-gray-800 ${compact ? 'text-xs' : 'text-sm'}`}>{monthLabel}</p>
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
              className={`mx-auto flex cursor-pointer items-center justify-center rounded-full transition-colors ${
                compact ? 'h-7 w-7 text-[11px]' : 'h-8 w-8 text-xs'
              } ${
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

export default function ExecutiveWeekCalendar({
  className = '',
  executive,
  kpis = {},
  appointments = [],
  nextAppointment = null,
  loading = false,
  weekStart,
  viewMode = 'week',
  onViewModeChange,
  onWeekChange,
  onRefresh,
  newAppointmentTrigger = 0,
}) {
  const toast = useToast();
  const toolbarRef = useRef(null);
  const dayHeadersRef = useRef(null);
  const gridScrollRef = useRef(null);
  const sidebarRef = useRef(null);
  const sidebarContentRef = useRef(null);
  const [gridViewportHeight, setGridViewportHeight] = useState(GRID_VIEWPORT_HEIGHT_PX);
  const [sidebarFit, setSidebarFit] = useState({ scale: 1, naturalHeight: 0, scrollable: false });
  const [sidebarCompact, setSidebarCompact] = useState(false);
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
  const hourSpan = CALENDAR_END_HOUR - CALENDAR_START_HOUR;
  const layoutHourHeight = useMemo(
    () => fitHourHeight(gridViewportHeight, hourSpan, viewConfig.hourHeight),
    [gridViewportHeight, viewConfig.hourHeight, hourSpan],
  );
  const gridBodyHeight = useMemo(() => gridBodyHeightPx(layoutHourHeight), [layoutHourHeight]);
  const gridScrollHeight = useMemo(() => gridScrollHeightPx(layoutHourHeight), [layoutHourHeight]);
  const gridFitsViewport = useMemo(
    () => gridScrollHeight <= gridViewportHeight + 1,
    [gridScrollHeight, gridViewportHeight],
  );
  const gridTemplateColumns = useMemo(
    () => `52px repeat(${periodDays.length}, minmax(${viewConfig.minDayWidth}px, 1fr))`,
    [periodDays.length, viewConfig.minDayWidth],
  );
  const compactHeaders = periodDays.length > 14;
  const nowLinePx = currentTimePositionPx(now, gridBodyHeight);
  const gutterLiveTime = useMemo(() => formatGutterLiveTime(now), [now]);

  useEffect(() => {
    const aside = sidebarRef.current;
    const content = sidebarContentRef.current;
    if (!aside || !content) return undefined;

    const fitSidebar = () => {
      const available = aside.clientHeight;
      const natural = content.scrollHeight;
      if (available <= 0 || natural <= 0) return;

      const rawScale = available / natural;
      const scale = rawScale < 1
        ? Math.max(MIN_SIDEBAR_SCALE, rawScale)
        : 1;
      const scrollable = rawScale < MIN_SIDEBAR_SCALE;
      const compact = rawScale < 0.98;

      setSidebarCompact((current) => (current === compact ? current : compact));
      setSidebarFit((current) => (
        current.scale === scale
          && current.naturalHeight === natural
          && current.scrollable === scrollable
          ? current
          : { scale, naturalHeight: natural, scrollable }
      ));
    };

    fitSidebar();
    const observer = new ResizeObserver(fitSidebar);
    observer.observe(aside);
    observer.observe(content);
    window.addEventListener('resize', fitSidebar);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fitSidebar);
    };
  }, [loading, kpis, nextAppointment, sidebarMonth, viewMode, weekStart]);

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

    if (gridFitsViewport) {
      el.scrollTop = 0;
      return undefined;
    }

    const nowDate = new Date();
    const hasToday = periodDays.some((day) => isSameDay(day, nowDate));
    const focusHour = hasToday
      ? Math.max(CALENDAR_START_HOUR, nowDate.getHours())
      : 8;

    el.scrollTop = initialGridScrollTop(focusHour, gridViewportHeight, layoutHourHeight);
    return undefined;
  }, [weekStart, loading, periodDays, gridViewportHeight, viewMode, gridFitsViewport, layoutHourHeight]);

  useEffect(() => {
    const scrollEl = gridScrollRef.current;
    if (!scrollEl) return undefined;

    const syncViewportHeight = () => {
      const nextHeight = scrollEl.clientHeight;
      if (nextHeight > 0) {
        setGridViewportHeight((current) => (current === nextHeight ? current : nextHeight));
      }
    };

    syncViewportHeight();
    const observer = new ResizeObserver(syncViewportHeight);
    observer.observe(scrollEl);

    return () => observer.disconnect();
  }, [loading, viewMode, weekStart, periodDays.length, layoutHourHeight]);

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

  const openNewAppointment = useCallback(() => {
    const nowDate = new Date();
    let startAt = new Date(nowDate);
    startAt.setMinutes(0, 0, 0);
    startAt.setHours(startAt.getHours() + 1);

    if (startAt.getHours() < CALENDAR_START_HOUR) {
      startAt.setHours(CALENDAR_START_HOUR, 0, 0, 0);
    }
    if (startAt.getHours() >= CALENDAR_END_HOUR) {
      startAt = addDays(startOfDay(nowDate), 1);
      startAt.setHours(CALENDAR_START_HOUR, 0, 0, 0);
    }

    const endAt = addMinutes(startAt, DEFAULT_EVENT_MINUTES);
    const day = startOfDay(startAt);
    setDraft({
      day,
      dayKey: day.toISOString(),
      startAt,
      endAt,
      title: '',
      slotRect: null,
      sessionId: `header-${Date.now()}`,
      openFullEditor: true,
    });
  }, []);

  useEffect(() => {
    if (!newAppointmentTrigger) return;
    openNewAppointment();
  }, [newAppointmentTrigger, openNewAppointment]);

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
    el.scrollTo({
      top: initialGridScrollTop(focusHour, gridViewportHeight, layoutHourHeight),
      behavior: 'smooth',
    });
  }, [now, gridViewportHeight, layoutHourHeight]);

  const mappedNextAppointment = useMemo(
    () => mapNextAppointmentToCalendarRow(nextAppointment),
    [nextAppointment],
  );

  const handleViewNextAppointment = useCallback(() => {
    if (!mappedNextAppointment) return;
    setSelectedAppointment(mappedNextAppointment);
  }, [mappedNextAppointment]);

  const handleRescheduleNextAppointment = useCallback(() => {
    if (!nextAppointment?.scheduled_at) return;
    const startAt = new Date(nextAppointment.scheduled_at);
    if (Number.isNaN(startAt.getTime())) return;
    const endAt = addMinutes(startAt, DEFAULT_EVENT_MINUTES);
    const day = startOfDay(startAt);
    setDraft({
      day,
      dayKey: day.toISOString(),
      startAt,
      endAt,
      title: nextAppointment.title || nextAppointment.visitor_name || '',
      slotRect: null,
      sessionId: `reschedule-${Date.now()}`,
      openFullEditor: true,
    });
  }, [nextAppointment]);

  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:items-stretch lg:gap-4 ${className}`.trim()}>
      <aside
        ref={sidebarRef}
        className={`flex min-h-0 w-full shrink-0 flex-col lg:h-full lg:w-72 xl:w-80 ${
          sidebarFit.scrollable ? 'overflow-y-auto' : 'overflow-hidden'
        }`}
      >
        <div
          className="w-full"
          style={sidebarFit.scale < 1 ? { height: sidebarFit.naturalHeight * sidebarFit.scale } : undefined}
        >
          <div
            ref={sidebarContentRef}
            className="flex w-full flex-col gap-2 origin-top-left"
            style={sidebarFit.scale < 1 ? {
              transform: `scale(${sidebarFit.scale})`,
              width: `${100 / sidebarFit.scale}%`,
            } : undefined}
          >
            <MiniMonth
              anchorDate={sidebarMonth}
              periodStart={weekStart}
              viewMode={viewMode}
              focusedDay={focusedDay}
              onPickDate={handlePickDate}
              onMonthChange={setSidebarMonth}
              compact={sidebarCompact}
            />

            <ExecutiveGlancePanel kpis={kpis} compact={sidebarCompact} />

            <ExecutiveNextAppointmentCard
              appointment={nextAppointment}
              onViewDetails={handleViewNextAppointment}
              onReschedule={handleRescheduleNextAppointment}
              compact={sidebarCompact}
            />

            <ExecutiveQuickActions
              kpis={kpis}
              onNewAppointment={openNewAppointment}
              compact={sidebarCompact}
            />
          </div>
        </div>
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
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
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner size={32} />
          </div>
        ) : (
          <div
            key={`${viewMode}-${weekStart.toISOString()}`}
            className={`gcal-period-shell flex min-h-0 flex-1 flex-col ${
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
              className={`min-h-0 flex-1 ${gridFitsViewport ? 'overflow-y-hidden' : 'overflow-y-auto'} ${periodDays.length > 7 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}
            >
              <div
                className={`gcal-period-grid relative grid ${viewAnimClass || ''}`}
                style={{
                  gridTemplateColumns,
                  height: gridFitsViewport ? '100%' : `${gridScrollHeight}px`,
                  minHeight: gridFitsViewport ? `${gridScrollHeight}px` : undefined,
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
                <div className="relative z-10 min-h-full border-r border-gray-200 bg-white">
                  {HOUR_LABELS.map((hour) => (
                    <GutterHourMark
                      key={hour}
                      hour={hour}
                      hourHeight={layoutHourHeight}
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
                      className={`relative min-h-full border-l border-gray-200 ${pastDay ? 'bg-gray-50/80' : ''}`}
                    >
                      <div
                        className={`absolute top-0 ${pastDay ? 'cursor-not-allowed' : 'cursor-pointer'} left-0 right-0`}
                        style={{ height: gridFitsViewport ? '100%' : `${gridBodyHeight}px` }}
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
                          className="absolute left-1 right-1 z-[25] overflow-hidden rounded-md border border-[#1a73e8]/40 bg-[#039be5] px-1.5 py-1 text-left shadow-sm pointer-events-none animate-gcal-slot"
                          style={{
                            top: draftPreview.top,
                            height: draftPreview.height,
                            minHeight: '46px',
                          }}
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
      <ExecutiveCalendarLegend className="shrink-0" />
      </div>
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
