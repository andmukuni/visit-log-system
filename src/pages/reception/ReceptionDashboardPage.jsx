import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle,
  ClipboardList,
  Clock,
  LogIn,
  LogOut,
  Shield,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Card,
  DataTable,
  PageHeader,
  RefreshAction,
  ActionToolbar,
  Spinner,
  StatusBadge,
  ViewAllAction,
} from '../../components/ui';
import { DashboardOverviewLayout } from '../../components/dashboard';
import { formatDateTime } from '../../utils/helpers';
import { receptionApi } from '../../utils/visitorApi';

const EVENT_LABELS = {
  registered: 'Registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Check-in',
  checked_out: 'Check-out',
  arrived_at_gate: 'Arrived at gate',
  reception_check_in: 'Reception check-in',
  waiting_at_reception: 'Waiting at reception',
};

const EVENT_ICONS = {
  registered: UserPlus,
  approved: CheckCircle,
  checked_in: LogIn,
  checked_out: LogOut,
  rejected: XCircle,
  reception_check_in: UserCheck,
};

function formatEventType(type) {
  return EVENT_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

export default function ReceptionDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await receptionApi.getDashboard());
    } catch (err) {
      setError(err.message || 'Unable to load dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const targets = data?.targets || {};

  const metricsSection = data ? {
    title: '',
    variant: 'overview',
    cards: [
      {
        title: 'Expected today',
        value: data.expectedToday,
        target: targets.expectedToday ?? data.scheduledToday ?? null,
        accent: 'light',
        icon: CalendarDays,
      },
      {
        title: 'Pending approvals',
        value: data.pendingApprovals,
        showProgress: false,
        accent: 'charcoal',
        icon: Clock,
      },
      {
        title: 'On-site at desk',
        value: data.checkedInAtDesk,
        target: targets.checkedInAtDesk ?? data.scheduledToday ?? null,
        accent: 'light',
        icon: Users,
      },
      {
        title: 'Waiting for host',
        value: data.waitingForHost,
        target: targets.waitingForHost ?? null,
        showProgress: (targets.waitingForHost ?? 0) > 0,
        accent: 'charcoal',
        icon: UserCheck,
      },
    ],
  } : null;

  const donutData = useMemo(
    () => (data?.eventsByType || []).map((row) => ({
      ...row,
      event_label: formatEventType(row.event_type),
      icon: EVENT_ICONS[row.event_type] || Shield,
    })),
    [data?.eventsByType],
  );

  const activityColumns = [
    {
      key: 'created_at',
      label: 'Time',
      render: (_, row) => formatDateTime(row.created_at),
    },
    { key: 'visitor_name', label: 'Visitor' },
    {
      key: 'event_type',
      label: 'Event',
      render: (_, row) => formatEventType(row.event_type),
    },
    {
      key: 'visit_status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.visit_status} />,
    },
  ];

  const checkInColumns = [
    { key: 'full_name', label: 'Visitor', render: (value, row) => value || row.visitor_name || '—' },
    { key: 'host_name', label: 'Host', render: (value) => value || '—' },
    { key: 'department_name', label: 'Department', render: (value) => value || '—' },
    {
      key: 'scheduled_at',
      label: 'Expected',
      render: (_, row) => formatDateTime(row.scheduled_at || row.expected_at),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status || row.visit_status} />,
    },
  ];

  const subtitle = data?.scope
    ? `${data.scope.siteName || 'Site'} · Reception desk`
    : 'Reception overview';

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Reception Dashboard"
        subtitle={subtitle}
        iconKey="dashboard"
        actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      />

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      )}

      {!loading && error && (
        <Card title="Dashboard error" className="mb-6">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {!loading && data && (
        <>
          <DashboardOverviewLayout
            metricsSection={metricsSection}
            lineChart={{
              title: 'Visitor activity',
              data: data.weeklyTrend,
              trend: data.visitTrend,
              emptyLabel: 'No visits recorded in the last 7 days yet.',
            }}
            donutChart={{
              title: 'Recent month',
              subtitle: 'Events',
              centerTitle: 'Event mix',
              centerIcon: Shield,
              data: donutData,
              nameKey: 'event_label',
              valueKey: 'total',
              emptyLabel: 'No event data yet.',
              totalLabel: 'events',
            }}
          />

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card title="Hosts occupied" subtitle="Currently in a visit">
              <p className="text-3xl font-bold text-navy-900">{data.hostsOccupied}</p>
              <Link to="/reception/hosts" className="mt-3 inline-flex text-sm font-medium text-cyan-700 hover:text-cyan-800">
                View host availability
              </Link>
            </Card>
            <Card title="Check-in today" subtitle="Appointments across all hosts">
              <p className="text-3xl font-bold text-navy-900">{(data.checkInAppointments || []).length}</p>
              <Link to="/reception/check-in" className="mt-3 inline-flex text-sm font-medium text-cyan-700 hover:text-cyan-800">
                Open check-in desk
              </Link>
            </Card>
            <Card title="Quick links" subtitle="Common reception tasks">
              <div className="flex flex-wrap gap-2">
                <Link to="/reception/check-in" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <LogIn size={14} aria-hidden="true" />
                  Check-in
                </Link>
                <Link to="/reception/register" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <UserPlus size={14} aria-hidden="true" />
                  Register
                </Link>
                <Link to="/reception/host-queue" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <Users size={14} aria-hidden="true" />
                  Host queue
                </Link>
                <Link to="/reception/visitors" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <ClipboardList size={14} aria-hidden="true" />
                  Visitor logs
                </Link>
              </div>
            </Card>
          </div>

          <Card
            title="Today's check-in appointments"
            subtitle="All hosts at this site — ready for reception check-in"
            actions={<ViewAllAction to="/reception/check-in" label="Open check-in desk" />}
            className="mb-6"
          >
            <DataTable
              embedded
              toolbar={{
                placeholder: 'Search by visitor, host, or department…',
                searchKeys: ['full_name', 'visitor_name', 'host_name', 'department_name', 'status'],
              }}
              columns={checkInColumns}
              data={data.checkInAppointments || []}
              emptyTitle="No check-in appointments today"
              emptyDescription="Scheduled visits for today across all hosts will appear here."
              onRowClick={(row) => {
                const visitId = row.id || row.visit_id;
                if (visitId) navigate(`/reception/visitors/${visitId}`);
              }}
            />
          </Card>

          <Card
            title="Recent activity"
            subtitle="Latest visitor events at reception"
            actions={<ViewAllAction to="/reception/visitors" label="View visitor logs" />}
          >
            <DataTable
              embedded
              toolbar={{
                placeholder: 'Search activity…',
                searchKeys: ['visitor_name', 'event_type', 'visit_status'],
              }}
              columns={activityColumns}
              data={data.recentActivity || []}
              emptyTitle="No activity yet"
              emptyDescription="Check-ins, approvals, and host queue events will appear here."
              onRowClick={(row) => {
                if (row.visit_id) navigate(`/reception/visitors/${row.visit_id}`);
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
