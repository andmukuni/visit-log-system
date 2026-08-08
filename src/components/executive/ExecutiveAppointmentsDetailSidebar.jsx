import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarCheck,
  CircleHelp,
  ClipboardList,
  Edit3,
  Mail,
  MapPin,
  Phone,
  User,
  X,
} from 'lucide-react';
import { Spinner, VisitorTypeBadge } from '../ui';
import { executiveApi } from '../../utils/visitorApi';
import {
  formatAppointmentTimeRange,
  formatDetailDateLabel,
  formatDurationLabel,
  formatPhoneDisplay,
  resolveAppointmentDisplayStatus,
} from './appointmentDisplayUtils';

function DetailRow({ icon: Icon, label, value }) {
  return (
    <>
      <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0 pb-2">
        <p className="text-xs font-medium leading-none text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-semibold leading-snug text-navy-900 break-words">
          {value || '—'}
        </p>
      </div>
    </>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="mt-4 sm:mt-5">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
        {title}
      </h3>
      <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">{children}</div>
    </section>
  );
}

export function ExecutiveAppointmentsDetailActions({
  appointment,
  onReschedule,
  className = '',
}) {
  if (!appointment) return null;

  const { start, end } = formatAppointmentTimeRange(
    appointment.scheduled_at,
    appointment.duration_minutes,
  );

  return (
    <div className={`flex shrink-0 gap-2 px-4 py-2 sm:gap-3 sm:px-5 sm:py-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => onReschedule?.(appointment, { start, end })}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] bg-white px-2.5 py-2 text-xs font-semibold text-[#1a73e8] transition-colors hover:bg-sky-50 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
      >
        <CalendarCheck size={16} aria-hidden="true" />
        Reschedule
      </button>
      {appointment.visit_id ? (
        <Link
          to={`/executive/visitors/${appointment.visit_id}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
        >
          <Edit3 size={16} aria-hidden="true" />
          View / Edit
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900/40 px-2.5 py-2 text-xs font-semibold text-white sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
        >
          <Edit3 size={16} aria-hidden="true" />
          View / Edit
        </button>
      )}
    </div>
  );
}

export default function ExecutiveAppointmentsDetailSidebar({
  appointment,
  onClose,
  onReschedule,
  splitLayout = false,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!appointment?.visit_id) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setData(await executiveApi.getVisit(appointment.visit_id));
    } catch (err) {
      setData(null);
      setError(err?.message || 'Unable to load appointment details.');
    } finally {
      setLoading(false);
    }
  }, [appointment?.visit_id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!appointment) return null;

  const visit = data?.visit;
  const displayStatus = resolveAppointmentDisplayStatus(visit?.status || appointment.visit_status);
  const { range } = formatAppointmentTimeRange(
    appointment.scheduled_at,
    appointment.duration_minutes,
  );
  const durationLabel = formatDurationLabel(appointment.duration_minutes);
  const dateLabel = formatDetailDateLabel(appointment.scheduled_at);
  const title = appointment.title || appointment.visitor_name || 'Appointment';
  const guestName = visit?.full_name || appointment.visitor_name || title;
  const phone = formatPhoneDisplay(visit?.phone || appointment.phone);
  const email = visit?.email || appointment.email;
  const purposeText = appointment.title || visit?.purpose || appointment.purpose;
  const notesText = visit?.purpose && visit.purpose !== purposeText
    ? visit.purpose
    : appointment.purpose && appointment.purpose !== purposeText
      ? appointment.purpose
      : '';
  const hostName = visit?.host_name || appointment.host_name;
  const location = visit?.site_name || appointment.site_name || 'Executive Boardroom';
  const access = 'Main Reception';

  return (
    <aside className="flex min-h-0 w-full flex-col overflow-hidden border-l border-gray-200 bg-white lg:min-w-[280px] lg:max-w-[360px] lg:flex-1">
      <div className="flex shrink-0 items-center justify-between px-4 pb-1.5 pt-3 sm:px-5 sm:pt-3.5">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${displayStatus.bg} ${displayStatus.text}`}>
          {displayStatus.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close details"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
        {loading && (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="flex items-start gap-2.5 pt-0.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 sm:h-10 sm:w-10 sm:rounded-xl">
                <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-xs text-gray-500">{dateLabel}</p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                  <p className="text-xl font-bold leading-none tabular-nums text-navy-900 sm:text-2xl">
                    {range}
                  </p>
                  <p className="text-xs text-gray-400">{durationLabel}</p>
                </div>
              </div>
            </div>

            <h2 className="mt-3 text-lg font-bold leading-tight text-navy-900 sm:mt-4 sm:text-xl">
              {title}
            </h2>
            <div className="mt-2.5">
              <VisitorTypeBadge classification={appointment.classification} />
            </div>

            <DetailSection title="Visitor Details">
              <DetailRow icon={User} label="Name" value={guestName} />
              <DetailRow icon={Phone} label="Phone" value={phone} />
              <DetailRow icon={Mail} label="Email" value={email} />
            </DetailSection>

            <DetailSection title="Appointment Details">
              <DetailRow icon={ClipboardList} label="Purpose" value={purposeText} />
              <DetailRow icon={User} label="Host" value={hostName} />
              <DetailRow icon={MapPin} label="Location" value={location} />
              <DetailRow icon={BadgeCheck} label="Access" value={access} />
              <DetailRow icon={CircleHelp} label="Notes" value={notesText} />
            </DetailSection>
          </>
        )}
      </div>

      <ExecutiveAppointmentsDetailActions
        appointment={appointment}
        onReschedule={onReschedule}
        className={`border-t border-gray-200 ${splitLayout ? 'lg:hidden' : ''}`}
      />
    </aside>
  );
}
