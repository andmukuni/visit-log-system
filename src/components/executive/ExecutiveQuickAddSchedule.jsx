import { useEffect, useRef } from 'react';
import { formatLongDate, toTimeInputValue } from './calendarUtils';
import { ScrollTimePanel, TimeTriggerButton } from './ExecutiveScrollTimePicker';

export default function ExecutiveQuickAddSchedule({
  startAt,
  endAt,
  allDay = false,
  activeTimePicker = null,
  onActiveTimePickerChange,
  onStartTimeChange,
  onEndTimeChange,
  repeatLabel = 'Does not repeat',
}) {
  const rootRef = useRef(null);
  const startTime = toTimeInputValue(startAt);
  const endTime = toTimeInputValue(endAt);
  const activeValue = activeTimePicker === 'end' ? endTime : startTime;
  const activeLabel = activeTimePicker === 'end' ? 'End time' : 'Start time';
  const activeOnChange = activeTimePicker === 'end' ? onEndTimeChange : onStartTimeChange;

  useEffect(() => {
    if (!activeTimePicker) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      onActiveTimePickerChange?.(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [activeTimePicker, onActiveTimePickerChange]);

  return (
    <div ref={rootRef} className="relative overflow-hidden rounded-xl bg-[#f1f3f4] px-4 py-3.5">
      <p className="text-[15px] font-semibold leading-snug text-gray-900">
        {formatLongDate(startAt)}
      </p>

      {!allDay ? (
        <>
          <div className="mt-3 flex items-center justify-center gap-2.5">
            <TimeTriggerButton
              value={startTime}
              isOpen={activeTimePicker === 'start'}
              onClick={() => onActiveTimePickerChange?.(activeTimePicker === 'start' ? null : 'start')}
              ariaLabel="Start time"
            />
            <span className="text-sm font-medium text-gray-400">–</span>
            <TimeTriggerButton
              value={endTime}
              isOpen={activeTimePicker === 'end'}
              onClick={() => onActiveTimePickerChange?.(activeTimePicker === 'end' ? null : 'end')}
              ariaLabel="End time"
            />
          </div>

          {activeTimePicker && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {activeLabel}
              </p>
              <ScrollTimePanel
                value={activeValue}
                onChange={activeOnChange}
                ariaLabel={activeLabel}
              />
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm font-medium text-gray-600">All day</p>
      )}

      <div className="mt-3 border-t border-gray-200/80 pt-2.5">
        <p className="text-xs text-gray-500">{repeatLabel}</p>
      </div>
    </div>
  );
}
