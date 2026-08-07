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
import { platformApi } from '../../utils/visitorApi';

export default function PlatformVisitorsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await platformApi.getVisitors());
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
    { key: 'full_name', label: 'Visitor' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'company', label: 'Company' },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'visit_count', label: 'Visits' },
    {
      key: 'last_visit_at',
      label: 'Last visit',
      render: (_, row) => (row.last_visit_at ? formatDateTime(row.last_visit_at) : '—'),
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Visitors"
        subtitle="Platform-wide visitor directory across all organisations"
        iconKey="visitors"
        actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} visitor${rows.length === 1 ? '' : 's'}`}>
          <DataTable
            embedded
            columns={columns}
            data={rows}
            emptyTitle="No visitors yet"
            emptyDescription="Visitor profiles will appear here as organisations register guests."
            toolbar={{
              placeholder: 'Search name, phone, company, organisation…',
              searchKeys: ['full_name', 'phone', 'email', 'company', 'organisation_name'],
            }}
          />
        </Card>
      )}
    </div>
  );
}
