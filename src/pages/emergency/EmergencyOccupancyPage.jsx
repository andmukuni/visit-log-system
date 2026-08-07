import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { emergencyApi } from '../../utils/visitorApi';

export default function EmergencyOccupancyPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await emergencyApi.getOccupancy());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'phone', label: 'Phone' },
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
        title="Current Occupancy"
        subtitle="Everyone currently checked in — for evacuation planning"
        breadcrumbs={[{ label: 'Emergency', to: '/emergency' }, { label: 'Occupancy' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} on site`}>
          <DataTable columns={columns} data={rows} emptyTitle="No one on site" />
        </Card>
      )}
    </div>
  );
}
