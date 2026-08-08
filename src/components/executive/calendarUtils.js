const DAY_MS = 24 * 60 * 60 * 1000;

export const CALENDAR_START_HOUR = 0;
export const CALENDAR_END_HOUR = 24;
export const CALENDAR_VISIBLE_HOURS = 12;
export const HOUR_HEIGHT_PX = 44;
export const DEFAULT_EVENT_MINUTES = 60;
export const GRID_BODY_HEIGHT_PX = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT_PX;
export const GRID_PADDING_BOTTOM_PX = 12;
export const GRID_SCROLL_HEIGHT_PX = GRID_BODY_HEIGHT_PX + GRID_PADDING_BOTTOM_PX;
export const GRID_VIEWPORT_HEIGHT_PX = CALENDAR_VISIBLE_HOURS * HOUR_HEIGHT_PX;
export const HOUR_LABELS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
  (_, i) => CALENDAR_START_HOUR + i,
);

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Week starts on Sunday (Google Calendar style). */
export function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

export function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return startOfMonth(d);
}

export const CALENDAR_VIEW_MODES = {
  week: {
    id: 'week',
    label: 'Week',
    dayCount: 7,
    hourHeight: 44,
    minDayWidth: 72,
    stepDays: 7,
  },
  twoWeeks: {
    id: 'twoWeeks',
    label: '2 weeks',
    dayCount: 14,
    hourHeight: 44,
    minDayWidth: 48,
    stepDays: 14,
  },
  month: {
    id: 'month',
    label: 'Month',
    hourHeight: 32,
    minDayWidth: 34,
    stepMonths: 1,
  },
  twoMonths: {
    id: 'twoMonths',
    label: '2 months',
    hourHeight: 24,
    minDayWidth: 26,
    stepMonths: 2,
  },
};

export const CALENDAR_VIEW_OPTIONS = Object.values(CALENDAR_VIEW_MODES);

export function getViewConfig(viewMode = 'week') {
  return CALENDAR_VIEW_MODES[viewMode] || CALENDAR_VIEW_MODES.week;
}

export function gridBodyHeightPx(hourHeight = HOUR_HEIGHT_PX) {
  return (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * hourHeight;
}

export function gridScrollHeightPx(hourHeight = HOUR_HEIGHT_PX) {
  return gridBodyHeightPx(hourHeight) + GRID_PADDING_BOTTOM_PX;
}

export function normalizePeriodStart(date, viewMode = 'week') {
  const config = getViewConfig(viewMode);
  if (config.stepMonths) return startOfMonth(date);
  return startOfWeek(date);
}

export function getPeriodDays(periodStart, viewMode = 'week') {
  const config = getViewConfig(viewMode);

  if (config.dayCount) {
    return Array.from({ length: config.dayCount }, (_, i) => addDays(periodStart, i));
  }

  const monthStart = startOfMonth(periodStart);
  const monthSpan = config.stepMonths || 1;
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + monthSpan, 0);
  const days = [];
  let cursor = new Date(monthStart);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function isInPeriod(day, periodStart, viewMode = 'week') {
  const days = getPeriodDays(periodStart, viewMode);
  if (days.length === 0) return false;
  const target = startOfDay(day).getTime();
  const start = startOfDay(days[0]).getTime();
  const end = startOfDay(days[days.length - 1]).getTime() + DAY_MS;
  return target >= start && target < end;
}

export function formatPeriodRange(periodStart, viewMode = 'week') {
  const days = getPeriodDays(periodStart, viewMode);
  if (days.length === 0) return '';

  const first = days[0];
  const last = days[days.length - 1];

  if (viewMode === 'month') {
    return first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  if (viewMode === 'twoMonths') {
    const sameYear = first.getFullYear() === last.getFullYear();
    const startFmt = first.toLocaleDateString(undefined, { month: 'long' });
    const endFmt = last.toLocaleDateString(undefined, {
      month: 'long',
      year: sameYear ? undefined : 'numeric',
    });
    return sameYear
      ? `${startFmt} – ${endFmt}, ${last.getFullYear()}`
      : `${startFmt} – ${endFmt}`;
  }

  const sameMonth = isSameMonth(first, last);
  const startFmt = first.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const endFmt = last.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'long', day: 'numeric' });
  const year = last.getFullYear();
  return `${startFmt} – ${endFmt}, ${year}`;
}

export function periodQueryRange(periodStart, viewMode = 'week') {
  const days = getPeriodDays(periodStart, viewMode);
  if (days.length === 0) {
    return { from: toDateInputValue(periodStart), to: toDateInputValue(addDays(periodStart, 7)) };
  }

  return {
    from: toDateInputValue(days[0]),
    to: toDateInputValue(addDays(days[days.length - 1], 1)),
  };
}

export function navigatePeriod(periodStart, viewMode = 'week', direction = 1) {
  const config = getViewConfig(viewMode);
  if (config.stepMonths) {
    return addMonths(periodStart, config.stepMonths * direction);
  }
  return addDays(periodStart, config.stepDays * direction);
}

export function compareViewDensity(fromMode = 'week', toMode = 'week', periodStart = new Date()) {
  const fromDays = getPeriodDays(periodStart, fromMode).length;
  const toDays = getPeriodDays(periodStart, toMode).length;
  if (toDays > fromDays) return 'expand';
  if (toDays < fromDays) return 'shrink';
  return 'neutral';
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function isInWeek(day, weekStart) {
  const start = startOfWeek(weekStart).getTime();
  const end = start + (7 * DAY_MS);
  const target = startOfDay(day).getTime();
  return target >= start && target < end;
}

export function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = isSameMonth(weekStart, weekEnd);
  const startFmt = weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const endFmt = weekEnd.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'long', day: 'numeric' });
  const year = weekEnd.getFullYear();
  return sameMonth ? `${startFmt} – ${endFmt}, ${year}` : `${startFmt} – ${endFmt}, ${year}`;
}

export function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function getMonthGrid(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseAppointmentDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function eventLayout(scheduledAt, durationMinutes = DEFAULT_EVENT_MINUTES) {
  const date = parseAppointmentDate(scheduledAt);
  if (!date) return null;

  const startMinutes = date.getHours() * 60 + date.getMinutes();
  const gridStart = CALENDAR_START_HOUR * 60;
  const gridEnd = CALENDAR_END_HOUR * 60;
  const gridSpan = gridEnd - gridStart;

  const topMinutes = Math.max(0, startMinutes - gridStart);
  const heightMinutes = Math.min(durationMinutes, gridEnd - Math.max(startMinutes, gridStart));

  if (startMinutes >= gridEnd || startMinutes + durationMinutes <= gridStart) {
    return null;
  }

  return {
    top: `${(topMinutes / gridSpan) * 100}%`,
    height: `${Math.max((heightMinutes / gridSpan) * 100, 4)}%`,
    date,
  };
}

export function formatHourLabel(hour) {
  const normalized = ((hour % 24) + 24) % 24;
  const period = normalized >= 12 ? 'PM' : 'AM';
  const h = normalized % 12 || 12;
  return `${h} ${period}`;
}

/** Scroll position that keeps the given hour near the top of the 12-hour viewport. */
export function initialGridScrollTop(hour, viewportHeightPx = GRID_VIEWPORT_HEIGHT_PX) {
  const visibleHours = viewportHeightPx / HOUR_HEIGHT_PX;
  const offsetHours = Math.max(0, hour - 1);
  const maxScroll = Math.max(0, GRID_BODY_HEIGHT_PX - visibleHours * HOUR_HEIGHT_PX);
  return Math.min(offsetHours * HOUR_HEIGHT_PX, maxScroll);
}

export function formatDayHeader(date, today = new Date()) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  const day = date.getDate();
  return { weekday, day, isToday: isSameDay(date, today) };
}

export function weekQueryRange(weekStart) {
  return periodQueryRange(weekStart, 'week');
}

export function currentTimeIndicator(today = new Date()) {
  const minutes = today.getHours() * 60 + today.getMinutes();
  const gridStart = CALENDAR_START_HOUR * 60;
  const gridEnd = CALENDAR_END_HOUR * 60;
  if (minutes < gridStart || minutes > gridEnd) return null;
  return `${((minutes - gridStart) / (gridEnd - gridStart)) * 100}%`;
}

export function currentTimePositionPx(now = new Date(), bodyHeightPx = GRID_BODY_HEIGHT_PX) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const gridStart = CALENDAR_START_HOUR * 60;
  const gridEnd = CALENDAR_END_HOUR * 60;
  if (minutes < gridStart || minutes > gridEnd) return null;
  const ratio = (minutes - gridStart) / (gridEnd - gridStart);
  return ratio * bodyHeightPx;
}

export function formatCurrentTimeLabel(now = new Date()) {
  return now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Compact live clock for the 56px time gutter. */
export function formatGutterLiveTime(now = new Date()) {
  const parts = formatCurrentTimeLabel(now).split(' ');
  return {
    clock: parts[0] || formatCurrentTimeLabel(now),
    period: parts.slice(1).join(' '),
  };
}

export function addMinutes(date, minutes) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function slotFromPointer(day, offsetY, columnHeightPx) {
  const gridSpanMinutes = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60;
  const ratio = Math.max(0, Math.min(1, offsetY / Math.max(columnHeightPx, 1)));
  const rawMinutes = CALENDAR_START_HOUR * 60 + ratio * gridSpanMinutes;
  const snapped = Math.round(rawMinutes / 30) * 30;
  const clamped = Math.max(
    CALENDAR_START_HOUR * 60,
    Math.min(CALENDAR_END_HOUR * 60 - DEFAULT_EVENT_MINUTES, snapped),
  );
  const next = new Date(day);
  next.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
  return next;
}

export function toTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function applyTimeToDate(day, timeValue) {
  const [hours, minutes] = String(timeValue || '09:00').split(':').map(Number);
  const next = new Date(day);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

export function applyDateToDateTime(dateTime, dateValue) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  if (!year || !month || !day) return new Date(dateTime);
  const next = new Date(dateTime);
  next.setFullYear(year, month - 1, day);
  return next;
}

export function scheduleDurationMs(startAt, endAt) {
  return Math.max(
    endAt.getTime() - startAt.getTime(),
    DEFAULT_EVENT_MINUTES * 60000,
  );
}

export function buildDraftScheduleUpdate(draft, startAt, endAt) {
  const day = startOfDay(startAt);
  return {
    ...draft,
    startAt,
    endAt,
    day,
    dayKey: day.toISOString(),
  };
}

export function shiftScheduleByStartDate(startAt, endAt, dateValue) {
  const nextStart = applyDateToDateTime(startAt, dateValue);
  const nextEnd = new Date(nextStart.getTime() + scheduleDurationMs(startAt, endAt));
  return { startAt: nextStart, endAt: nextEnd };
}

export function setScheduleEndDate(startAt, endAt, dateValue) {
  let nextEnd = applyDateToDateTime(endAt, dateValue);
  if (nextEnd <= startAt) {
    nextEnd = addMinutes(startAt, DEFAULT_EVENT_MINUTES);
  }
  return { startAt, endAt: nextEnd };
}

export function setScheduleStartTime(startAt, endAt, timeValue) {
  const nextStart = applyTimeToDate(startAt, timeValue);
  let nextEnd = endAt;
  if (nextEnd <= nextStart) {
    nextEnd = addMinutes(nextStart, DEFAULT_EVENT_MINUTES);
  }
  return { startAt: nextStart, endAt: nextEnd };
}

export function setScheduleEndTime(startAt, endAt, timeValue) {
  let nextEnd = applyTimeToDate(endAt, timeValue);
  if (nextEnd <= startAt) {
    nextEnd = applyTimeToDate(addDays(startAt, 1), timeValue);
    if (nextEnd <= startAt) {
      nextEnd = addMinutes(startAt, DEFAULT_EVENT_MINUTES);
    }
  }
  return { startAt, endAt: nextEnd };
}

export function toAllDaySchedule(date) {
  const dayStart = startOfDay(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 0, 0);
  return { startAt: dayStart, endAt: dayEnd };
}

export function formatTimezoneShort(date = new Date()) {
  try {
    const part = Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(date)
      .find((entry) => entry.type === 'timeZoneName');
    return part?.value || 'Local time';
  } catch {
    return 'Local time';
  }
}

export function formatShortDate(date) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime12Compact(date) {
  return date
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '');
}

export function formatLongDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTimeRange(start, end) {
  const fmt = (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${fmt(start)} – ${fmt(end)}`;
}

export function computeSlotRect(columnEl, startAt, endAt, columnHeightPx = GRID_BODY_HEIGHT_PX) {
  if (!columnEl) return null;
  const rect = columnEl.getBoundingClientRect();
  const durationMinutes = Math.max(
    DEFAULT_EVENT_MINUTES,
    Math.round((endAt.getTime() - startAt.getTime()) / 60000),
  );
  const layout = eventLayout(startAt, durationMinutes);
  if (!layout) return null;

  const topPct = parseFloat(layout.top) / 100;
  const heightPct = parseFloat(layout.height) / 100;
  const slotTop = rect.top + topPct * columnHeightPx;
  const slotHeight = Math.max(heightPct * columnHeightPx, 32);

  return {
    top: slotTop,
    left: rect.left,
    right: rect.right,
    bottom: slotTop + slotHeight,
    width: rect.width,
    height: slotHeight,
    centerY: slotTop + slotHeight / 2,
  };
}

export const QUICK_ADD_POPOVER_WIDTH = 448;
export const QUICK_ADD_POPOVER_GAP = 10;
export const QUICK_ADD_POPOVER_MARGIN = 12;

/** Keep a fixed popover fully inside the viewport. */
export function clampPopoverToViewport({ left, top, width, height, margin = QUICK_ADD_POPOVER_MARGIN } = {}) {
  if (typeof window === 'undefined') {
    return { left, top };
  }

  const maxLeft = window.innerWidth - width - margin;
  const maxTop = window.innerHeight - height - margin;

  return {
    left: Math.min(Math.max(margin, left), Math.max(margin, maxLeft)),
    top: Math.min(Math.max(margin, top), Math.max(margin, maxTop)),
  };
}

/** Place popover to the left of the selected slot (Google Calendar style). */
export function computeQuickAddPopoverPosition(slotRect, {
  width = QUICK_ADD_POPOVER_WIDTH,
  gap = QUICK_ADD_POPOVER_GAP,
  margin = QUICK_ADD_POPOVER_MARGIN,
  maxHeight: maxHeightOverride,
} = {}) {
  if (!slotRect || typeof window === 'undefined') return null;

  const maxHeight = maxHeightOverride ?? window.innerHeight - margin * 2;
  let left = slotRect.left - width - gap;
  let placement = 'left';

  if (left < margin) {
    left = slotRect.right + gap;
    placement = 'right';
  }

  left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);

  let top = slotRect.top - 8;
  top = Math.min(top, window.innerHeight - margin - maxHeight);
  top = Math.max(margin, top);

  return { left, top, width, maxHeight, placement };
}

export function toIsoLocalDateTime(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}:00`;
}
