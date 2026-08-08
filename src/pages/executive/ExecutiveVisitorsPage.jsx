import { Eye } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Card, FormField, DataTable, StatusBadge, Spinner, IconButton } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { executiveApi } from '../../utils/visitorApi';

export default function ExecutiveVisitorsPage() {
  const [searchParams] = useSearchParams();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      setVisits(await executiveApi.getVisits(params));
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'company', label: 'Company' },
    { key: 'category_name', label: 'Category' },
    {
      key: 'classification',
      label: 'Type',
      render: (_, row) => <span className="capitalize">{row.classification || 'standard'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'expected_at',
      label: 'Expected',
      render: (_, row) => formatDateTime(row.expected_at),
    },
    {
      key: 'view',
      label: '',
      render: (_, row) => (
        <Link to={`/executive/visitors/${row.id}`} aria-label="View">
          <IconButton icon={Eye} label="View" tooltip="View" variant="ghost" size="sm" />
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="My Visitors"
        subtitle="Visitors and appointments linked to your office"
        breadcrumbs={[{ label: 'Executive', to: '/executive' }, { label: 'Visitors' }]}
      />

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Search">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, company or purpose"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="pending_approval">Pending approval</option>
              <option value="approved">Approved</option>
              <option value="checked_in">Checked in</option>
              <option value="checked_out">Checked out</option>
              <option value="completed">Completed</option>
            </select>
          </FormField>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : (
          <DataTable
            embedded
            columns={columns}
            data={visits}
            emptyTitle="No visitors yet"
            toolbar={{ placeholder: 'Filter visitors…', searchKeys: ['full_name', 'company', 'purpose'] }}
          />
        )}
      </Card>
    </div>
  );
}
