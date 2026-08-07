import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { complianceApi } from '../../utils/visitorApi';

export default function ComplianceAccessPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await complianceApi.getAccessReview());
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
    { key: 'name', label: 'User' },
    { key: 'email', label: 'Email' },
    {
      key: 'roles',
      label: 'Roles',
      render: (_, row) => (row.roles || []).map((r) => r.name).join(', ') || row.role || '—',
    },
    { key: 'site_name', label: 'Site' },
    { key: 'station_name', label: 'Station' },
    { key: 'department_name', label: 'Department' },
    { key: 'permissionCount', label: 'Permissions' },
    {
      key: 'created_at',
      label: 'Account created',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="User Access Review"
        subtitle="Review role assignments and scope for organisation users"
        breadcrumbs={[{ label: 'Compliance', to: '/compliance' }, { label: 'Access Review' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} scoped users`}>
          <DataTable columns={columns} data={rows} emptyTitle="No users in scope" />
        </Card>
      )}
    </div>
  );
}
