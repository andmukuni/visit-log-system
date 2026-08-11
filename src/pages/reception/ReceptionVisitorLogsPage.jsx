import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  { value: '', label: 'All', dot: 'bg-navy-400' },
  { value: 'pending_approval', label: 'Pending approval', dot: 'bg-yellow-500' },
  { value: 'expected', label: 'Expected', dot: 'bg-sky-500' },
  { value: 'approved', label: 'Approved', dot: 'bg-emerald-500' },
  { value: 'reception_check_in', label: 'At reception', dot: 'bg-teal-500' },
  { value: 'waiting', label: 'Waiting', dot: 'bg-sky-500' },
  { value: 'in_meeting', label: 'In meeting', dot: 'bg-violet-500' },
  { value: 'checked_out', label: 'Checked out', dot: 'bg-slate-400' },
  { value: 'completed', label: 'Completed', dot: 'bg-gray-500' },
];

export default function ReceptionVisitorLogsPage() {
  const navigate = useNavigate();
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
        <div className="space-y-4">
          <FormField label="Search" name="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, pass code…" />
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-navy-500">Status</p>
            <FilterPills
              variant="segmented"
              size="sm"
              aria-label="Filter by visit status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={visits}
            emptyTitle="No visits found"
            onRowClick={(row) => navigate(`/reception/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
