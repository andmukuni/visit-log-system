import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function OccupancyPage({
  portalPrefix = '/station',
  title = 'Current Occupancy',
  subtitle = 'Visitors currently on site',
  fetchOccupancy = () => visitorApi.getOccupancy(),
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOccupancy();
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchOccupancy]);

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
        title={title}
        subtitle={subtitle}
        breadcrumbs={[{ label: portalPrefix === '/reception' ? 'Reception' : 'Station', to: portalPrefix }, { label: 'Occupancy' }]}
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
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle="No one on site"
            emptyDescription={
              portalPrefix === '/reception'
                ? 'No on-site visitors for hosts in your zone right now.'
                : 'All visitors have checked out.'
            }
            onRowClick={(row) => navigate(`${portalPrefix}/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
