import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformAuditPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await platformApi.getAudit({ limit: 100 }));
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
      label: 'Time',
      render: (_, row) => formatDateTime(row.created_at),
    },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'action', label: 'Action' },
    { key: 'actor_name', label: 'User' },
    { key: 'target_type', label: 'Target' },
    { key: 'result', label: 'Result' },
  ];

  return (
    <div>
      <PageHeader
        title="Global Audit Logs"
        subtitle="Platform-wide administrative actions — metadata only"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Audit' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} events`}>
          <DataTable columns={columns} data={rows} emptyTitle="No audit events" />
        </Card>
      )}
    </div>
  );
}
