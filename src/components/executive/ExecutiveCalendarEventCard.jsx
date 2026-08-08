import { Clock3, Crown, Users } from 'lucide-react';
import { addMinutes, DEFAULT_EVENT_MINUTES, formatTimeRange24 } from './calendarUtils';

const CARD_THEMES = {
  vvip: {
    shell: 'bg-amber-50/90 border-amber-200/80 hover:bg-amber-50',
    accent: 'bg-amber-500',
    border: 'border-amber-200/90',
    meta: 'text-amber-700',
    badge: 'text-amber-700',
  },
  vip: {
    shell: 'bg-violet-50/90 border-violet-200/80 hover:bg-violet-50',
    accent: 'bg-violet-500',
    border: 'border-violet-200/90',
    meta: 'text-violet-700',
    badge: 'text-violet-700',
  },
  pending: {
    shell: 'bg-orange-50/90 border-orange-200/80 hover:bg-orange-50',
    accent: 'bg-orange-500',
    border: 'border-orange-200/90',
    meta: 'text-orange-600',
    badge: 'text-orange-600',
  },
  standard: {
    shell: 'bg-sky-50/90 border-sky-200/80 hover:bg-sky-50',
    accent: 'bg-[#3b82f6]',
    border: 'border-sky-200/90',
    meta: 'text-sky-700',
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
    return { line: `${typeLabel} • Pending Approval`, tone: 'pending' };
  }
  if (visitStatus === 'checked_in') {
    return { line: `${typeLabel} • On-site`, tone: 'confirmed' };
  }
  if (visitStatus === 'cancelled') {
    return { line: `${typeLabel} • Cancelled`, tone: 'cancelled' };
  }
  if (visitStatus === 'checked_out' || visitStatus === 'completed') {
    return { line: `${typeLabel} • Completed`, tone: 'completed' };
  }
  return { line: `${typeLabel} • Confirmed`, tone: 'confirmed' };
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
  const meta = statusMeta(
    appointment.classification,
    appointment.visit_status,
    appointment.category_name,
  );
  const classification = String(appointment.classification || 'standard').toLowerCase();
  const isPending = appointment.visit_status === 'pending_approval' || appointment.visit_status === 'pre_registered';
  const showDetails = !compactHeaders && heightPct > 8;
  const horizontalInset = compactHeaders ? 'inset-x-0.5' : 'inset-x-1.5';

  return (
    <button
      type="button"
      data-calendar-event
      className={`group absolute z-10 block w-full overflow-hidden rounded-lg border text-left shadow-sm transition-shadow duration-100 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/35 ${horizontalInset} ${theme.shell}`}
      style={{ top: layout.top, height: layout.height, minHeight: '28px' }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(appointment);
      }}
      aria-label={`${name}, ${timeRange}, ${meta.line}`}
    >
      <div className="relative flex h-full min-h-[28px]">
        <span className={`w-1 shrink-0 ${theme.accent}`} aria-hidden="true" />
        <div className={`min-w-0 flex-1 ${showDetails ? 'px-2 py-1.5' : 'px-1.5 py-1'}`}>
          {showDetails && (
            <p className="truncate text-[10px] font-medium leading-none text-gray-500">{timeRange}</p>
          )}
          <p className={`truncate font-semibold leading-tight text-gray-900 ${showDetails ? 'mt-1 text-xs' : 'text-[10px]'}`}>
            {name}
          </p>
          {showDetails && (
            <p className={`mt-1 truncate text-[10px] font-medium leading-none ${theme.badge}`}>
              {meta.line}
            </p>
          )}
        </div>

        {showDetails && isPending && (
          <Clock3 size={12} className="absolute right-1.5 top-1.5 shrink-0 text-orange-500" aria-hidden="true" />
        )}
        {showDetails && !isPending && classification === 'vvip' && (
          <Crown size={12} className="absolute right-1.5 top-1.5 shrink-0 text-amber-600" aria-hidden="true" />
        )}
        {showDetails && !isPending && classification === 'vip' && (
          <Users size={12} className="absolute bottom-1.5 right-1.5 shrink-0 text-violet-600" aria-hidden="true" />
        )}
      </div>
    </button>
  );
}
