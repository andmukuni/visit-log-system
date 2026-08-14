import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  formatTimePickerLabel,
  parseTimeInputValue,
  TIME_PICKER_STEP_MINUTES,
  toTimeInputFromParts,
} from './calendarUtils';

const ITEM_HEIGHT = 36;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PICKER_PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
/** Commit only once the wheel has come to rest, never mid-gesture. */
const SETTLE_MS = 110;
const SMOOTH_SCROLL_MS = 360;
const INSTANT_SCROLL_MS = 60;

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from(
  { length: 60 / TIME_PICKER_STEP_MINUTES },
  (_, index) => index * TIME_PICKER_STEP_MINUTES,
);
const PERIODS = ['AM', 'PM'];

const clampIndex = (index, length) => Math.max(0, Math.min(length - 1, index));

function ScrollTimeColumn({ items, value, onChange, formatItem = (item) => item, ariaLabel }) {
  const listRef = useRef(null);
  const settleTimerRef = useRef(null);
  const programmaticTimerRef = useRef(null);
  const isProgrammaticRef = useRef(false);
  const targetIndexRef = useRef(-1);
  const optionIdPrefix = useId();

  const selectedIndex = items.indexOf(value);

  const scrollToIndex = useCallback((index, behavior = 'auto') => {
    const el = listRef.current;
    if (!el || index < 0) return;

    isProgrammaticRef.current = true;
    targetIndexRef.current = index;
    el.scrollTo({ top: index * ITEM_HEIGHT, behavior });

    // Hold the guard for the whole animation. Releasing it early let the
    // browser's own scroll events read half-finished positions and commit them.
    window.clearTimeout(programmaticTimerRef.current);
    programmaticTimerRef.current = window.setTimeout(
      () => {
        isProgrammaticRef.current = false;
      },
      behavior === 'smooth' ? SMOOTH_SCROLL_MS : INSTANT_SCROLL_MS,
    );
  }, []);

  // Re-centre only when the wheel is actually off its selected row; recentring
  // unconditionally landed mid-gesture and yanked the user's scroll back.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || selectedIndex < 0) return;
    if (targetIndexRef.current === selectedIndex) return;
    if (Math.round(el.scrollTop / ITEM_HEIGHT) === selectedIndex) return;
    scrollToIndex(selectedIndex);
  }, [scrollToIndex, selectedIndex]);

  useEffect(() => () => {
    window.clearTimeout(settleTimerRef.current);
    window.clearTimeout(programmaticTimerRef.current);
  }, []);

  const handleScroll = () => {
    if (isProgrammaticRef.current) return;

    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const el = listRef.current;
      if (!el) return;

      const index = clampIndex(Math.round(el.scrollTop / ITEM_HEIGHT), items.length);
      const nextValue = items[index];

      if (nextValue === value) {
        scrollToIndex(index);
        return;
      }
      onChange(nextValue);
    }, SETTLE_MS);
  };

  const selectIndex = (index) => {
    const nextIndex = clampIndex(index, items.length);
    scrollToIndex(nextIndex, 'smooth');
    const nextValue = items[nextIndex];
    if (nextValue !== value) onChange(nextValue);
  };

  const handleKeyDown = (event) => {
    const base = selectedIndex < 0 ? 0 : selectedIndex;
    const moves = {
      ArrowDown: base + 1,
      ArrowUp: base - 1,
      PageDown: base + VISIBLE_ROWS,
      PageUp: base - VISIBLE_ROWS,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    selectIndex(moves[event.key]);
  };

  return (
    <div className="relative min-w-[3.25rem] flex-1">
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-activedescendant={selectedIndex >= 0 ? `${optionIdPrefix}-${selectedIndex}` : undefined}
        className="scrollbar-hide snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40"
        style={{ height: `${PICKER_HEIGHT}px` }}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
      >
        <div style={{ paddingTop: PICKER_PAD, paddingBottom: PICKER_PAD }}>
          {items.map((item, index) => {
            const selected = item === value;
            return (
              <button
                key={String(item)}
                id={`${optionIdPrefix}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                onClick={() => selectIndex(index)}
                className={`flex h-9 w-full snap-center items-center justify-center text-sm tabular-nums transition-colors ${
                  selected
                    ? 'font-semibold text-[#1a73e8]'
                    : 'font-medium text-gray-500 hover:text-gray-800'
                }`}
              >
                {formatItem(item)}
              </button>
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
