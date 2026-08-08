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
import { Spinner } from '../ui';
import { executiveApi } from '../../utils/visitorApi';
import {
  formatAppointmentTimeRange,
  formatDetailDateLabel,
  formatDurationLabel,
  formatPhoneDisplay,
  resolveAppointmentDisplayStatus,
  resolveCategoryTag,
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
    <section className="mt-7">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">
        {title}
      </h3>
      <div className="mt-2 grid grid-cols-[16px_1fr] gap-x-3">{children}</div>
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
    <div className={`flex shrink-0 gap-3 px-5 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => onReschedule?.(appointment, { start, end })}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#1a73e8] bg-white px-3 py-2.5 text-sm font-semibold text-[#1a73e8] transition-colors hover:bg-sky-50"
      >
        <CalendarCheck size={16} aria-hidden="true" />
        Reschedule
      </button>
      {appointment.visit_id ? (
        <Link
          to={`/executive/visitors/${appointment.visit_id}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-navy-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
        >
          <Edit3 size={16} aria-hidden="true" />
          View / Edit
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-navy-900/40 px-3 py-2.5 text-sm font-semibold text-white"
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
  const categoryTag = resolveCategoryTag(appointment.classification);
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
    <aside className="flex min-h-0 w-full flex-col border-l border-gray-200 bg-white lg:min-w-[320px] lg:max-w-[400px] lg:flex-1">
      <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
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

      <div className="overflow-y-auto px-5 pb-5">
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
            <div className="flex items-start gap-3 pt-1">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <CalendarCheck size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm text-gray-500">{dateLabel}</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <p className="text-[1.75rem] font-bold leading-none tabular-nums text-navy-900">
                    {range}
                  </p>
                  <p className="text-sm text-gray-400">{durationLabel}</p>
                </div>
              </div>
            </div>

            <h2 className="mt-5 text-[1.35rem] font-bold leading-tight text-navy-900">
              {title}
            </h2>
            <span className={`mt-2.5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${categoryTag.className}`}>
              {categoryTag.label}
            </span>

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
