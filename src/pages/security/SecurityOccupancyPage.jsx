import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityOccupancyPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await securityApi.getOccupancy());
    } catch {
      setRows([]);
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
    { key: 'host_name', label: 'Host' },
    { key: 'site_name', label: 'Site' },
    { key: 'badge_number', label: 'Badge' },
    {
      key: 'checked_in_at',
      label: 'Checked in',
      render: (_, row) => formatDateTime(row.checked_in_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Live Occupancy"
        subtitle="Visitors currently on site across your assigned scope"
        breadcrumbs={[{ label: 'Security', to: '/security' }, { label: 'Occupancy' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} visitor${rows.length === 1 ? '' : 's'} inside`}>
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle="No one on site"
            emptyDescription="All visitors have checked out."
            onRowClick={(row) => navigate(`/security/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
