import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, StatusBadge } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { complianceApi } from '../../utils/visitorApi';

export default function ComplianceApprovalsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await complianceApi.getApprovals());
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
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'purpose', label: 'Purpose' },
    {
      key: 'decision',
      label: 'Decision',
      render: (_, row) => <StatusBadge status={row.decision} />,
    },
    { key: 'approver_name', label: 'Approver' },
    { key: 'reason', label: 'Reason' },
    {
      key: 'created_at',
      label: 'When',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Approval & Override Logs"
        subtitle="Host and security approval decisions — append-only history"
        breadcrumbs={[{ label: 'Compliance', to: '/compliance' }, { label: 'Approvals' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} records`}>
          <DataTable columns={columns} data={rows} emptyTitle="No approval records" />
        </Card>
      )}
    </div>
  );
}
