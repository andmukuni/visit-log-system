import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, AlertTriangle, ShieldAlert, UserCheck, Shield, UserPlus, CheckCircle, LogIn, LogOut, XCircle } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  Spinner,
  RefreshAction,
  ActionToolbar,
  ViewAllAction,
  StatusBadge,
} from '../../components/ui';
import { DashboardOverviewLayout, RollCallBanner, metricTarget } from '../../components/dashboard';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

const EVENT_LABELS = {
  registered: 'Registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Check-in',
  checked_out: 'Check-out',
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

export default function SecurityDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await securityApi.getDashboard());
    } catch (err) {
      setError(err?.message || 'Unable to load dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metricsSection = data ? {
    title: 'Security metrics',
    variant: 'overview',
    cards: [
      {
        title: 'Pending approvals',
        value: data.pendingApprovals,
        target: metricTarget(data.pendingApprovals),
        accent: 'charcoal',
        icon: Clock,
      },
      {
        title: 'Overdue visits',
        value: data.overdueVisits,
        target: metricTarget(data.overdueVisits),
        accent: 'light',
        icon: AlertTriangle,
      },
      {
        title: 'Open incidents',
        value: data.openIncidents,
        target: metricTarget(data.openIncidents),
        accent: 'charcoal',
        icon: ShieldAlert,
      },
      {
        title: 'On site now',
        value: data.currentlyInside,
        target: metricTarget(data.currentlyInside, 5, 20),
        accent: 'light',
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

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Security Dashboard"
        subtitle={data?.scope?.siteName ? `${data.scope.siteName} — live security overview` : 'Live security overview'}
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
          {data.activeRollCall && (
            <div className="mb-6">
              <RollCallBanner rollCall={data.activeRollCall} to={`/security/roll-call/${data.activeRollCall.id}`} />
            </div>
          )}

          <DashboardOverviewLayout
            metricsSection={metricsSection}
            lineChart={{
              title: 'Visitor activity',
              data: data.weeklyTrend,
              trend: data?.visitTrend ?? data?.eventTrend,
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
              emptyLabel: 'No event data yet.',
              totalLabel: 'events',
            }}
          />

          <Card
            title="Recent activity"
            subtitle="Latest visitor and security events"
            actions={<ViewAllAction to="/security/audit" label="View all activity" />}
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
              emptyDescription="Visitor check-ins, approvals, and security events will appear here."
              onRowClick={(row) => {
                if (row.visit_id) navigate(`/security/visitors/${row.visit_id}`);
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
