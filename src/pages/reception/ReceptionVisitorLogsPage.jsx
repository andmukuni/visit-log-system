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
  { value: 'expected', label: 'Expected' },
  { value: 'approved', label: 'Approved' },
  { value: 'reception_check_in', label: 'At reception' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'in_meeting', label: 'In meeting' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'completed', label: 'Completed' },
];

export default function ReceptionVisitorLogsPage() {
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
        <Link to={`/reception/visitors/${row.id}`} aria-label={`View ${row.full_name}`}>
          <IconButton icon={Eye} label="View" tooltip="View" size="sm" variant="ghost" />
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visitor Logs"
        subtitle="Site-scoped visitor records"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Visitors' }]}
        actions={(
          <ActionToolbar>
            <AddAction to="/reception/register" label="Register walk-in" />
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Search" name="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, pass code…" />
          <div>
            <p className="mb-2 text-sm font-semibold text-navy-800">Status</p>
            <FilterPills options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable columns={columns} data={visits} emptyTitle="No visits found" />
        </Card>
      )}
    </div>
  );
}
