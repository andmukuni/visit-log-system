import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, StatusBadge, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityOverduePage() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVisits(await securityApi.getOverdue());
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    { key: 'badge_number', label: 'Badge' },
    { key: 'site_name', label: 'Site' },
    {
      key: 'checked_in_at',
      label: 'Checked in',
      render: (_, row) => formatDateTime(row.checked_in_at),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Overdue Visits"
        subtitle="Visitors who have exceeded their authorised visit duration"
        breadcrumbs={[{ label: 'Security', to: '/security' }, { label: 'Overdue' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${visits.length} overdue`}>
          <DataTable columns={columns} data={visits} emptyTitle="No overdue visits" />
        </Card>
      )}
    </div>
  );
}
