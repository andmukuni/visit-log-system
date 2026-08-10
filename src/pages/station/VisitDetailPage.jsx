import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  PageHeader,
  Card,
  StatusBadge,
  Spinner,
  ActionToolbar,
  BackAction,
  RefreshAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

const EVENT_LABELS = {
  registered: 'Registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
};

export default function VisitDetailPage({ portalPrefix = '/station' }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await visitorApi.getVisit(id);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const visit = data?.visit;

  return (
    <div>
      <PageHeader
        title={visit?.full_name || 'Visit details'}
        subtitle={visit ? `Pass code: ${visit.pass_code || '—'}` : 'Loading…'}
        breadcrumbs={[
          { label: portalPrefix === '/reception' ? 'Reception' : 'Station', to: portalPrefix },
          { label: 'Visitor Logs', to: `${portalPrefix}/visitors` },
          { label: 'Details' },
        ]}
        actions={(
          <ActionToolbar>
            <BackAction to={`${portalPrefix}/visitors`} label="Back to logs" />
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      {loading && (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      )}

      {!loading && error && (
        <Card title="Error">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <BackAction to={`${portalPrefix}/visitors`} label="Back to logs" />
          </div>
        </Card>
      )}

      {!loading && visit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Visit information">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Status</dt>
                <dd><StatusBadge status={visit.status} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Host</dt>
                <dd className="font-medium">{visit.host_name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Category</dt>
                <dd>{visit.category_name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Phone</dt>
                <dd>{visit.phone || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Company</dt>
                <dd>{visit.company || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Purpose</dt>
                <dd className="text-right max-w-[60%]">{visit.purpose || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Badge</dt>
                <dd>{visit.badge_number || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Checked in</dt>
                <dd>{formatDateTime(visit.checked_in_at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-navy-500">Checked out</dt>
                <dd>{formatDateTime(visit.checked_out_at)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Event timeline" subtitle="Append-only audit trail">
            <ol className="space-y-3">
              {(data.events || []).map((evt) => (
                <li key={evt.id} className="flex gap-3 text-sm border-l-2 border-cyan-200 pl-3">
                  <div>
                    <p className="font-medium text-navy-900">
                      {EVENT_LABELS[evt.event_type] || evt.event_type}
                    </p>
                    <p className="text-xs text-navy-500">
                      {formatDateTime(evt.created_at)}
                      {evt.actor_name ? ` · ${evt.actor_name}` : ''}
                    </p>
                    {evt.reason && <p className="text-xs text-navy-600 mt-1">{evt.reason}</p>}
                  </div>
                </li>
              ))}
              {(data.events || []).length === 0 && (
                <p className="text-sm text-navy-500">No events recorded.</p>
              )}
            </ol>
          </Card>

          {(data.approvals || []).length > 0 && (
            <Card title="Approvals" className="lg:col-span-2">
              <ul className="space-y-2 text-sm">
                {data.approvals.map((a) => (
                  <li key={a.id} className="flex justify-between border-b border-navy-50 pb-2">
                    <span className="capitalize">{a.decision}</span>
                    <span className="text-navy-500">{a.approver_name || 'System'} · {formatDateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
