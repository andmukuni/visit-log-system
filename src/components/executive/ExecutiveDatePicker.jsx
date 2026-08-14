import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  addMonths,
  formatShortDate,
  getMonthGrid,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  toDateInputValue,
} from './calendarUtils';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseDateInputValue(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function DatePanel({
  value,
  min,
  onChange,
  onClose,
}) {
  const selected = parseDateInputValue(value) || startOfDay(new Date());
  const minDate = parseDateInputValue(min);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected));

  useEffect(() => {
    const nextSelected = parseDateInputValue(value);
    if (nextSelected) setViewMonth(startOfMonth(nextSelected));
  }, [value]);

  const days = useMemo(() => getMonthGrid(viewMonth), [viewMonth]);
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const isDisabled = (day) => (
    minDate ? startOfDay(day).getTime() < minDate.getTime() : false
  );

  const pick = (day) => {
    if (isDisabled(day)) return;
    onChange?.(toDateInputValue(day));
    onClose?.();
  };

  const quickPick = (day) => {
    if (isDisabled(day)) return;
    setViewMonth(startOfMonth(day));
    pick(day);
  };

  return (
    <div
      className="w-[19.5rem] overflow-hidden rounded-2xl border border-navy-200 bg-white shadow-xl shadow-navy-950/15"
      role="dialog"
      aria-label="Choose date"
    >
      <div className="flex items-center justify-between gap-2 border-b border-navy-100 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-semibold text-navy-900">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex gap-2 px-3 pt-3">
        <button
          type="button"
          onClick={() => quickPick(today)}
          disabled={isDisabled(today)}
          className="flex-1 rounded-lg border border-navy-200 bg-navy-50 px-2 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => quickPick(tomorrow)}
          disabled={isDisabled(tomorrow)}
          className="flex-1 rounded-lg border border-navy-200 bg-navy-50 px-2 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Tomorrow
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-3 pt-3 text-center">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-3 pb-3">
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const selectedDay = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          const disabled = isDisabled(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => pick(day)}
              className={`flex h-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                selectedDay
                  ? 'bg-cyan-600 text-white shadow-sm hover:bg-cyan-700'
                  : isToday
                    ? 'bg-cyan-50 text-cyan-800 ring-1 ring-inset ring-cyan-300 hover:bg-cyan-100'
                    : inMonth
                      ? 'text-navy-800 hover:bg-navy-50'
                      : 'text-navy-300 hover:bg-navy-50 hover:text-navy-500'
              } ${disabled ? 'cursor-not-allowed opacity-35 hover:bg-transparent' : ''}`}
              aria-label={formatShortDate(day)}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={selectedDay}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateTriggerButton({
  label,
  isOpen = false,
  onClick,
  ariaLabel = 'Select date',
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-800 shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50 ${
        isOpen ? 'border-cyan-400 ring-2 ring-cyan-500/20' : ''
      } ${className}`}
    >
      <span>{label}</span>
      <ChevronDown
        size={14}
        className={`shrink-0 text-navy-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

export default function ExecutiveDatePicker({
  value,
  min,
  onChange,
  isOpen = false,
  onOpenChange,
  label,
  ariaLabel = 'Select date',
  triggerClassName = '',
}) {
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, openUp: false });

  const displayLabel = label || (parseDateInputValue(value)
    ? formatShortDate(parseDateInputValue(value))
    : 'Pick date');

  useLayoutEffect(() => {
    if (!isOpen || !rootRef.current) return undefined;

    const updatePosition = () => {
      const rect = rootRef.current.getBoundingClientRect();
      const panelWidth = 312;
      const panelHeight = 340;
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const openUp = spaceBelow < panelHeight && rect.top > spaceBelow;
      const left = Math.min(
        Math.max(12, rect.left),
        window.innerWidth - panelWidth - 12,
      );
      const top = openUp
        ? Math.max(12, rect.top - panelHeight - gap)
        : rect.bottom + gap;

      setPosition({ top, left, openUp });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      onOpenChange?.(false);
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange?.(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <DateTriggerButton
        label={displayLabel}
        isOpen={isOpen}
        onClick={() => onOpenChange?.(!isOpen)}
        ariaLabel={ariaLabel}
        className={triggerClassName}
      />

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[80] animate-in fade-in zoom-in-95 duration-150"
          style={{ top: position.top, left: position.left }}
        >
          <DatePanel
            value={value}
            min={min}
            onChange={onChange}
            onClose={() => onOpenChange?.(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
