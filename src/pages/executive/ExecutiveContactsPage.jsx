import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { executiveApi } from '../../utils/visitorApi';

export default function ExecutiveContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (search.trim()) params.q = search.trim();
      setContacts(await executiveApi.getContacts(params));
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'company', label: 'Company' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    {
      key: 'use_count',
      label: 'Uses',
      render: (value) => value || 0,
    },
    {
      key: 'last_used_at',
      label: 'Last used',
      render: (value) => (value ? formatDateTime(value) : '—'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="My Contacts"
        subtitle="Saved guest details for quick appointment scheduling"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'My Contacts' }]}
      />

      <Card>
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts…"
            className="w-full max-w-md rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={32} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={contacts}
            emptyTitle="No contacts yet"
            emptyDescription="Contacts are saved automatically when you schedule appointments with guests."
          />
        )}
      </Card>
    </div>
  );
}
