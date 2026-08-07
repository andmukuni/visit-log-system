import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, StatusBadge, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityExceptionsPage() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVisits(await securityApi.getExceptions());
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
    { key: 'site_name', label: 'Site' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (_, row) => formatDateTime(row.updated_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Exceptions"
        subtitle="Rejected, denied, overdue and expired visits requiring review"
        breadcrumbs={[{ label: 'Security', to: '/security' }, { label: 'Exceptions' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${visits.length} exception${visits.length === 1 ? '' : 's'}`}>
          <DataTable columns={columns} data={visits} emptyTitle="No exceptions" emptyDescription="No exception visits in scope." />
        </Card>
      )}
    </div>
  );
}
