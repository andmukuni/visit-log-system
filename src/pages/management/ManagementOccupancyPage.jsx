import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { reportsApi } from '../../utils/visitorApi';

export default function ManagementOccupancyPage() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPreview(await reportsApi.preview({ type: 'occupancy', limit: 200 }));
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const columns = (preview?.columns || []).map((col) => ({
    key: col.key,
    label: col.label,
    render: (_, row) => (col.key.includes('_at') ? formatDateTime(row[col.key]) : (row[col.key] ?? '—')),
  }));

  return (
    <div>
      <PageHeader
        title="Live Occupancy"
        subtitle="Current on-site visitors with approved field masking"
        breadcrumbs={[{ label: 'Management', to: '/management' }, { label: 'Occupancy' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${preview?.total || 0} on site`} subtitle={preview?.maskLevel ? `Masking: ${preview.maskLevel}` : undefined}>
          <DataTable columns={columns} data={preview?.rows || []} emptyTitle="No one on site" />
        </Card>
      )}
    </div>
  );
}
