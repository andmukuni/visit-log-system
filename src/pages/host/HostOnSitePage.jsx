import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, StatusBadge, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { hostApi } from '../../utils/visitorApi';

export default function HostOnSitePage() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVisits(await hostApi.getOnSite());
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'company', label: 'Company' },
    { key: 'badge_number', label: 'Badge' },
    { key: 'pass_code', label: 'Pass code' },
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
        title="Visitors On-site"
        subtitle="Guests currently inside the building"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'On-site' }]}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${visits.length} visitor${visits.length === 1 ? '' : 's'} on site`}>
          <DataTable columns={columns} data={visits} emptyTitle="No visitors on site" />
        </Card>
      )}
    </div>
  );
}
