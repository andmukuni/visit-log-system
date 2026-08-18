import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader,
  Card,
  FormField,
  DataTable,
  VisitStatusBadge,
  Spinner,
  FilterPills,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { hostApi } from '../../utils/visitorApi';
import { useViewerHostId } from '../../hooks/useViewerHostId';

const STATUS_OPTIONS = [
  { value: '', label: 'All', dot: 'bg-navy-400' },
  { value: 'pending_approval', label: 'Pending approval', dot: 'bg-yellow-500' },
  { value: 'expected', label: 'Expected', dot: 'bg-sky-500' },
  { value: 'approved', label: 'Approved', dot: 'bg-emerald-500' },
  { value: 'reception_check_in', label: 'At reception', dot: 'bg-teal-500' },
  { value: 'waiting', label: 'Waiting', dot: 'bg-sky-500' },
  { value: 'in_meeting', label: 'With you', dot: 'bg-violet-500' },
  { value: 'checked_out', label: 'Checked out', dot: 'bg-slate-400' },
  { value: 'completed', label: 'Completed', dot: 'bg-gray-500' },
];

export default function HostVisitorsPage() {
  const navigate = useNavigate();
  const viewerHostId = useViewerHostId();
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
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    { key: 'company', label: 'Company' },
    { key: 'category_name', label: 'Category' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <VisitStatusBadge visit={row} viewerHostId={viewerHostId} />,
    },
    {
      key: 'expected_at',
      label: 'Expected',
      render: (_, row) => formatDateTime(row.expected_at),
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visitor Logs"
        subtitle="Only visitors queued and assigned to you"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'Visitor Logs' }]}
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      <Card className="mb-6">
        <div className="space-y-4">
          <FormField
            label="Search"
            name="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, pass code…"
          />
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
            emptyTitle="No visitors assigned to you"
            emptyDescription="Guests queued or invited to meet you will appear here."
            onRowClick={(row) => navigate(`/host/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
