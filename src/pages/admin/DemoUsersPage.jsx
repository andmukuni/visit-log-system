import { useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, StatusBadge, Spinner } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

export default function DemoUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users`, {
          headers: getAdminAuthHeaders(),
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || 'Failed to load users');
        }
        if (!cancelled) setUsers(json.data || []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Unable to load users.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    {
      key: 'email_verified',
      label: 'Verified',
      render: (_, row) => (
        <StatusBadge status={row.email_verified ? 'confirmed' : 'pending'} />
      ),
    },
    {
      key: 'created_at',
      label: 'Joined',
      render: (_, row) => formatDate(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Live user list from MySQL"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Users' },
        ]}
      />

      <Card>
        {loading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}
        {!loading && error && (
          <p className="text-sm text-red-600 py-4">{error}</p>
        )}
        {!loading && !error && (
          <DataTable columns={columns} data={users} emptyTitle="No users yet" />
        )}
      </Card>
    </div>
  );
}
