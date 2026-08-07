import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { reportsApi } from '../../utils/visitorApi';

export default function ExportHistoryPage({
  portalLabel,
  portalPath,
  title = 'Export History',
  subtitle = 'Who exported what, when, and why',
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await reportsApi.getExports());
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
    {
      key: 'created_at',
      label: 'When',
      render: (_, row) => formatDateTime(row.created_at),
    },
    { key: 'exported_by_name', label: 'User' },
    { key: 'report_type', label: 'Report' },
    { key: 'format', label: 'Format' },
    { key: 'row_count', label: 'Rows' },
    { key: 'mask_level', label: 'Masking' },
    { key: 'purpose', label: 'Purpose' },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={[{ label: portalLabel, to: portalPath }, { label: title }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} export${rows.length === 1 ? '' : 's'}`}>
          <DataTable columns={columns} data={rows} emptyTitle="No exports yet" emptyDescription="Report exports will appear here with full audit metadata." />
        </Card>
      )}
    </div>
  );
}
