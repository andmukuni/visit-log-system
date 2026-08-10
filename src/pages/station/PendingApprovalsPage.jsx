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
  FilterPills,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
];

const VARIANTS = {
  pending: {
    title: 'Pending Approvals',
    subtitle: 'Visitors awaiting host or security approval',
    load: (params) => visitorApi.getVisits({ status: 'pending_approval', ...params }),
  },
  expected: {
    title: 'Expected Arrivals',
    subtitle: 'Visitors and appointments expected at the gate — including executive calendar bookings',
    load: (params) => visitorApi.getExpectedArrivals(params),
  },
};

export default function PendingApprovalsPage({ variant = 'pending' }) {
  const config = VARIANTS[variant] || VARIANTS.pending;
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [range, setRange] = useState('week');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = variant === 'expected' ? { range } : {};
      const rows = await config.load(params);
      setVisits(rows);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [config, range, variant]);

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
    {
      key: 'purpose',
      label: 'Purpose',
      render: (_, row) => row.appointment_title || row.purpose || '—',
    },
    ...(variant === 'expected' ? [{
      key: 'expected_at',
      label: 'Expected arrival',
      render: (_, row) => formatDateTime(row.expected_at || row.appointment_scheduled_at),
    }, {
      key: 'expected_plates',
      label: 'Vehicle',
      render: (_, row) => row.expected_plates || '—',
    }] : []),
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    ...(variant === 'pending' ? [{
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    }] : []),
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

      {variant === 'expected' ? (
        <Card title="Arrival window" className="mb-6">
          <FilterPills
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
          />
        </Card>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={visits}
            emptyTitle={variant === 'expected' ? 'No expected arrivals' : 'No visits in this queue'}
            emptyDescription={
              variant === 'expected'
                ? 'Executive calendar appointments and pre-registered visitors will appear here when they are expected at the gate.'
                : undefined
            }
          />
        </Card>
      )}
    </div>
  );
}

export function ExpectedArrivalsPage() {
  return <PendingApprovalsPage variant="expected" />;
}
