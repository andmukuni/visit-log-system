import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, StatusBadge } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { complianceApi } from '../../utils/visitorApi';

export default function ComplianceIncidentsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await complianceApi.getIncidents());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'site_name', label: 'Site' },
    {
      key: 'severity',
      label: 'Severity',
      render: (_, row) => <StatusBadge status={row.severity} />,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    { key: 'reported_by_name', label: 'Reported by' },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Incident Review"
        subtitle="Read-only review of security incidents"
        breadcrumbs={[{ label: 'Compliance', to: '/compliance' }, { label: 'Incidents' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} incidents`}>
          <DataTable columns={columns} data={rows} emptyTitle="No incidents recorded" />
        </Card>
      )}
    </div>
  );
}
