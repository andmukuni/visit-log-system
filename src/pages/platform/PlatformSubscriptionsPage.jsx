import { useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, StatusBadge } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformSubscriptionsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    platformApi.getSubscriptions()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'plan_name', label: 'Plan' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    { key: 'max_sites', label: 'Max sites' },
    { key: 'max_users', label: 'Max users' },
    {
      key: 'started_at',
      label: 'Started',
      render: (_, row) => formatDateTime(row.started_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Plans & Subscriptions"
        subtitle="Organisation subscription entitlements"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Subscriptions' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} subscriptions`}>
          <DataTable columns={columns} data={rows} emptyTitle="No subscriptions" />
        </Card>
      )}
    </div>
  );
}
