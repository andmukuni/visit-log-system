import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  ActionToolbar,
  RefreshAction,
  ConfirmAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

const VARIANTS = {
  pending: {
    statusFilter: 'pending_approval',
    title: 'Pending Approvals',
    subtitle: 'Visitors awaiting host or security approval',
  },
  expected: {
    statusFilter: 'approved',
    title: 'Expected Arrivals',
    subtitle: 'Approved and pre-registered visitors expected today',
  },
};

export default function PendingApprovalsPage({ variant = 'pending' }) {
  const config = VARIANTS[variant] || VARIANTS.pending;
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visitorApi.getVisits({ status: config.statusFilter });
      setVisits(rows);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [config.statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id) => {
    setActing(id);
    try {
      await visitorApi.approveVisit(id);
      toast.success('Visit approved.');
      load();
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
    ...(variant === 'pending' ? [{
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => (
        <ConfirmAction
          loading={acting === row.id}
          onClick={() => approve(row.id)}
          label="Approve"
        />
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: config.title }]}
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
          <DataTable columns={columns} data={visits} emptyTitle="No visits in this queue" />
        </Card>
      )}
    </div>
  );
}

export function ExpectedArrivalsPage() {
  return <PendingApprovalsPage variant="expected" />;
}
