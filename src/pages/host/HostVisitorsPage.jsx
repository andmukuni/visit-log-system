import { Eye } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Card, FormField, DataTable, StatusBadge, Spinner, IconButton } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { hostApi } from '../../utils/visitorApi';

export default function HostVisitorsPage() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      setVisits(await hostApi.getVisitors(params));
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
      key: 'created_at',
      label: 'Created',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'view',
      label: '',
      render: (_, row) => (
        <Link to={`/host/visitors/${row.id}`} aria-label="View">
          <IconButton icon={Eye} label="View" tooltip="View" variant="ghost" size="sm" />
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="My Visitors"
        subtitle="Upcoming and historical visits addressed to you"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'My Visitors' }]}
      />

      <Card title="Filters" className="mb-6">
        <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
          <FormField label="Search" name="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, company…" />
          <FormField
            label="Status"
            name="status"
            type="select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: 'All' },
              { value: 'pre_registered', label: 'Pre-registered' },
              { value: 'pending_approval', label: 'Pending approval' },
              { value: 'approved', label: 'Approved' },
              { value: 'checked_in', label: 'Checked in' },
              { value: 'completed', label: 'Completed' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable columns={columns} data={visits} emptyTitle="No visitors yet" emptyDescription="Invite a visitor to get started." />
        </Card>
      )}
    </div>
  );
}
