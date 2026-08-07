import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  DataTable,
  Spinner,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

export default function OccupancyPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await visitorApi.getOccupancy();
      setRows(data);
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
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    { key: 'company', label: 'Company' },
    { key: 'host_name', label: 'Host' },
    { key: 'badge_number', label: 'Badge' },
    { key: 'category_name', label: 'Category' },
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
        subtitle="Visitors currently on site"
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: 'Occupancy' }]}
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} visitor${rows.length === 1 ? '' : 's'} inside`}>
          <DataTable columns={columns} data={rows} emptyTitle="No one on site" emptyDescription="All visitors have checked out." />
        </Card>
      )}
    </div>
  );
}
