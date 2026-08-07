import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { notificationsApi } from '../../utils/visitorApi';

export default function AdminNotificationsPage() {
  const [templates, setTemplates] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, rec] = await Promise.all([
        notificationsApi.getTemplates(),
        notificationsApi.getOrgRecent(),
      ]);
      setTemplates(tpl);
      setRecent(rec);
    } catch {
      setTemplates([]);
      setRecent([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const templateColumns = [
    { key: 'template_key', label: 'Event' },
    { key: 'channel', label: 'Channel' },
    { key: 'subject', label: 'Subject' },
    {
      key: 'enabled',
      label: 'Enabled',
      render: (_, row) => (row.enabled ? 'Yes' : 'No'),
    },
  ];

  const recentColumns = [
    { key: 'title', label: 'Title' },
    { key: 'user_name', label: 'Recipient' },
    { key: 'notification_type', label: 'Type' },
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
          <Card title="Notification templates">
            <DataTable columns={templateColumns} data={templates} emptyTitle="No templates" />
          </Card>
          <Card title="Recent deliveries">
            <DataTable columns={recentColumns} data={recent} emptyTitle="No notifications sent yet" />
          </Card>
        </div>
      )}
    </div>
  );
}
