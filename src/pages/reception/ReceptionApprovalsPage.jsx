import { useCallback, useEffect, useState } from 'react';
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
import { receptionApi, visitorApi } from '../../utils/visitorApi';

export default function ReceptionApprovalsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visitorApi.getVisits({ status: 'pending_approval' });
      setVisits(rows);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requestApproval = async (id) => {
    setActing(id);
    try {
      await receptionApi.requestApproval(id);
      toast.success('Approval reminder sent to host.');
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
            loading={acting === row.id}
            className="text-cyan-700 hover:bg-cyan-50"
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
        subtitle="Track walk-ins and visits awaiting host or security approval"
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
            data={visits}
            emptyTitle="No pending approvals"
            emptyDescription="Walk-ins awaiting host approval will appear here."
            onRowClick={(row) => navigate(`/reception/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
