import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  addDays,
  addMinutes,
  parseAppointmentDate,
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
  CALENDAR_GUTTER_WIDTH_PX,
  currentTimePositionPx,
  DEFAULT_EVENT_MINUTES,
  eventLayout,
  layoutDayEventCards,
  formatGutterLiveTime,
  formatDayHeader,
  formatHourLabel,
  formatTimeRange,
  getMonthGrid,
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

function useSidebarCompact() {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && window.innerHeight < 920
  ));

  useEffect(() => {
    const update = () => {
      const height = window.innerHeight;
      setCompact((current) => {
        if (current && height > 940) return false;
        if (!current && height < 900) return true;
        return current;
      });
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  return compact;
}

function hourLabelTop(hour, hourHeight = HOUR_HEIGHT_PX) {
  return (hour - CALENDAR_START_HOUR) * hourHeight;
}

function GutterHourMark({ hour, hourHeight, isFirst = false, isLast = false }) {
  const lineTop = hourLabelTop(hour, hourHeight);
  let transform = 'translateY(-50%)';
  if (isFirst) transform = 'translateY(0)';
  else if (isLast) transform = 'translateY(-100%)';

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-start justify-end pr-1.5 text-[10px] font-medium tabular-nums text-gray-400"
      style={{
        top: `${lineTop}px`,
        transform,
      }}
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
    <div className="inline-flex rounded-md bg-gray-100 p-px" role="tablist" aria-label="Calendar view">
      {TOOLBAR_VIEW_MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={option.id === value}
          onClick={() => onChange(option.id)}
          className={`rounded-[5px] px-2 py-1 text-[11px] font-semibold transition-colors ${
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
    <div className={`shrink-0 rounded-2xl border border-gray-200 bg-white shadow-sm ${compact ? 'p-3' : 'p-4'}`}>
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
  const navigate = useNavigate();
  const { isLoading, hasPermission } = useAuth();
  const canCreateAppointments = hasPermission('executive.appointments');
  const toolbarRef = useRef(null);
  const dayHeadersRef = useRef(null);
  const gridScrollRef = useRef(null);
  const sidebarCompact = useSidebarCompact();
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
  const layoutHourHeight = viewConfig.hourHeight;
  const gridBodyHeight = useMemo(() => gridBodyHeightPx(layoutHourHeight), [layoutHourHeight]);
  const gridScrollHeight = useMemo(() => gridScrollHeightPx(layoutHourHeight), [layoutHourHeight]);
  const gridMinWidth = useMemo(
    () => CALENDAR_GUTTER_WIDTH_PX + periodDays.length * viewConfig.minDayWidth,
    [periodDays.length, viewConfig.minDayWidth],
  );
  const gridTemplateColumns = useMemo(
    () => `${CALENDAR_GUTTER_WIDTH_PX}px repeat(${periodDays.length}, minmax(${viewConfig.minDayWidth}px, 1fr))`,
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

  const syncGridScrollPosition = useCallback((behavior = 'auto') => {
    const el = gridScrollRef.current;
    if (!el) return;

    const canScrollVertically = el.scrollHeight > el.clientHeight + 1;
    if (!canScrollVertically) {
      el.scrollTo({ top: 0, behavior });
      return;
    }

    const nowDate = new Date();
    const hasToday = periodDays.some((day) => isSameDay(day, nowDate));
    if (!hasToday) {
      el.scrollTo({ top: 0, behavior });
      return;
    }

    const focusHour = Math.max(CALENDAR_START_HOUR, nowDate.getHours());
    const nextTop = initialGridScrollTop(focusHour, el.clientHeight, layoutHourHeight);
    el.scrollTo({ top: nextTop, behavior });
  }, [periodDays, layoutHourHeight]);

  const handleGridWheel = useCallback((event) => {
    const el = gridScrollRef.current;
    if (!el) return;

    const {
      scrollTop,
      scrollHeight,
      clientHeight,
      scrollLeft,
      scrollWidth,
      clientWidth,
    } = el;

    const canScrollUp = scrollTop > 0;
    const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
    const canScrollLeft = scrollLeft > 0;
    const canScrollRight = scrollLeft + clientWidth < scrollWidth - 1;

    const { deltaX, deltaY } = event;
    const verticalIntent = Math.abs(deltaY) >= Math.abs(deltaX);

    if (verticalIntent) {
      if ((deltaY < 0 && canScrollUp) || (deltaY > 0 && canScrollDown)) {
        event.stopPropagation();
      }
      return;
    }

    if ((deltaX < 0 && canScrollLeft) || (deltaX > 0 && canScrollRight)) {
      event.stopPropagation();
    }
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    const frameId = window.requestAnimationFrame(() => syncGridScrollPosition('auto'));
    return () => window.cancelAnimationFrame(frameId);
  }, [weekStart, loading, viewMode, syncGridScrollPosition]);

  useEffect(() => {
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
  }, [periodDays.length, viewMode, weekStart, gridMinWidth]);

  useEffect(() => {
    if (isLoading || !hasPermission('executive.dashboard')) return undefined;
    let cancelled = false;
    executiveApi.getReferenceData()
      .then((data) => {
        if (!cancelled) setReferenceData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoading, hasPermission]);

  const refreshDraftSlotRect = useCallback((currentDraft) => {
    if (!currentDraft?.dayKey) return currentDraft;
    const column = document.querySelector(`[data-calendar-day="${currentDraft.dayKey}"]`);
    if (!column) return currentDraft;
    const slotRect = computeSlotRect(column, currentDraft.startAt, currentDraft.endAt, gridBodyHeight);
    if (!slotRect) return currentDraft;
    return { ...currentDraft, slotRect };
  }, [gridBodyHeight]);

  const openNewAppointment = useCallback(() => {
    if (!canCreateAppointments) {
      toast.error('You do not have permission to create executive appointments.');
      return;
    }
    navigate('/host/appointments/new', { state: { from: '/host' } });
  }, [canCreateAppointments, navigate, toast]);

  useEffect(() => {
    if (!newAppointmentTrigger || !canCreateAppointments) return;
    openNewAppointment();
  }, [newAppointmentTrigger, openNewAppointment, canCreateAppointments]);

  const handleSlotClick = useCallback((event, day) => {
    if (!canCreateAppointments) return;
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
  }, [canCreateAppointments, gridBodyHeight, toast]);

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
    syncGridScrollPosition('smooth');
  }, [syncGridScrollPosition]);

  const mappedNextAppointment = useMemo(
    () => mapNextAppointmentToCalendarRow(nextAppointment),
    [nextAppointment],
  );

  const handleViewNextAppointment = useCallback(() => {
    if (!mappedNextAppointment) return;
    setSelectedAppointment(mappedNextAppointment);
  }, [mappedNextAppointment]);

  const handleRescheduleNextAppointment = useCallback(() => {
    if (!canCreateAppointments) {
      toast.error('You do not have permission to create executive appointments.');
      return;
    }
    if (!nextAppointment?.scheduled_at) return;
    const duration = Number(nextAppointment.duration_minutes);
    const start = parseAppointmentDate(nextAppointment.scheduled_at) || nextAppointment.scheduled_at;
    const endAt = start instanceof Date && Number.isFinite(duration) && duration > 0
      ? addMinutes(start, duration)
      : null;
    navigate('/host/appointments/new', {
      state: {
        from: '/host',
        startAt: start,
        endAt,
        prefill: {
          title: nextAppointment.title || '',
          visitorName: nextAppointment.visitor_name || '',
          company: nextAppointment.company || '',
          phone: nextAppointment.phone || '',
          purpose: nextAppointment.purpose || '',
        },
      },
    });
  }, [canCreateAppointments, navigate, nextAppointment, toast]);

  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:items-stretch lg:gap-3 ${className}`.trim()}>
      <aside className="flex min-h-0 w-full shrink-0 flex-col gap-1.5 overflow-y-auto lg:h-full lg:w-60 xl:w-64">
        <MiniMonth
          anchorDate={sidebarMonth}
          periodStart={weekStart}
          viewMode={viewMode}
          focusedDay={focusedDay}
          onPickDate={handlePickDate}
          onMonthChange={setSidebarMonth}
          compact={sidebarCompact}
        />

        <ExecutiveGlancePanel kpis={kpis} compact />

        <div className="shrink-0">
          <ExecutiveNextAppointmentCard
            appointment={nextAppointment}
            onViewDetails={handleViewNextAppointment}
            onReschedule={handleRescheduleNextAppointment}
            compact={sidebarCompact}
          />
        </div>

        <div className="shrink-0">
          <ExecutiveQuickActions
            kpis={kpis}
            onNewAppointment={openNewAppointment}
            canCreateAppointments={canCreateAppointments}
            compact={sidebarCompact}
          />
        </div>
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div
          ref={toolbarRef}
          className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-200 bg-white px-2.5 py-1.5 sm:px-3"
        >
          <button
            type="button"
            onClick={goToday}
            className="rounded-md bg-navy-900 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-navy-800"
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
              iconSize={14}
              onClick={() => changePeriod(navigatePeriod(weekStart, viewMode, -1), 'backward')}
            />
            <IconButton
              icon={ChevronRight}
              label={`Next ${navLabel}`}
              tooltip={`Next ${navLabel}`}
              variant="ghost"
              size="sm"
              iconSize={14}
              onClick={() => changePeriod(navigatePeriod(weekStart, viewMode, 1), 'forward')}
            />
          </div>
          <div className="flex min-w-0 items-center gap-1 text-gray-800">
            <CalendarDays size={14} className="shrink-0 text-gray-500" aria-hidden="true" />
            <h2 className="truncate text-xs font-semibold tracking-tight sm:text-sm">
              {formatPeriodRange(weekStart, viewMode)}
            </h2>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ViewModeTabs value={viewMode} onChange={handleViewModeChange} />
            <button
              type="button"
              className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              aria-label="Filter calendar"
            >
              <Filter size={12} aria-hidden="true" />
              Filter
              <ChevronDown size={12} className="text-gray-400" aria-hidden="true" />
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
              className="shrink-0 overflow-x-auto grid border-b border-gray-200 bg-white"
              style={{
                gridTemplateColumns,
                minWidth: `${gridMinWidth}px`,
              }}
            >
              <div className="border-r border-gray-200 bg-white" aria-hidden="true" />
              {periodDays.map((day) => {
                const { weekday, day: dayNum, isToday } = formatDayHeader(day, now);
                return (
                  <div key={day.toISOString()} className="border-l border-gray-200 py-1.5 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {weekday}
                    </p>
                    <p className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? 'bg-navy-900 text-white' : 'text-gray-800'
                    }`}
                    >
                      {dayNum}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Time grid — fixed 40px rows; scrolls through full 00:00–24:00 day */}
            <div
              ref={gridScrollRef}
              className="gcal-period-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain"
              onWheel={handleGridWheel}
            >
              <div
                className={`gcal-period-grid relative grid ${viewAnimClass || ''}`}
                style={{
                  gridTemplateColumns,
                  height: `${gridScrollHeight}px`,
                  minWidth: `${gridMinWidth}px`,
                }}
              >
                {nowLinePx != null && periodDays.some((day) => isSameDay(day, now)) && (
                  <div
                    className="pointer-events-none absolute right-0 z-[15] h-0.5 bg-red-500"
                    style={{ left: `${CALENDAR_GUTTER_WIDTH_PX}px`, top: `${nowLinePx}px` }}
                    aria-hidden="true"
                  />
                )}

                {/* Hour labels + current time pill */}
                <div className="relative z-10 border-r border-gray-200 bg-white">
                  <div className="relative" style={{ height: `${gridBodyHeight}px` }}>
                    {HOUR_LABELS.map((hour) => (
                      <GutterHourMark
                        key={hour}
                        hour={hour}
                        hourHeight={layoutHourHeight}
                        isFirst={hour === CALENDAR_START_HOUR}
                        isLast={hour === CALENDAR_END_HOUR}
                      />
                    ))}
                    {nowLinePx != null && (
                      <div
                        className="pointer-events-none absolute right-0 z-30 flex justify-end pr-1"
                        style={{ top: `${nowLinePx}px`, transform: 'translateY(-50%)' }}
                      >
                        <span className="rounded bg-red-500 px-1 py-0.5 text-[9px] font-bold tabular-nums text-white shadow-sm">
                          {gutterLiveTime}
                        </span>
                      </div>
                    )}
                  </div>
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
                      className={`relative min-h-full border-l border-gray-200 ${pastDay ? 'bg-gray-50/80' : 'bg-white'}`}
                    >
                      <div
                        className={`absolute top-0 ${pastDay ? 'cursor-not-allowed' : 'cursor-pointer'} left-0 right-0`}
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
                          className="absolute left-1 right-1 z-[25] overflow-hidden rounded-md border border-[#1a73e8]/40 bg-[#039be5] px-1.5 py-1 text-left shadow-sm pointer-events-none animate-gcal-slot"
                          style={{
                            top: draftPreview.top,
                            height: draftPreview.height,
                            minHeight: '24px',
                          }}
                        >
                          <p className="truncate text-[8px] font-medium text-white/90">
                            {formatTimeRange(draft.startAt, draft.endAt)}
                          </p>
                          <p className="mt-px truncate text-[9px] font-semibold text-white">
                            {draft.title?.trim() || '(No title)'}
                          </p>
                        </div>
                      )}

                      {/* Events — side-by-side when overlapping */}
                      {layoutDayEventCards(dayEvents).map(({ appointment: appt, layout, overlapColumnCount }) => (
                        <ExecutiveCalendarEventCard
                          key={appt.id || appt.appointment_id}
                          appointment={appt}
                          layout={layout}
                          compactHeaders={compactHeaders}
                          overlapColumnCount={overlapColumnCount}
                          onSelect={setSelectedAppointment}
                        />
                      ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <ExecutiveCalendarLegend className="shrink-0" />
          </div>
        )}
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
