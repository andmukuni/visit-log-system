import { useEffect, useState } from 'react';
import { PageHeader, DataTable, StatusBadge, Spinner, Card, AddAction } from '../../components/ui';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { DEMO_ITEMS } from '../../data/demoItems';

const API_BASE = getApiBase();

export default function DemoItemsListPage() {
  const [items, setItems] = useState(DEMO_ITEMS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/items`, {
          headers: getAdminAuthHeaders(),
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && json?.data) {
          setItems(json.data);
        }
      } catch {
        // keep static fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'updatedAt',
      label: 'Updated',
      render: (_, row) => formatDate(row.updatedAt),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Demo Items"
        subtitle="Example list page using DataTable"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Demo Items' },
        ]}
        actions={<AddAction to="/admin/items/new" label="Create item" />}
      />

      <Card>
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <DataTable columns={columns} data={items} emptyTitle="No items found" />
        )}
      </Card>
    </div>
  );
}
