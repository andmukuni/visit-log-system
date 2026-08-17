import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
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
  VisitStatusBadge,
  ViewAllAction,
} from '../../components/ui';
import { DashboardOverviewLayout, metricTarget } from '../../components/dashboard';
import { formatDateTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

const EVENT_LABELS = {
  registered: 'Registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Check-in',
  checked_out: 'Check-out',
  arrived_at_gate: 'Arrived at gate',
};

const EVENT_ICONS = {
  registered: UserPlus,
  approved: CheckCircle,
  checked_in: LogIn,
  checked_out: LogOut,
  rejected: XCircle,
};

function formatEventType(type) {
  return EVENT_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

export default function StationDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await visitorApi.getStationDashboard());
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

  const metricsSection = data ? {
    title: '',
    variant: 'overview',
    cards: [
      {
        title: 'Visitors today',
        value: data.visitorsToday,
        target: metricTarget(data.visitorsToday, 5, 20),
        accent: 'light',
        icon: UserCheck,
      },
      {
        title: 'Pending approvals',
        value: data.pendingApprovals,
        target: metricTarget(data.pendingApprovals),
        accent: 'charcoal',
        icon: Clock,
      },
      {
        title: 'On site now',
        value: data.currentlyInside,
        target: metricTarget(data.currentlyInside, 5, 20),
        accent: 'light',
        icon: Users,
      },
      {
        title: 'Overdue visits',
        value: data.overdueVisits,
        target: metricTarget(data.overdueVisits),
        accent: 'charcoal',
        icon: AlertTriangle,
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
      render: (_, row) => <VisitStatusBadge visit={row} status={row.visit_status} />,
    },
  ];

  const subtitle = data?.scope
    ? `${data.scope.stationName || data.scope.siteName} · ${data.scope.siteName}`
    : 'Station overview';

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Station Overview"
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
              trend: data.visitTrend ?? data.eventTrend,
              emptyLabel: 'No visitor activity this week yet.',
            }}
            donutChart={{
              title: 'Recent month',
              subtitle: 'Events',
              centerTitle: 'Event mix',
              centerIcon: Shield,
              data: donutData,
              nameKey: 'event_label',
              valueKey: 'total',
              centerMetric: 'total',
              maxLegendItems: 8,
              emptyLabel: 'No event data yet.',
              totalLabel: 'events',
            }}
          />

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card title="Vehicles today" subtitle="Registered at gate">
              <p className="text-3xl font-bold text-navy-900">{data.vehiclesToday}</p>
            </Card>
            <Card title="Denied today" subtitle="Rejected or denied visits">
              <p className="text-3xl font-bold text-navy-900">{data.deniedRejected}</p>
            </Card>
            <Card title="Quick links" subtitle="Common station tasks">
              <div className="flex flex-wrap gap-2">
                <Link to="/station/gate-entry?tab=checkin" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <LogIn size={14} aria-hidden="true" />
                  Checkin
                </Link>
                <Link to="/station/gate-entry?tab=checkout" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <LogOut size={14} aria-hidden="true" />
                  Checkout
                </Link>
                <Link to="/station/visitors" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <ClipboardList size={14} aria-hidden="true" />
                  Visitor logs
                </Link>
                <Link to="/station/pending" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
                  <Users size={14} aria-hidden="true" />
                  Pending
                </Link>
              </div>
            </Card>
          </div>

          <Card
            title="Recent activity"
            subtitle="Latest visitor events at this station"
            actions={<ViewAllAction to="/station/visitors" label="View visitor logs" />}
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
              emptyDescription="Gate check-ins, approvals, and check-outs will appear here."
              onRowClick={(row) => {
                if (row.visit_id) navigate(`/station/visitors/${row.visit_id}`);
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
