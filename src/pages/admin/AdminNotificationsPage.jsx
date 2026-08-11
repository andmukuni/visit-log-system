import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { notificationsApi } from '../../utils/visitorApi';

function recipientLabel(row) {
  if (row.user_name) return row.user_name;
  if (row.channel === 'email' || row.channel === 'sms') return 'External recipient';
  return '—';
}

function channelLabel(channel) {
  if (channel === 'in_app') return 'In-app';
  if (channel === 'email') return 'Email';
  if (channel === 'sms') return 'SMS';
  return channel || '—';
}

export default function AdminNotificationsPage() {
  const [templates, setTemplates] = useState([]);
  const [recent, setRecent] = useState([]);
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, rec] = await Promise.all([
        notificationsApi.getTemplates(),
        notificationsApi.getOrgRecent(),
      ]);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      setRecent(Array.isArray(rec) ? rec : []);
      setDelivery(rec?.delivery || null);
    } catch {
      setTemplates([]);
      setRecent([]);
      setDelivery(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTemplates = useMemo(() => {
    if (channelFilter === 'all') return templates;
    return templates.filter((row) => row.channel === channelFilter);
  }, [templates, channelFilter]);

  const templateColumns = [
    { key: 'template_key', label: 'Event' },
    {
      key: 'channel',
      label: 'Channel',
      render: (value) => channelLabel(value),
    },
    { key: 'subject', label: 'Subject' },
    {
      key: 'enabled',
      label: 'Enabled',
      render: (value) => (Number(value) ? 'Yes' : 'No'),
    },
  ];

  const recentColumns = [
    { key: 'title', label: 'Title' },
    {
      key: 'user_name',
      label: 'Recipient',
      render: (_, row) => recipientLabel(row),
    },
    {
      key: 'channel',
      label: 'Channel',
      render: (value) => channelLabel(value),
    },
    { key: 'notification_type', label: 'Type' },
    {
      key: 'status',
      label: 'Status',
      render: (value) => value || '—',
    },
    {
      key: 'created_at',
      label: 'Sent',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Templates and recent delivery log for your organisation"
        breadcrumbs={[{ label: 'Administration', to: '/admin' }, { label: 'Notifications' }]}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-navy-100 bg-navy-50/50 px-4 py-3 text-sm text-navy-700">
            Delivery health:{' '}
            <span className="font-medium text-navy-900">{delivery?.failed || 0}</span> failed,{' '}
            <span className="font-medium text-navy-900">{delivery?.pending || 0}</span> pending,{' '}
            <span className="font-medium text-navy-900">{delivery?.deliveredExternal || 0}</span> delivered (email/SMS).
          </div>

          <Card
            title="Notification templates"
            subtitle="Read-only system templates used for visit lifecycle alerts"
            actions={(
              <label className="flex items-center gap-2 text-sm text-navy-600">
                <span className="sr-only">Filter by channel</span>
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  aria-label="Filter templates by channel"
                >
                  <option value="all">All channels</option>
                  <option value="in_app">In-app</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </label>
            )}
          >
            <DataTable
              columns={templateColumns}
              data={filteredTemplates}
              emptyTitle="No templates"
              pageSize={25}
            />
          </Card>
          <Card title="Recent deliveries">
            <DataTable
              columns={recentColumns}
              data={recent}
              emptyTitle="No notifications sent yet"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
