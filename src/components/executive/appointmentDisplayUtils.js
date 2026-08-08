import { addMinutes, DEFAULT_EVENT_MINUTES } from './calendarUtils';

const DISPLAY_STATUS = {
  confirmed: {
    label: 'Confirmed',
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    ring: '',
  },
  pending: {
    label: 'Pending Approval',
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    ring: '',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    ring: '',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-red-100',
    text: 'text-red-700',
    ring: '',
  },
};

export function resolveAppointmentDisplayStatus(visitStatus) {
  const status = String(visitStatus || '').toLowerCase();
  if (['pending_approval', 'pre_registered'].includes(status)) return DISPLAY_STATUS.pending;
  if (['cancelled', 'rejected'].includes(status)) return DISPLAY_STATUS.cancelled;
  if (['completed', 'checked_out'].includes(status)) return DISPLAY_STATUS.completed;
  return DISPLAY_STATUS.confirmed;
}

const TYPE_STYLES = {
  standard: { label: 'Standard', dot: 'bg-[#3b82f6]' },
  vip: { label: 'VIP', dot: 'bg-violet-500' },
  vvip: { label: 'VVIP', dot: 'bg-amber-500' },
};

export function resolveVisitorType(classification) {
  const key = String(classification || 'standard').toLowerCase();
  const style = TYPE_STYLES[key] || TYPE_STYLES.standard;
  return {
    ...style,
    label: style.label,
    isVvip: key === 'vvip',
    isVip: key === 'vip',
  };
}

function padTime(value) {
  return String(value).padStart(2, '0');
}

export function formatAppointmentTimeRange(scheduledAt, durationMinutes = DEFAULT_EVENT_MINUTES) {
  const start = new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return { range: '—', dayLabel: '—' };

  const end = addMinutes(start, durationMinutes);
  const range = `${padTime(start.getHours())}:${padTime(start.getMinutes())} – ${padTime(end.getHours())}:${padTime(end.getMinutes())}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(start);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  let dayLabel;
  if (diffDays === 0) dayLabel = 'Today';
  else if (diffDays === 1) dayLabel = 'Tomorrow';
  else if (diffDays === -1) dayLabel = 'Yesterday';
  else {
    dayLabel = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return { range, dayLabel, start, end };
}

export function formatDurationLabel(minutes) {
  const value = Number(minutes) || DEFAULT_EVENT_MINUTES;
  if (value < 60) return `(${value} min)`;
  if (value % 60 === 0) {
    const hours = value / 60;
    return `(${hours} hour${hours === 1 ? '' : 's'})`;
  }
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return `(${hours}h ${mins}m)`;
}

export function formatDetailDateLabel(scheduledAt) {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return '—';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  const day = date.getDate();
  const month = date.toLocaleDateString(undefined, { month: 'long' });
  const year = date.getFullYear();
  const formatted = `${day} ${month} ${year}`;

  if (diffDays === 0) return `Today, ${formatted}`;
  if (diffDays === 1) return `Tomorrow, ${formatted}`;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function resolveCategoryTag(classification) {
  const key = String(classification || 'standard').toLowerCase();
  if (key === 'vvip') return { label: 'VVIP Visitor', className: 'bg-amber-50 text-amber-800' };
  if (key === 'vip') return { label: 'VIP Visitor', className: 'bg-violet-50 text-violet-800' };
  return {
    label: 'Standard Visitor',
    className: 'bg-sky-50 text-sky-700',
  };
}

export function formatPhoneDisplay(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('260') && digits.length >= 12) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

export function resolvePurposeDisplay(row = {}) {
  const category = row.category_name?.trim();
  const purpose = row.purpose?.trim();
  const title = row.title?.trim();
  const company = row.company?.trim();

  if (category) {
    return {
      title: category,
      subtitle: purpose || title || company || '',
    };
  }

  if (title && purpose && title !== purpose) {
    return { title, subtitle: purpose };
  }

  if (title?.includes(' - ')) {
    const [head, ...rest] = title.split(' - ');
    return { title: head.trim(), subtitle: rest.join(' - ').trim() };
  }

  return {
    title: title || purpose || 'Appointment',
    subtitle: company || '',
  };
}
