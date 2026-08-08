import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import {
  addDays,
  addMinutes,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  DEFAULT_EVENT_MINUTES,
  eventLayout,
  formatHourLabel,
  getWeekDays,
  HOUR_HEIGHT_PX,
  HOUR_LABELS,
  initialGridScrollTop,
  isSameDay,
  isPastDay,
  isScheduleInPast,
  FUTURE_SCHEDULE_ERROR,
  slotFromPointer,
  startOfDay,
  startOfWeek,
} from './calendarUtils';

const GRID_BODY_HEIGHT_PX = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT_PX;

function hourTop(hour) {
  return (hour - CALENDAR_START_HOUR) * HOUR_HEIGHT_PX;
}

function formatTimezoneLabel() {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  return `GMT${sign}${hours}`;
}

function formatToolbarDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function draftDurationMinutes(startAt, endAt) {
  return Math.max(
    DEFAULT_EVENT_MINUTES,
    Math.round((endAt.getTime() - startAt.getTime()) / 60000),
  );
}

export default function ExecutiveFindTimePanel({
  draft,
  appointments = [],
  onDraftChange,
  onScheduleRejected,
}) {
  const [view, setView] = useState('day');
  const [focusDate, setFocusDate] = useState(() => startOfDay(draft?.startAt || new Date()));
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!draft?.startAt) return;
    setFocusDate(startOfDay(draft.startAt));
  }, [draft?.startAt]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !draft?.startAt) return;
    const focusHour = Math.max(CALENDAR_START_HOUR, draft.startAt.getHours());
    el.scrollTop = initialGridScrollTop(focusHour, 420);
  }, [draft?.startAt, view]);

  const days = useMemo(
    () => (view === 'week' ? getWeekDays(startOfWeek(focusDate)) : [startOfDay(focusDate)]),
    [focusDate, view],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const day of days) {
      map.set(
        day.toDateString(),
        appointments.filter((appt) => {
          const scheduled = new Date(appt.scheduled_at);
          return !Number.isNaN(scheduled.getTime()) && isSameDay(scheduled, day);
        }),
      );
    }
    return map;
  }, [appointments, days]);

  const draftDuration = draft
    ? draftDurationMinutes(draft.startAt, draft.endAt)
    : DEFAULT_EVENT_MINUTES;

  const handleNavigate = (delta) => {
    setFocusDate((current) => addDays(current, view === 'week' ? delta * 7 : delta));
  };

  const goToday = () => setFocusDate(startOfDay(new Date()));

  const handleSlotClick = (event, day) => {
    if (event.target.closest('[data-find-time-event]')) return;
    const column = event.currentTarget;
    const rect = column.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const startAt = slotFromPointer(day, offsetY, GRID_BODY_HEIGHT_PX);
    if (isPastDay(day) || isScheduleInPast(startAt)) {
      onScheduleRejected?.(FUTURE_SCHEDULE_ERROR);
      return;
    }
    const endAt = addMinutes(startAt, draftDuration);
    onDraftChange?.({
      ...draft,
      day,
      dayKey: day.toISOString(),
      startAt,
      endAt,
    });
    setFocusDate(startOfDay(day));
  };

  const gridTemplate = view === 'week'
    ? `56px repeat(7, minmax(0, 1fr))`
    : '56px minmax(0, 1fr)';

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2.5">
        <button
          type="button"
          onClick={goToday}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Today
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => handleNavigate(-1)}
            className="rounded-full p-1.5 text-gray-600 hover:bg-gray-100"
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate(1)}
            className="rounded-full p-1.5 text-gray-600 hover:bg-gray-100"
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-800">{formatToolbarDate(focusDate)}</p>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-sm">
            <button
              type="button"
              onClick={() => setView('day')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 ${
                view === 'day' ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {view === 'day' && <Check size={14} />}
              Day
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              className={`border-l border-gray-300 px-3 py-1.5 ${
                view === 'week' ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Week
            </button>
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 text-gray-600 hover:bg-gray-100"
            aria-label="Filter"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[420px] overflow-auto">
        <div
          className="sticky top-0 z-20 grid border-b border-gray-200 bg-white"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="border-r border-gray-200 px-2 py-2 text-[11px] font-medium text-gray-500">
            {formatTimezoneLabel()}
          </div>
          {days.map((day) => {
            const weekday = day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
            const dayNum = day.getDate();
            const selected = draft && isSameDay(day, draft.startAt);
            return (
              <div key={day.toISOString()} className="border-l border-gray-200 py-2 text-center">
                <p className="text-[11px] font-medium text-gray-500">{weekday}</p>
                <p className={`mt-0.5 text-sm font-semibold ${selected ? 'text-[#1a73e8]' : 'text-gray-800'}`}>
                  {dayNum}
                </p>
              </div>
            );
          })}
        </div>

        <div
          className="relative grid"
          style={{ gridTemplateColumns: gridTemplate, height: `${GRID_BODY_HEIGHT_PX}px` }}
        >
          <div className="relative border-r border-gray-200 bg-white">
            {HOUR_LABELS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 text-[11px] font-medium text-gray-400"
                style={{
                  top: `${hourTop(hour)}px`,
                  transform: hour === CALENDAR_START_HOUR ? 'translateY(2px)' : 'translateY(-50%)',
                }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayEvents = eventsByDay.get(day.toDateString()) || [];
            const showDraft = draft && isSameDay(day, draft.startAt);
            const draftLayout = showDraft ? eventLayout(draft.startAt, draftDuration) : null;

            return (
              <div key={day.toISOString()} className="relative border-l border-gray-200">
                <div
                  className="absolute inset-0 cursor-pointer"
                  onClick={(event) => handleSlotClick(event, day)}
                >
                  {HOUR_LABELS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 border-t border-gray-100"
                      style={{ top: `${hourTop(hour)}px` }}
                    />
                  ))}

                  {dayEvents.map((appt) => {
                    const layout = eventLayout(appt.scheduled_at, DEFAULT_EVENT_MINUTES);
                    if (!layout) return null;
                    return (
                      <div
                        key={appt.id || appt.appointment_id}
                        data-find-time-event
                        className="absolute inset-x-0.5 z-10 overflow-hidden rounded-sm bg-[#039be5]/25 px-1 py-0.5 text-[10px] font-medium text-[#1a73e8]"
                        style={{ top: layout.top, height: layout.height, minHeight: '18px' }}
                      >
                        <span className="truncate">{appt.visitor_name || appt.title}</span>
                      </div>
                    );
                  })}

                  {showDraft && draftLayout && (
                    <div
                      data-find-time-event
                      className="absolute inset-x-0.5 z-20 rounded-sm border border-[#1a73e8] bg-[#039be5] px-1 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                      style={{ top: draftLayout.top, height: draftLayout.height, minHeight: '20px' }}
                    >
                      {draft.title?.trim() || '(No title)'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
