import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformUsersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    platformApi.getUsers()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Legacy role' },
    { key: 'role_slugs', label: 'RBAC roles' },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Platform Users"
        subtitle="Administrators with platform or super-admin access"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Users' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} users`}>
          <DataTable columns={columns} data={rows} emptyTitle="No platform users" />
        </Card>
      )}
    </div>
  );
}
