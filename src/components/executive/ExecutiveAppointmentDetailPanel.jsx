import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Calendar, ExternalLink, X } from 'lucide-react';
import { Spinner, StatusBadge, VisitorTypeBadge } from '../ui';
import { executiveApi } from '../../utils/visitorApi';
import { formatDateTime } from '../../utils/helpers';
import { formatLongDate } from './calendarUtils';
import { getEventCardTheme } from './ExecutiveCalendarEventCard';

const EVENT_LABELS = {
  registered: 'Registered',
  pre_registered: 'Pre-registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  arrived_at_gate: 'Arrived at gate',
  left_premises: 'Left premises',
  pending_approval: 'Pending approval',
};

function formatEventLabel(type) {
  return EVENT_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

function formatEventNotes(evt) {
  if (evt.reason) return evt.reason;
  if (!evt.details) return '—';
  if (typeof evt.details === 'string') {
    try {
      const parsed = JSON.parse(evt.details);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed)
          .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
          .join(' · ');
      }
    } catch {
      return evt.details;
    }
    return evt.details;
  }
  return '—';
}

function InfoField({ label, value, className = '' }) {
  if (!value && value !== 0) return null;
  return (
    <div className={`px-4 py-3 ${className}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-900 break-words">{value}</dd>
    </div>
  );
}

function ActivityStatementTable({ events = [] }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-navy-900">Activity statement</h3>
      <p className="mt-0.5 text-xs text-gray-500">Everything recorded for this appointment.</p>
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">When</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Event</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">By</th>
                <th className="min-w-[140px] px-4 py-2.5 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No activity recorded yet.
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr key={evt.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-gray-600">
                      {formatDateTime(evt.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      {formatEventLabel(evt.event_type)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {evt.actor_name || 'System'}
                    </td>
                    <td className="px-4 py-3 text-xs leading-relaxed text-gray-600">
                      {formatEventNotes(evt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function ExecutiveAppointmentDetailPanel({
  appointment,
  open,
  onClose,
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
    if (!open) return undefined;
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !appointment) return null;

  const visit = data?.visit;
  const events = data?.events || [];
  const theme = getEventCardTheme(appointment.classification, visit?.status || appointment.visit_status);
  const guestName = visit?.full_name || appointment.visitor_name || appointment.title || 'Guest';
  const guestInitial = guestName.trim().charAt(0).toUpperCase() || '?';
  const scheduledAt = appointment.scheduled_at ? new Date(appointment.scheduled_at) : null;
  const scheduledLabel = scheduledAt && !Number.isNaN(scheduledAt.getTime())
    ? `${formatLongDate(scheduledAt)} · ${scheduledAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : '—';

  const resolvedStatus = visit?.status ?? (appointment.visit_id && loading ? null : appointment.visit_status);

  const infoFields = [
    { label: 'When', value: scheduledLabel },
    { label: 'Category', value: visit?.category_name || appointment.category_name || 'Standard visitor' },
    { label: 'Pass code', value: visit?.pass_code },
    { label: 'Phone', value: visit?.phone || appointment.phone },
    { label: 'Email', value: visit?.email },
    { label: 'Company', value: visit?.company || appointment.company },
    {
      label: 'Checked in',
      value: visit?.checked_in_at ? formatDateTime(visit.checked_in_at) : null,
    },
    {
      label: 'Checked out',
      value: visit?.checked_out_at ? formatDateTime(visit.checked_out_at) : null,
    },
  ];

  const purpose = visit?.purpose || appointment.purpose || 'No description provided.';

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close appointment details"
        className="fixed inset-0 z-[64] bg-navy-950/30 backdrop-blur-[1px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="executive-appointment-detail-title"
        className="fixed inset-y-0 right-0 z-[65] flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl animate-executive-detail-panel sm:w-1/2 sm:max-w-[720px]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a73e8]">
              Appointment
            </p>
            <h2 id="executive-appointment-detail-title" className="mt-1 truncate text-xl font-semibold text-gray-900">
              {appointment.title || appointment.visitor_name || 'Appointment details'}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {appointment.visit_id && (
              <Link
                to={`/executive/visitors/${appointment.visit_id}`}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Open full visit page"
                title="Open full page"
              >
                <ExternalLink size={18} />
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading && (
            <div className="flex justify-center py-16">
              <Spinner size={32} />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <div className={`overflow-hidden rounded-xl border ${theme.border} bg-white shadow-sm`}>
                <div className="flex">
                  <span className={`w-1 shrink-0 ${theme.accent}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white ${theme.accent}`}>
                        {guestInitial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold text-gray-900">{guestName}</p>
                        {(visit?.company || appointment.company) && (
                          <p className="mt-0.5 truncate text-sm text-gray-500">
                            {visit?.company || appointment.company}
                          </p>
                        )}
                        <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-700">
                          <Calendar size={14} className="shrink-0 text-gray-400" aria-hidden="true" />
                          {scheduledLabel}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {resolvedStatus && <StatusBadge status={resolvedStatus} />}
                        <VisitorTypeBadge classification={appointment.classification} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <dl className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white sm:grid sm:grid-cols-2">
                {infoFields.map(({ label, value }, index) => (
                  <InfoField
                    key={label}
                    label={label}
                    value={value}
                    className={`border-gray-100 ${index % 2 === 1 ? 'sm:border-l' : ''} ${index >= 2 ? 'border-t sm:border-t' : ''}`}
                  />
                ))}
                <div className="border-t border-gray-100 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Purpose</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-gray-800">{purpose}</dd>
                </div>
              </dl>

              <ActivityStatementTable events={events} />

              {!visit && !appointment.visit_id && (
                <p className="mt-4 text-sm text-gray-500">Limited details are available for this appointment.</p>
              )}
            </>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
