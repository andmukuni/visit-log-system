import { Clock3 } from 'lucide-react';
import { VisitorTypeBadge } from '../ui';
import { addMinutes, DEFAULT_EVENT_MINUTES, formatClockTime, formatTimeRange24 } from './calendarUtils';

const CARD_THEMES = {
  vvip: {
    shell: 'bg-amber-50/95 border-amber-200/80 hover:bg-amber-50',
    accent: 'bg-amber-500',
    border: 'border-amber-200/90',
    badge: 'text-amber-700',
  },
  vip: {
    shell: 'bg-violet-50/95 border-violet-200/80 hover:bg-violet-50',
    accent: 'bg-violet-500',
    border: 'border-violet-200/90',
    badge: 'text-violet-700',
  },
  pending: {
    shell: 'bg-orange-50/95 border-orange-200/80 hover:bg-orange-50',
    accent: 'bg-orange-500',
    border: 'border-orange-200/90',
    badge: 'text-orange-600',
  },
  standard: {
    shell: 'bg-sky-50/95 border-sky-200/80 hover:bg-sky-50',
    accent: 'bg-[#3b82f6]',
    border: 'border-sky-200/90',
    badge: 'text-sky-700',
  },
};

export function getEventCardTheme(classification, visitStatus) {
  if (visitStatus === 'pending_approval' || visitStatus === 'pre_registered') {
    return CARD_THEMES.pending;
  }
  const key = String(classification || 'standard').toLowerCase();
  if (key === 'vvip') return CARD_THEMES.vvip;
  if (key === 'vip') return CARD_THEMES.vip;
  return CARD_THEMES.standard;
}

const CARD_DENSITY = {
  normal: {
    time: 'text-[8px] leading-none',
    name: 'text-[10px] leading-tight',
    pad: 'px-0.5 py-px',
    accent: 'w-0.5',
    minHeight: 36,
    nameClamp: 'line-clamp-1',
    nameWeight: 'font-semibold',
  },
  compact: {
    time: 'text-[7px] leading-none',
    name: 'text-[9px] leading-none',
    pad: 'px-0.5 py-0',
    accent: 'w-px',
    minHeight: 32,
    nameClamp: 'truncate',
    nameWeight: 'font-medium',
  },
  ultra: {
    time: 'text-[7px] leading-none',
    name: 'text-[8px] leading-none',
    pad: 'px-0.5 py-0',
    accent: 'w-px',
    minHeight: 16,
    nameClamp: 'truncate',
    nameWeight: 'font-medium',
  },
};

function cardDensity(overlapColumnCount, compactHeaders) {
  if (overlapColumnCount >= 3) return CARD_DENSITY.ultra;
  if (overlapColumnCount >= 2 || compactHeaders) return CARD_DENSITY.compact;
  return CARD_DENSITY.normal;
}

export default function ExecutiveCalendarEventCard({
  appointment,
  layout,
  compactHeaders = false,
  overlapColumnCount = 1,
  onSelect,
}) {
  const theme = getEventCardTheme(appointment.classification, appointment.visit_status);
  const start = layout.date;
  const end = addMinutes(start, DEFAULT_EVENT_MINUTES);
  const timeRange = formatTimeRange24(start, end);
  const shortTime = formatClockTime(start);
  const heightPct = parseFloat(String(layout.height).replace('%', ''));
  const name = appointment.visitor_name || appointment.title || 'Appointment';
  const classification = String(appointment.classification || 'standard').toLowerCase();
  const isPending = appointment.visit_status === 'pending_approval' || appointment.visit_status === 'pre_registered';
  const density = cardDensity(overlapColumnCount, compactHeaders);
  const isUltra = overlapColumnCount >= 3;
  const showTime = !isUltra && (overlapColumnCount >= 2 ? heightPct > 3 : heightPct > 2);
  const useInlineTypeBadge = isUltra;

  const topValue = parseFloat(String(layout.top).replace('%', ''));
  const leftValue = layout.left != null ? parseFloat(String(layout.left).replace('%', '')) : null;
  const widthValue = layout.width != null ? parseFloat(String(layout.width).replace('%', '')) : null;
  const inset = overlapColumnCount > 1 ? 0 : 1;
  const displayTime = overlapColumnCount >= 2 ? shortTime : timeRange;
  const typeLabel = classification === 'vvip' ? 'VVIP' : classification === 'vip' ? 'VIP' : 'Standard';
  const statusSuffix = isPending ? ', pending approval' : '';

  return (
    <button
      type="button"
      data-calendar-event
      className={`group absolute z-10 overflow-hidden rounded-[3px] border-[0.5px] text-left shadow-none transition-shadow duration-100 hover:z-20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1a73e8]/35 ${theme.shell}`}
      style={{
        top: `calc(${topValue}% + ${inset}px)`,
        height: `calc(${layout.height} - ${inset * 2}px)`,
        minHeight: `${density.minHeight}px`,
        ...(leftValue != null && widthValue != null
          ? {
            left: `calc(${leftValue}% + ${inset}px)`,
            width: `calc(${widthValue}% - ${inset * 2}px)`,
          }
          : {
            left: `${inset * 2}px`,
            right: `${inset * 2}px`,
          }),
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(appointment);
      }}
      aria-label={`${name}, ${timeRange}, ${typeLabel}${statusSuffix}`}
    >
      <div className="flex h-full min-h-0">
        <span className={`shrink-0 ${density.accent} ${theme.accent}`} aria-hidden="true" />
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-px ${density.pad}`}>
          {showTime && (
            <p className={`truncate font-medium text-gray-500 ${density.time}`}>{displayTime}</p>
          )}

          <div className={`flex min-w-0 ${useInlineTypeBadge ? 'items-start gap-0.5' : 'flex-col gap-px'}`}>
            <div className="flex min-w-0 flex-1 items-start gap-0.5">
              <p
                className={`min-w-0 flex-1 text-gray-900 ${density.nameWeight} ${density.name} ${density.nameClamp}`}
                title={name}
              >
                {name}
              </p>
              {isPending && useInlineTypeBadge && (
                <Clock3 size={8} className="mt-px shrink-0 text-orange-500" aria-hidden="true" />
              )}
              {useInlineTypeBadge && (
                <VisitorTypeBadge
                  classification={classification}
                  size="xs"
                  iconOnly
                  className="mt-px shrink-0"
                />
              )}
            </div>

            {!useInlineTypeBadge && (
              <VisitorTypeBadge
                classification={classification}
                size="xs"
                className="w-fit max-w-full"
              />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
