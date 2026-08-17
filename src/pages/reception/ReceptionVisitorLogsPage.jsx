import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, LogOut } from 'lucide-react';
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
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { receptionApi } from '../../utils/visitorApi';
import {
  filterVisitsByReceptionZones,
  scopeReceptionReferenceData,
} from '../../utils/receptionZoneScope';

const CHECKOUT_ELIGIBLE_STATUSES = ['checked_in', 'reception_check_in', 'waiting', 'in_meeting'];

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
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [zoneIds, setZoneIds] = useState([]);
  const [zoneHostIds, setZoneHostIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [checkingOutId, setCheckingOutId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const [rows, rawRef] = await Promise.all([
        receptionApi.getVisits(params),
        receptionApi.getReferenceData().catch(() => ({})),
      ]);
      const ref = scopeReceptionReferenceData(rawRef);
      setZoneIds(ref?.scope?.zone_ids || []);
      setZoneHostIds((ref.hosts || []).map((host) => host.id).filter(Boolean));
      setVisits(Array.isArray(rows) ? rows : []);
    } catch {
      setVisits([]);
      setZoneIds([]);
      setZoneHostIds([]);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    load();
  }, [load]);

  const scopedVisits = useMemo(
    () => filterVisitsByReceptionZones(visits, zoneIds, zoneHostIds),
    [visits, zoneIds, zoneHostIds],
  );

  const handleCheckOut = useCallback(async (row) => {
    setCheckingOutId(row.id);
    try {
      await receptionApi.checkOutVisit(row.id);
      toast.success(`${row.full_name || 'Visitor'} checked out.`);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not check out visitor.');
    } finally {
      setCheckingOutId(null);
    }
  }, [load, toast]);

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
        <div className="flex items-center justify-end gap-1">
          {CHECKOUT_ELIGIBLE_STATUSES.includes(row.status) && (
            <IconButton
              icon={LogOut}
              label="Check out"
              tooltip="Check out"
              size="sm"
              variant="ghost"
              loading={checkingOutId === row.id}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleCheckOut(row);
              }}
            />
          )}
          <Link to={`/reception/visitors/${row.id}`} aria-label={`View ${row.full_name}`}>
            <IconButton icon={Eye} label="View" tooltip="View" size="sm" variant="ghost" />
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visitor Logs"
        subtitle="Only visitors and hosts in your assigned zone"
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
            data={scopedVisits}
            emptyTitle="No visits in your zone"
            emptyDescription="Visitors for hosts in your assigned zone will appear here."
            onRowClick={(row) => navigate(`/reception/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
