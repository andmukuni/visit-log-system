import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, Eye } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  ActionToolbar,
  RefreshAction,
  IconButton,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import {
  filterVisitsByReceptionZones,
  scopeReceptionReferenceData,
} from '../../utils/receptionZoneScope';

export default function ReceptionApprovalsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [zoneIds, setZoneIds] = useState([]);
  const [zoneHostIds, setZoneHostIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, rawRef] = await Promise.all([
        receptionApi.getVisits({ status: 'pending_approval' }),
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scopedVisits = useMemo(
    () => filterVisitsByReceptionZones(visits, zoneIds, zoneHostIds),
    [visits, zoneIds, zoneHostIds],
  );

  const requestApproval = async (id) => {
    setActing(id);
    try {
      const result = await receptionApi.requestApproval(id);
      toastHostApprovalRequested(toast, result, 'Approval reminder sent to host.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    { key: 'host_name', label: 'Host' },
    { key: 'purpose', label: 'Purpose' },
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
          <Link to={`/reception/visitors/${row.id}`} aria-label={`View ${row.full_name || 'visitor'}`}>
            <IconButton icon={Eye} label="View" tooltip="View visit" size="sm" variant="ghost" iconSize={16} />
          </Link>
          <IconButton
            icon={BellRing}
            label="Remind host"
            tooltip="Remind host"
            size="sm"
            variant="ghost"
            iconSize={16}
            disabled={acting === row.id}
            onClick={(e) => {
              e.stopPropagation();
              void requestApproval(row.id);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Pending Approvals"
        subtitle="Only pending visits for hosts in your assigned zone"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Approvals' }]}
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={scopedVisits}
            emptyTitle="No pending approvals in your zone"
            emptyDescription="Walk-ins awaiting host approval in your zone will appear here."
            onRowClick={(row) => navigate(`/reception/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
