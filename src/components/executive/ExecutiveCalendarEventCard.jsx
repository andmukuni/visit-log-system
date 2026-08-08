import { Clock3, Crown, Users } from 'lucide-react';
import { addMinutes, DEFAULT_EVENT_MINUTES, formatTimeRange24 } from './calendarUtils';

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

function statusMeta(classification, visitStatus, categoryName) {
  const key = String(classification || 'standard').toLowerCase();
  const typeLabel = key === 'vvip' ? 'VVIP' : key === 'vip' ? 'VIP' : (categoryName || 'Internal');

  if (visitStatus === 'pending_approval' || visitStatus === 'pre_registered') {
    return `${typeLabel} • Pending Approval`;
  }
  if (visitStatus === 'checked_in') return `${typeLabel} • On-site`;
  if (visitStatus === 'cancelled') return `${typeLabel} • Cancelled`;
  if (visitStatus === 'checked_out' || visitStatus === 'completed') {
    return `${typeLabel} • Completed`;
  }
  return `${typeLabel} • Confirmed`;
}

export default function ExecutiveCalendarEventCard({
  appointment,
  layout,
  compactHeaders = false,
  onSelect,
}) {
  const theme = getEventCardTheme(appointment.classification, appointment.visit_status);
  const start = layout.date;
  const end = addMinutes(start, DEFAULT_EVENT_MINUTES);
  const timeRange = formatTimeRange24(start, end);
  const heightPct = parseFloat(String(layout.height).replace('%', ''));
  const name = appointment.visitor_name || appointment.title || 'Appointment';
  const metaLine = statusMeta(
    appointment.classification,
    appointment.visit_status,
    appointment.category_name,
  );
  const classification = String(appointment.classification || 'standard').toLowerCase();
  const isPending = appointment.visit_status === 'pending_approval' || appointment.visit_status === 'pre_registered';
  const showDetails = !compactHeaders && heightPct > 7;
  const showIcon = showDetails && (isPending || classification === 'vvip' || classification === 'vip');
  const horizontalInset = compactHeaders ? 'left-0.5 right-0.5' : 'left-1 right-1';

  const topValue = parseFloat(String(layout.top).replace('%', ''));

  return (
    <button
      type="button"
      data-calendar-event
      className={`group absolute z-10 overflow-hidden rounded-md border text-left shadow-sm transition-shadow duration-100 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/35 ${horizontalInset} ${theme.shell}`}
      style={{
        top: `calc(${topValue}% + 2px)`,
        height: `calc(${layout.height} - 4px)`,
        minHeight: showDetails ? '46px' : '20px',
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(appointment);
      }}
      aria-label={`${name}, ${timeRange}, ${metaLine}`}
    >
      <div className="flex h-full min-h-0">
        <span className={`w-1.5 shrink-0 ${theme.accent}`} aria-hidden="true" />
        <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col justify-center py-1 ${showDetails ? 'px-1.5' : 'px-1'} ${showIcon ? 'pr-4' : ''}`}>
          {showDetails && (
            <p className="truncate text-[9px] font-medium leading-none text-gray-500">{timeRange}</p>
          )}
          <p
            className={`font-semibold leading-snug text-gray-900 ${
              showDetails
                ? 'mt-0.5 line-clamp-2 text-[11px]'
                : 'truncate text-[10px] leading-tight'
            }`}
            title={name}
          >
            {name}
          </p>
          {showDetails && (
            <p className={`mt-0.5 truncate text-[9px] font-medium leading-none ${theme.badge}`}>
              {metaLine}
            </p>
          )}

          {showIcon && isPending && (
            <Clock3 size={11} className="absolute right-0 top-0 shrink-0 text-orange-500" aria-hidden="true" />
          )}
          {showIcon && !isPending && classification === 'vvip' && (
            <Crown size={11} className="absolute right-0 top-0 shrink-0 text-amber-600" aria-hidden="true" />
          )}
          {showIcon && !isPending && classification === 'vip' && (
            <Users size={11} className="absolute right-0 bottom-0 shrink-0 text-violet-600" aria-hidden="true" />
          )}
        </div>
      </div>
    </button>
  );
}
