import { useCallback, useEffect, useState } from 'react';
import { Building2, ClipboardList, MapPin, Phone, User, Users } from 'lucide-react';
import { Card, Spinner, StatusBadge, VisitorTypeBadge } from '../ui';
import { formatDateTime } from '../../utils/helpers';
import {
  VISIT_EVENT_LABELS,
  VISIT_JOURNEY_STEPS,
  VISIT_STATUS_ALIASES,
} from './visitLogConstants';

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-3 last:border-0">
      <Icon size={18} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-navy-900">{value || '—'}</p>
      </div>
    </div>
  );
}

function resolveJourneyIndex(status) {
  const normalized = VISIT_STATUS_ALIASES[status] || status;
  const idx = VISIT_JOURNEY_STEPS.findIndex((step) => step.key === normalized);
  return idx >= 0 ? idx : 0;
}

function VisitJourney({ status }) {
  const terminal = ['rejected', 'cancelled', 'denied', 'expired'].includes(status);
  const currentIndex = resolveJourneyIndex(status);

  if (terminal) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-700">Visit ended</p>
        <div className="mt-2">
          <StatusBadge status={status} />
        </div>
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {VISIT_JOURNEY_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  active
                    ? 'bg-[#1a73e8] text-white ring-4 ring-sky-100'
                    : done
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              {index < VISIT_JOURNEY_STEPS.length - 1 && (
                <span className={`my-0.5 min-h-[16px] w-0.5 flex-1 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
              )}
            </div>
            <div className={`pb-3 pt-0.5 ${active ? 'text-navy-900' : done ? 'text-gray-700' : 'text-gray-400'}`}>
              <p className={`text-sm font-semibold ${active ? 'text-[#1a73e8]' : ''}`}>{step.label}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function VisitActivityPanel({
  visitId,
  fetchVisit,
  summary = null,
  detail: controlledDetail = undefined,
  loading: controlledLoading = undefined,
  error: controlledError = undefined,
  header = null,
  hideVisitorCard = false,
  sidebarExtra = null,
  layout = 'grid',
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isControlled = controlledDetail !== undefined;

  const load = useCallback(async () => {
    if (isControlled || !visitId) return;
    setLoading(true);
    setError('');
    try {
      setDetail(await fetchVisit(visitId));
    } catch (err) {
      setDetail(null);
      setError(err?.message || 'Unable to load visit details.');
    } finally {
      setLoading(false);
    }
  }, [visitId, fetchVisit, isControlled]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedLoading = isControlled ? Boolean(controlledLoading) : loading;
  const resolvedError = isControlled ? (controlledError || '') : error;
  const resolvedDetail = isControlled ? controlledDetail : detail;

  if (resolvedLoading) {
    return (
      <>
        {header}
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      </>
    );
  }

  if (resolvedError) {
    return (
      <>
        {header}
        <Card title="Unable to load visit">
          <p className="text-sm text-red-600">{resolvedError}</p>
        </Card>
      </>
    );
  }

  const visit = resolvedDetail?.visit || summary || {};
  const events = resolvedDetail?.events || [];
  const approvals = resolvedDetail?.approvals || [];
  const history = resolvedDetail?.visitorHistory || [];
  const reference = visit.pass_code || visit.reference_number || summary?.reference_number || '—';
  const isStack = layout === 'stack';

  return (
    <>
      {header}
      <div className={`grid grid-cols-1 gap-6 ${isStack ? '' : 'xl:grid-cols-3'}`}>
      <div className={`space-y-6 ${isStack ? '' : 'xl:col-span-1'}`}>
        {!hideVisitorCard && (
        <Card title="Visitor">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <StatusBadge status={visit.status || summary?.status} />
            {(visit.classification || summary?.classification) && (
              <VisitorTypeBadge classification={visit.classification || summary?.classification} size="xs" />
            )}
          </div>
          <DetailRow icon={User} label="Full name" value={visit.full_name || visit.visitor_name || summary?.visitor_name} />
          <DetailRow icon={Phone} label="Phone" value={visit.phone} />
          <DetailRow icon={Users} label="Company" value={visit.company || summary?.company} />
          <DetailRow icon={ClipboardList} label="Reference / pass code" value={reference} />
        </Card>
        )}

        <Card title="Visit details">
          <DetailRow icon={User} label="Host / employee" value={visit.host_name || summary?.host_name} />
          <DetailRow icon={Building2} label="Organisation" value={visit.organisation_name || summary?.organisation_name} />
          <DetailRow icon={MapPin} label="Site" value={visit.site_name || summary?.site_name} />
          <DetailRow icon={ClipboardList} label="Category" value={visit.category_name || summary?.category_name} />
          <DetailRow icon={ClipboardList} label="Expected" value={visit.expected_at ? formatDateTime(visit.expected_at) : '—'} />
          <DetailRow icon={ClipboardList} label="Badge" value={visit.badge_number || '—'} />
          <DetailRow icon={ClipboardList} label="Registered" value={formatDateTime(visit.created_at || summary?.created_at)} />
          <DetailRow icon={ClipboardList} label="Check-in" value={visit.checked_in_at || visit.check_in_at || summary?.check_in_at ? formatDateTime(visit.checked_in_at || visit.check_in_at || summary?.check_in_at) : '—'} />
          <DetailRow icon={ClipboardList} label="Check-out" value={visit.checked_out_at || visit.check_out_at || summary?.check_out_at ? formatDateTime(visit.checked_out_at || visit.check_out_at || summary?.check_out_at) : '—'} />
        </Card>

        {sidebarExtra}
      </div>

      <div className={`space-y-6 ${isStack ? '' : 'xl:col-span-2'}`}>
        <Card title="Purpose of visit">
          <p className="text-sm leading-relaxed text-navy-900">
            {visit.purpose || summary?.purpose || 'No purpose recorded for this visit.'}
          </p>
        </Card>

        <Card title="Progress through the company">
          <VisitJourney status={visit.status || summary?.status} />
        </Card>

        <Card title="Activity timeline" subtitle="All recorded events for this visit">
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((evt) => (
                <li key={evt.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-semibold text-navy-900">
                    {VISIT_EVENT_LABELS[evt.event_type] || evt.event_type}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatDateTime(evt.created_at)}
                    {evt.actor_name ? ` · ${evt.actor_name}` : ''}
                  </p>
                  {evt.reason && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-700">{evt.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {approvals.length > 0 && (
          <Card title="Approvals">
            <ul className="space-y-2">
              {approvals.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                  <span className="font-semibold capitalize text-navy-900">{item.decision}</span>
                  <span className="text-xs text-gray-500">
                    {item.approver_name || 'System'} · {formatDateTime(item.created_at)}
                  </span>
                  {item.reason && <p className="w-full text-xs text-gray-600">{item.reason}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {history.length > 0 && (
          <Card title="Previous visits by this visitor">
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id} className="rounded-lg border border-gray-100 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy-900">{formatDateTime(item.created_at)}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-gray-700">{item.purpose || '—'}</p>
                  <p className="mt-0.5 text-xs text-gray-500">Host: {item.host_name || '—'}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
    </>
  );
}
