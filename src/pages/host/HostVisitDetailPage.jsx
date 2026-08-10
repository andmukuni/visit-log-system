import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader, Card, StatusBadge, Spinner, BackAction } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { hostApi } from '../../utils/visitorApi';

const EVENT_LABELS = {
  registered: 'Registered',
  pre_registered: 'Pre-registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
};

export default function HostVisitDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await hostApi.getVisit(id));
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
        subtitle={visit ? `Pass code: ${visit.pass_code || '—'}` : ''}
        breadcrumbs={[
          { label: 'Host', to: '/host' },
          { label: 'My Contacts', to: '/host/contacts' },
          { label: 'Details' },
        ]}
      />

      {loading && <div className="flex justify-center py-16"><Spinner size={32} /></div>}

      {!loading && error && (
        <Card title="Error">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-2">
            <BackAction to="/host/contacts" label="Back" />
          </div>
        </Card>
      )}

      {!loading && visit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Visit information">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-navy-500">Status</dt><dd><StatusBadge status={visit.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Phone</dt><dd>{visit.phone || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Company</dt><dd>{visit.company || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Purpose</dt><dd className="text-right max-w-[60%]">{visit.purpose || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Expected</dt><dd>{formatDateTime(visit.expected_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-navy-500">Checked in</dt><dd>{formatDateTime(visit.checked_in_at)}</dd></div>
            </dl>
          </Card>

          <Card title="Timeline">
            <ol className="space-y-3">
              {(data.events || []).map((evt) => (
                <li key={evt.id} className="border-l-2 border-cyan-200 pl-3 text-sm">
                  <p className="font-medium">{EVENT_LABELS[evt.event_type] || evt.event_type}</p>
                  <p className="text-xs text-navy-500">{formatDateTime(evt.created_at)}{evt.actor_name ? ` · ${evt.actor_name}` : ''}</p>
                  {evt.reason && <p className="text-xs text-navy-600 mt-1">{evt.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}
