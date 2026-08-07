import { Check, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, Spinner, LoadingButton, IconButton, ActionToolbar } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { notificationsApi } from '../../utils/visitorApi';

export default function HostNotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await notificationsApi.list());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    setMarking(true);
    try {
      await notificationsApi.markAllRead();
      load();
    } finally {
      setMarking(false);
    }
  };

  const markOne = async (id) => {
    await notificationsApi.markRead(id);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Visitor arrivals, approvals and alerts"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'Notifications' }]}
        actions={(
          <ActionToolbar>
            <LoadingButton
              variant="secondary"
              icon={CheckCheck}
              iconOnly
              loading={marking}
              aria-label="Mark all read"
              onClick={markAll}
            />
          </ActionToolbar>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} notifications`}>
          <ul className="divide-y divide-navy-100">
            {rows.length === 0 && (
              <li className="py-8 text-center text-sm text-navy-400">No notifications yet.</li>
            )}
            {rows.map((n) => (
              <li key={n.id} className={`py-4 ${n.read_at ? 'opacity-60' : ''}`}>
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-medium text-navy-900">{n.title}</p>
                    <p className="text-sm text-navy-600 mt-1">{n.body}</p>
                    <p className="text-xs text-navy-400 mt-2">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <IconButton
                      icon={Check}
                      label="Mark read"
                      tooltip="Mark read"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => markOne(n.id)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
