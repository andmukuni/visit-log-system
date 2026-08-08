import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  formatTimePickerLabel,
  parseTimeInputValue,
  toTimeInputFromParts,
} from './calendarUtils';

const ITEM_HEIGHT = 36;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PICKER_PAD = ITEM_HEIGHT * 2;

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = [0, 30];
const PERIODS = ['AM', 'PM'];

function ScrollTimeColumn({ items, value, onChange, formatItem = (item) => item, ariaLabel }) {
  const listRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);

  const scrollToValue = useCallback((nextValue, behavior = 'auto') => {
    const el = listRef.current;
    if (!el) return;
    const index = items.indexOf(nextValue);
    if (index < 0) return;
    isProgrammaticScrollRef.current = true;
    el.scrollTo({ top: index * ITEM_HEIGHT, behavior });
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, behavior === 'smooth' ? 220 : 0);
  }, [items]);

  useLayoutEffect(() => {
    scrollToValue(value);
  }, [scrollToValue, value]);

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      const index = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
      const nextValue = items[index];
      if (nextValue !== value) onChange(nextValue);
    });
  };

  useEffect(() => () => {
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  return (
    <div className="relative min-w-[3.25rem] flex-1">
      <div
        ref={listRef}
        role="listbox"
        aria-label={ariaLabel}
        className="scrollbar-hide snap-y snap-mandatory overflow-y-auto scroll-smooth"
        style={{ height: `${PICKER_HEIGHT}px` }}
        onScroll={handleScroll}
      >
        <div style={{ paddingTop: PICKER_PAD, paddingBottom: PICKER_PAD }}>
          {items.map((item) => {
            const selected = item === value;
            return (
              <div
                key={String(item)}
                role="option"
                aria-selected={selected}
                className={`flex h-9 snap-center items-center justify-center text-sm transition-colors ${
                  selected ? 'font-semibold text-[#1a73e8]' : 'font-medium text-gray-500'
                }`}
              >
                {formatItem(item)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ScrollTimePanel({ value, onChange, ariaLabel = 'Select time' }) {
  const parts = parseTimeInputValue(value);

  const updatePart = (patch) => {
    onChange?.(toTimeInputFromParts({ ...parts, ...patch }));
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 border-y border-[#1a73e8]/15 bg-[#1a73e8]/5" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-white to-transparent" />

      <div className="relative z-0 flex px-2 py-2">
        <ScrollTimeColumn
          items={HOURS}
          value={parts.hour12}
          onChange={(hour12) => updatePart({ hour12 })}
          ariaLabel={`${ariaLabel} hour`}
        />
        <ScrollTimeColumn
          items={MINUTES}
          value={parts.minute}
          onChange={(minute) => updatePart({ minute })}
          formatItem={(minute) => String(minute).padStart(2, '0')}
          ariaLabel={`${ariaLabel} minute`}
        />
        <ScrollTimeColumn
          items={PERIODS}
          value={parts.period}
          onChange={(period) => updatePart({ period })}
          ariaLabel={`${ariaLabel} period`}
        />
      </div>
    </div>
  );
}

export function TimeTriggerButton({
  value,
  isOpen = false,
  onClick,
  ariaLabel = 'Select time',
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      className={`inline-flex min-w-[5.5rem] items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium tabular-nums transition-colors ${
        isOpen
          ? 'bg-[#e8f0fe] text-[#1a73e8] ring-2 ring-[#1a73e8]/20'
          : 'bg-white text-gray-800 shadow-sm hover:bg-gray-50'
      } ${className}`}
    >
      <span>{formatTimePickerLabel(value)}</span>
      <ChevronDown
        size={14}
        className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

export default function ExecutiveScrollTimePicker({
  value,
  onChange,
  isOpen = false,
  onOpenChange,
  ariaLabel = 'Select time',
}) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      onOpenChange?.(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      <TimeTriggerButton
        value={value}
        isOpen={isOpen}
        onClick={() => onOpenChange?.(!isOpen)}
        ariaLabel={ariaLabel}
      />

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 min-w-[12rem] animate-in fade-in slide-in-from-top-1 duration-150">
          <ScrollTimePanel value={value} onChange={onChange} ariaLabel={ariaLabel} />
        </div>
      )}
    </div>
  );
}
