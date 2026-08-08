import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Calendar, Clock, ExternalLink, Mail, Phone, User, X } from 'lucide-react';
import { Spinner, StatusBadge } from '../ui';
import { executiveApi } from '../../utils/visitorApi';
import { formatDateTime } from '../../utils/helpers';
import { formatLongDate } from './calendarUtils';

const EVENT_LABELS = {
  registered: 'Registered',
  pre_registered: 'Pre-registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
};

function DetailRow({ label, value, icon: Icon }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      {Icon && <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="mt-0.5 text-sm text-gray-900 break-words">{value}</p>
      </div>
    </div>
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
  const scheduledAt = appointment.scheduled_at ? new Date(appointment.scheduled_at) : null;
  const scheduledLabel = scheduledAt && !Number.isNaN(scheduledAt.getTime())
    ? `${formatLongDate(scheduledAt)} · ${scheduledAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : '—';

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
              {appointment.visitor_name || appointment.title || 'Appointment details'}
            </h2>
            {appointment.title && appointment.visitor_name && (
              <p className="mt-0.5 truncate text-sm text-gray-600">{appointment.title}</p>
            )}
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
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {appointment.status && <StatusBadge status={appointment.status} />}
            {(visit?.status || appointment.visit_status) && (
              <StatusBadge status={visit?.status || appointment.visit_status} />
            )}
            {appointment.classification && appointment.classification !== 'standard' && (
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium capitalize text-orange-800 ring-1 ring-orange-200">
                {appointment.classification}
              </span>
            )}
          </div>

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
            <div className="space-y-6">
              <section className="rounded-xl bg-[#f8f9fa] px-4 py-3">
                <DetailRow icon={Calendar} label="When" value={scheduledLabel} />
                <DetailRow
                  icon={Clock}
                  label="Category"
                  value={visit?.category_name || appointment.category_name || 'Standard visitor'}
                />
                {visit?.pass_code && (
                  <DetailRow icon={User} label="Pass code" value={visit.pass_code} />
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Guest</h3>
                <div className="rounded-xl border border-gray-200 px-4 py-1">
                  <DetailRow
                    icon={User}
                    label="Name"
                    value={visit?.full_name || appointment.visitor_name}
                  />
                  <DetailRow
                    icon={Phone}
                    label="Phone"
                    value={visit?.phone || appointment.phone}
                  />
                  <DetailRow icon={Mail} label="Email" value={visit?.email} />
                  <DetailRow label="Company" value={visit?.company || appointment.company} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Meeting details</h3>
                <div className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800">
                  {visit?.purpose || appointment.purpose || 'No description provided.'}
                </div>
              </section>

              {(data?.events || []).length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Timeline</h3>
                  <ol className="space-y-3">
                    {data.events.map((evt) => (
                      <li key={evt.id} className="border-l-2 border-cyan-200 pl-3 text-sm">
                        <p className="font-medium text-gray-900">
                          {EVENT_LABELS[evt.event_type] || evt.event_type}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">{formatDateTime(evt.created_at)}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {!visit && !appointment.visit_id && (
                <p className="text-sm text-gray-500">Limited details are available for this appointment.</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
