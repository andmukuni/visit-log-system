import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, StatusBadge, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityApprovalsPage() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVisits(await securityApi.getApprovals());
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
    { key: 'company', label: 'Company' },
    { key: 'host_name', label: 'Host' },
    { key: 'site_name', label: 'Site' },
    { key: 'purpose', label: 'Purpose' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'created_at',
      label: 'Requested',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Approval Queue"
        subtitle="Visits awaiting host or security approval across your sites"
        breadcrumbs={[{ label: 'Security', to: '/security' }, { label: 'Approvals' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${visits.length} pending`}>
          <DataTable columns={columns} data={visits} emptyTitle="Queue clear" emptyDescription="No visits awaiting approval." />
        </Card>
      )}
    </div>
  );
}
