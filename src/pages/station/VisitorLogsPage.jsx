import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import {
  PageHeader,
  Card,
  FormField,
  DataTable,
  StatusBadge,
  Spinner,
  FilterPills,
  IconButton,
  ActionToolbar,
  RefreshAction,
  AddAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

export default function VisitorLogsPage() {
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
      const rows = await visitorApi.getVisits(params);
      setVisits(rows);
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
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    { key: 'phone', label: 'Phone' },
    { key: 'host_name', label: 'Host' },
    { key: 'category_name', label: 'Category' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => (
        <Link to={`/station/visitors/${row.id}`} aria-label={`View ${row.full_name}`}>
          <IconButton icon={Eye} label="View" tooltip="View" size="sm" variant="ghost" />
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visitor Logs"
        subtitle="Search and filter visitor activity"
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: 'Visitor Logs' }]}
        actions={(
          <ActionToolbar>
            <AddAction to="/station/visitors/new" label="New visitor" />
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      <Card title="Filters" className="mb-6">
        <div className="space-y-4">
          <FormField
            label="Search"
            name="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, host…"
          />
          <FilterPills options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${visits.length} visit${visits.length === 1 ? '' : 's'}`}>
          <DataTable columns={columns} data={visits} emptyTitle="No visits found" />
        </Card>
      )}
    </div>
  );
}
