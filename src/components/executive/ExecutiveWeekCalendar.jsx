import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock, Clock3, User, UserCheck } from 'lucide-react';
import { Spinner, IconButton } from '../ui';
import ExecutiveQuickAddPopover from './ExecutiveQuickAddPopover';
import { executiveApi } from '../../utils/visitorApi';
import { useToast } from '../../context/ToastContext';
import {
  addMinutes,
  addWeeks,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  currentTimeIndicator,
  currentTimePositionPx,
  DEFAULT_EVENT_MINUTES,
  eventLayout,
  formatCurrentTimeLabel,
  formatDayHeader,
  formatHourLabel,
  formatTimeRange,
  formatWeekRange,
  getMonthGrid,
  getWeekDays,
  GRID_BODY_HEIGHT_PX,
  GRID_SCROLL_HEIGHT_PX,
  GRID_VIEWPORT_HEIGHT_PX,
  HOUR_LABELS,
  HOUR_HEIGHT_PX,
  initialGridScrollTop,
  isSameDay,
  isSameMonth,
  slotFromPointer,
  startOfWeek,
  weekQueryRange,
  computeSlotRect,
} from './calendarUtils';

const HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, i) => CALENDAR_START_HOUR + i,
);

function hourLabelTop(hour) {
  return (hour - CALENDAR_START_HOUR) * HOUR_HEIGHT_PX;
}

const EVENT_COLORS = {
  vip: 'bg-purple-100 border-purple-300 text-purple-900',
  vvip: 'bg-amber-100 border-amber-300 text-amber-900',
  standard: 'bg-blue-100 border-blue-300 text-blue-900',
};

function eventColor(classification, visitStatus) {
  const key = String(classification || 'standard').toLowerCase();
  if (key === 'vip' || key === 'vvip') return EVENT_COLORS[key];
  if (visitStatus === 'pending_approval' || visitStatus === 'pre_registered') {
    return 'bg-orange-50 border-orange-300 text-orange-900';
  }
  return EVENT_COLORS.standard;
}

function MiniMonth({ anchorDate, weekStart, onPickDate, onMonthChange }) {
  const days = useMemo(() => getMonthGrid(anchorDate), [anchorDate]);
  const monthLabel = anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

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
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day) => {
          const inMonth = isSameMonth(day, anchorDate);
          const selected = isSameDay(day, weekStart);
          const today = isSameDay(day, new Date());
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPickDate(day)}
              className={`h-8 w-8 rounded-full text-xs transition-colors ${
                !inMonth ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-100'
              } ${selected ? 'bg-blue-600 text-white hover:bg-blue-600' : ''} ${
                today && !selected ? 'ring-1 ring-blue-500' : ''
              }`}
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
  {
    label: 'Standard visitor',
    swatch: 'bg-blue-100 border-blue-400 shadow-sm shadow-blue-200/50',
  },
  {
    label: 'VIP',
    swatch: 'bg-violet-100 border-violet-500 shadow-sm shadow-violet-200/50',
  },
  {
    label: 'VVIP',
    swatch: 'bg-amber-100 border-amber-500 shadow-sm shadow-amber-200/50',
  },
  {
    label: 'Pending approval',
    swatch: 'bg-orange-50 border-orange-500 shadow-sm shadow-orange-200/50',
  },
];

function ExecutiveLegendPanel() {
  return (
    <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm">
      <div className="border-b border-navy-100 bg-gradient-to-r from-navy-50/90 to-white px-3.5 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">Event types</p>
      </div>
      <ul className="divide-y divide-navy-100/80">
        {LEGEND_ITEMS.map(({ label, swatch }) => (
          <li key={label} className="flex items-center gap-3 px-3.5 py-2.5">
            <span
              className={`h-5 w-9 shrink-0 rounded-md border-2 ${swatch}`}
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-navy-700">{label}</span>
          </li>
        ))}
      </ul>
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
  onWeekChange,
  onRefresh,
}) {
  const toast = useToast();
  const gridScrollRef = useRef(null);
  const [sidebarMonth, setSidebarMonth] = useState(weekStart);
  const [draft, setDraft] = useState(null);
  const [referenceData, setReferenceData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const nowLine = currentTimeIndicator(now);
  const nowLinePx = currentTimePositionPx(now);
  const currentHour = now.getHours();

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSidebarMonth(weekStart);
  }, [weekStart]);

  useEffect(() => {
    if (loading) return undefined;

    const el = gridScrollRef.current;
    if (!el) return undefined;

    const nowDate = new Date();
    const hasToday = weekDays.some((day) => isSameDay(day, nowDate));
    const focusHour = hasToday
      ? Math.max(CALENDAR_START_HOUR, nowDate.getHours())
      : 8;

    el.scrollTop = initialGridScrollTop(focusHour);
    return undefined;
  }, [weekStart, loading, weekDays]);

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
    const slotRect = computeSlotRect(column, currentDraft.startAt, currentDraft.endAt, GRID_BODY_HEIGHT_PX);
    if (!slotRect) return currentDraft;
    return { ...currentDraft, slotRect };
  }, []);

  const handleSlotClick = useCallback((event, day) => {
    if (event.target.closest('[data-calendar-event]')) return;
    const column = event.currentTarget;
    const rect = column.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const startAt = slotFromPointer(day, offsetY, rect.height);
    const endAt = addMinutes(startAt, DEFAULT_EVENT_MINUTES);
    const dayKey = day.toISOString();
    const slotRect = computeSlotRect(column, startAt, endAt, GRID_BODY_HEIGHT_PX);
    setDraft({
      day,
      dayKey,
      startAt,
      endAt,
      title: '',
      slotRect,
    });
  }, []);

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
    for (const day of weekDays) {
      map.set(
        day.toDateString(),
        appointments.filter((appt) => {
          const d = new Date(appt.scheduled_at);
          return !Number.isNaN(d.getTime()) && isSameDay(d, day);
        }),
      );
    }
    return map;
  }, [appointments, weekDays]);

  const goToday = () => {
    const start = startOfWeek(new Date());
    onWeekChange(start);
    setSidebarMonth(start);
  };

  const scrollToNow = useCallback(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const focusHour = Math.max(CALENDAR_START_HOUR, now.getHours());
    el.scrollTo({ top: initialGridScrollTop(focusHour), behavior: 'smooth' });
  }, [now]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-0">
      {/* Left sidebar — Google Calendar style */}
      <aside className="w-full lg:w-64 shrink-0 space-y-5">
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
          weekStart={weekStart}
          onPickDate={(day) => {
            onWeekChange(startOfWeek(day));
            setSidebarMonth(day);
          }}
          onMonthChange={setSidebarMonth}
        />

        <ExecutiveGlancePanel kpis={kpis} />

        <ExecutiveLegendPanel />

        <div className="space-y-1 text-sm">
          <Link to="/executive/visitors" className="block rounded-lg px-3 py-2 text-blue-600 hover:bg-blue-50">My visitors</Link>
          <Link to="/executive/notifications" className="block rounded-lg px-3 py-2 text-blue-600 hover:bg-blue-50">Notifications</Link>
        </div>
      </aside>

      {/* Main calendar */}
      <div className="flex-1 min-w-0 min-h-[560px] max-h-[calc(100vh-11rem)] rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-navy-800/30 bg-gradient-to-r from-[#0f294d] via-[#132f52] to-[#163a63] px-4 py-3 shadow-sm">
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            Today
          </button>
          <div className="flex items-center gap-0.5">
            <IconButton
              icon={ChevronLeft}
              label="Previous week"
              tooltip="Previous week"
              variant="ghost"
              size="sm"
              className="text-white/85 hover:bg-white/10 hover:text-white"
              onClick={() => onWeekChange(addWeeks(weekStart, -1))}
            />
            <IconButton
              icon={ChevronRight}
              label="Next week"
              tooltip="Next week"
              variant="ghost"
              size="sm"
              className="text-white/85 hover:bg-white/10 hover:text-white"
              onClick={() => onWeekChange(addWeeks(weekStart, 1))}
            />
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-white">{formatWeekRange(weekStart)}</h2>
          <span className="ml-auto rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/20">
            Week
          </span>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Spinner size={32} />
          </div>
        ) : (
          <>
            {/* Day headers — fixed above scroll so they never cover hour rows */}
            <div className="shrink-0 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={scrollToNow}
                className="flex items-center justify-center border-r border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                aria-label="Jump to current time"
                title="Jump to current time"
              >
                <Clock size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              {weekDays.map((day) => {
                const { weekday, day: dayNum, isToday } = formatDayHeader(day, now);
                return (
                  <div key={day.toISOString()} className="border-l border-gray-200 bg-gray-50 py-2.5 text-center">
                    <p className="text-[11px] font-medium text-gray-500">{weekday}</p>
                    <p className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday ? 'bg-blue-600 text-white' : 'text-gray-800'
                    }`}
                    >
                      {dayNum}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Time grid — 12-hour viewport, scroll through full day */}
            <div
              ref={gridScrollRef}
              className="min-h-0 shrink-0 overflow-y-auto overflow-x-hidden"
              style={{ height: `${GRID_VIEWPORT_HEIGHT_PX}px` }}
            >
              <div
                className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] relative"
                style={{ height: `${GRID_SCROLL_HEIGHT_PX}px` }}
              >
                {/* Current hour band across the grid */}
                {nowLinePx != null && currentHour >= CALENDAR_START_HOUR && currentHour < CALENDAR_END_HOUR && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-[5] bg-red-50/50"
                    style={{
                      top: `${hourLabelTop(currentHour)}px`,
                      height: `${HOUR_HEIGHT_PX}px`,
                    }}
                    aria-hidden="true"
                  />
                )}

                {/* Hour labels */}
                <div className="relative z-10 border-r border-gray-200 bg-gray-50/95">
                  {HOUR_LABELS.map((hour) => {
                    const isCurrentHour = hour === currentHour;
                    return (
                      <div
                        key={hour}
                        className={`absolute right-2 text-[11px] leading-none ${
                          isCurrentHour
                            ? 'font-bold text-red-600'
                            : 'font-medium text-gray-400'
                        }`}
                        style={{
                          top: `${hourLabelTop(hour)}px`,
                          transform: hour === CALENDAR_START_HOUR ? 'translateY(2px)' : 'translateY(-50%)',
                        }}
                      >
                        {formatHourLabel(hour)}
                      </div>
                    );
                  })}
                  <div
                    className="absolute right-2 text-[11px] leading-none font-medium text-gray-400"
                    style={{ top: `${GRID_BODY_HEIGHT_PX}px`, transform: 'translateY(-50%)' }}
                  >
                    {formatHourLabel(CALENDAR_END_HOUR)}
                  </div>

                  {nowLinePx != null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-end pr-1"
                      style={{ top: `${nowLinePx}px`, transform: 'translateY(-50%)' }}
                    >
                      <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                        {formatCurrentTimeLabel(now)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Day columns */}
                {weekDays.map((day) => {
                  const dayEvents = eventsByDay.get(day.toDateString()) || [];
                  const isToday = isSameDay(day, now);

                  return (
                    <div
                      key={day.toISOString()}
                      data-calendar-day={day.toISOString()}
                      className="relative border-l border-gray-200"
                    >
                      <div
                        className="absolute inset-x-0 top-0 cursor-pointer"
                        style={{ height: `${GRID_BODY_HEIGHT_PX}px` }}
                        onClick={(event) => handleSlotClick(event, day)}
                      >
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 border-t border-gray-100"
                          style={{ top: `${((hour - CALENDAR_START_HOUR) / (CALENDAR_END_HOUR - CALENDAR_START_HOUR)) * 100}%` }}
                        />
                      ))}

                      {/* Current time line */}
                      {isToday && nowLine && (
                        <div
                          className="absolute inset-x-0 z-20 flex items-center pointer-events-none"
                          style={{ top: nowLine }}
                        >
                          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                          <span className="h-px flex-1 bg-red-500" />
                        </div>
                      )}

                      {/* Selected slot preview — stays visible while popover slides left */}
                      {draft && isSameDay(day, draft.day) && draftPreview && (
                        <div
                          data-calendar-event
                          className="absolute inset-x-1 z-[25] overflow-hidden rounded-md bg-[#039be5] px-2 py-1 text-left shadow-md pointer-events-none animate-gcal-slot"
                          style={{ top: draftPreview.top, height: draftPreview.height, minHeight: '22px' }}
                        >
                          <p className="text-[11px] font-semibold truncate text-white">
                            {draft.title?.trim() || '(No title)'}
                          </p>
                        </div>
                      )}

                      {/* Events */}
                      {dayEvents.map((appt) => {
                        const layout = eventLayout(appt.scheduled_at, DEFAULT_EVENT_MINUTES);
                        if (!layout) return null;
                        const color = eventColor(appt.classification, appt.visit_status);
                        const time = layout.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                        const heightPct = parseFloat(String(layout.height).replace('%', ''));
                        const showMeta = heightPct > 7;

                        const content = (
                          <div
                            data-calendar-event
                            className={`absolute inset-x-1 z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-left shadow-sm ${color}`}
                            style={{ top: layout.top, height: layout.height, minHeight: '22px' }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <p className="text-[11px] font-semibold truncate leading-tight">{appt.visitor_name || appt.title}</p>
                            {showMeta && (
                              <p className="text-[10px] opacity-80 truncate leading-tight">{time}{appt.company ? ` · ${appt.company}` : ''}</p>
                            )}
                          </div>
                        );

                        return appt.visit_id ? (
                          <Link key={appt.id || appt.appointment_id} to={`/executive/visitors/${appt.visit_id}`} className="block">
                            {content}
                          </Link>
                        ) : (
                          <div key={appt.id || appt.appointment_id}>{content}</div>
                        );
                      })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <ExecutiveQuickAddPopover
        draft={draft}
        executive={executive}
        referenceData={referenceData}
        saving={saving}
        onClose={() => setDraft(null)}
        onDraftChange={(nextDraft) => {
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

export { startOfWeek, weekQueryRange };
