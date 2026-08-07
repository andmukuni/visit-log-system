import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { complianceApi } from '../../utils/visitorApi';

export default function ComplianceRetentionPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await complianceApi.getRetentionPolicies());
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
    { key: 'label', label: 'Data category' },
    { key: 'category', label: 'Key' },
    {
      key: 'retention_days',
      label: 'Retention',
      render: (_, row) => `${row.retention_days} days`,
    },
    {
      key: 'legal_hold',
      label: 'Legal hold',
      render: (_, row) => row.legal_hold ? 'Active' : '—',
    },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div>
      <PageHeader
        title="Retention & Legal Holds"
        subtitle="Configured retention periods by data category — changes require elevated approval"
        breadcrumbs={[{ label: 'Compliance', to: '/compliance' }, { label: 'Retention' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} policies`}>
          <p className="text-sm text-navy-600 mb-4">
            Audit logs are never deleted when visitor personal data is anonymised, per policy.
          </p>
          <DataTable columns={columns} data={rows} emptyTitle="No retention policies configured" />
        </Card>
      )}
    </div>
  );
}
