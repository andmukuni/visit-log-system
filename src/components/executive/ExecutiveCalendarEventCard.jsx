const CARD_THEMES = {
  vvip: {
    fill: 'bg-amber-100 border-amber-300/90 text-amber-950 hover:bg-amber-200/70',
    meta: 'text-amber-800/75',
    accent: 'bg-amber-500',
    border: 'border-amber-200/90',
  },
  vip: {
    fill: 'bg-violet-100 border-violet-300/90 text-violet-950 hover:bg-violet-200/70',
    meta: 'text-violet-800/75',
    accent: 'bg-violet-500',
    border: 'border-violet-200/90',
  },
  pending: {
    fill: 'bg-orange-50 border-orange-300/90 text-orange-950 hover:bg-orange-100/80',
    meta: 'text-orange-800/75',
    accent: 'bg-orange-500',
    border: 'border-orange-200/90',
  },
  standard: {
    fill: 'bg-navy-100 border-navy-300/90 text-navy-950 hover:bg-navy-200/70',
    meta: 'text-navy-700/80',
    accent: 'bg-[#1a73e8]',
    border: 'border-navy-200/90',
  },
};

export function getEventCardTheme(classification, visitStatus) {
  const key = String(classification || 'standard').toLowerCase();
  if (key === 'vvip') return CARD_THEMES.vvip;
  if (key === 'vip') return CARD_THEMES.vip;
  if (visitStatus === 'pending_approval' || visitStatus === 'pre_registered') {
    return CARD_THEMES.pending;
  }
  return CARD_THEMES.standard;
}

export default function ExecutiveCalendarEventCard({
  appointment,
  layout,
  compactHeaders = false,
  onSelect,
}) {
  const theme = getEventCardTheme(appointment.classification, appointment.visit_status);
  const time = layout.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const heightPct = parseFloat(String(layout.height).replace('%', ''));
  const name = appointment.visitor_name || appointment.title || 'Appointment';
  const company = appointment.company?.trim();

  const showMeta = !compactHeaders && heightPct > 6.5;
  const horizontalInset = compactHeaders ? 'inset-x-0.5' : 'inset-x-1';

  return (
    <button
      type="button"
      data-calendar-event
      className={`absolute z-10 block w-full overflow-hidden rounded-md border px-1.5 py-px text-left shadow-sm transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/35 ${horizontalInset} ${theme.fill}`}
      style={{ top: layout.top, height: layout.height, minHeight: '18px' }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(appointment);
      }}
      aria-label={`${name}, ${time}${company ? `, ${company}` : ''}`}
    >
      <p className={`truncate font-semibold leading-[1.15] ${compactHeaders ? 'text-[9px]' : 'text-[11px]'}`}>
        {name}
      </p>
      {showMeta && (
        <p className={`mt-px truncate leading-[1.1] ${compactHeaders ? 'text-[8px]' : 'text-[10px]'} ${theme.meta}`}>
          {time}{company ? ` · ${company}` : ''}
        </p>
      )}
    </button>
  );
}
