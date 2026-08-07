import { useCallback, useEffect, useMemo, useState } from 'react';
import { Siren, AlertTriangle, Shield, Search, Users, Clock } from 'lucide-react';
import { RefreshAction, ActionToolbar } from '../../components/ui';
import {
  PortalDashboardLayout,
  ActivityFeedPanel,
  MetricsSection,
  WeeklyBarChart,
  HighlightBalanceCard,
  QuickActionList,
  DashboardInfoCard,
  RollCallBanner,
  buildWeeklySeries,
  metricTarget,
} from '../../components/dashboard';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await securityApi.getDashboard());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const weeklyData = useMemo(
    () => buildWeeklySeries(data?.recentActivity, data?.currentlyInside),
    [data],
  );

  return (
    <PortalDashboardLayout
      title="Overview"
      subtitle={data?.scope?.siteName ? `${data.scope.siteName} — live security overview` : undefined}
      actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      loading={loading}
      error={error}
      left={<ActivityFeedPanel items={data?.recentActivity || []} tabs={['History', 'Pending', 'Today']} />}
      center={
        data && (
          <>
            {data.activeRollCall && (
              <RollCallBanner rollCall={data.activeRollCall} to={`/security/roll-call/${data.activeRollCall.id}`} />
            )}
            <MetricsSection
              title="Security metrics"
              cards={[
                { title: 'Pending approvals', value: data.pendingApprovals, target: metricTarget(data.pendingApprovals), accent: 'purple' },
                { title: 'Overdue visits', value: data.overdueVisits, target: metricTarget(data.overdueVisits), accent: 'orange' },
              ]}
            />
            <WeeklyBarChart title="Activity this week" subtitle="Security events" data={weeklyData} />
          </>
        )
      }
      right={
        data && (
          <>
            <HighlightBalanceCard
              title="On site now"
              value={data.currentlyInside}
              subtitle={`${data.exceptionsToday} exceptions today · ${data.openIncidents} open incidents`}
            />
            <QuickActionList
              items={[
                { label: 'Emergency roll call', icon: Siren, to: '/security/roll-call' },
                { label: 'Report incident', icon: AlertTriangle, to: '/security/incidents' },
                { label: 'Watchlist', icon: Shield, to: '/security/watchlist' },
                { label: 'Search visitors', icon: Search, to: '/security/visitors' },
                { label: 'Pending approvals', icon: Clock, to: '/security/approvals' },
                { label: 'Occupancy', icon: Users, to: '/security/occupancy' },
              ]}
            />
            <DashboardInfoCard title="Watchlist & incidents">
              {data.watchlistEntries} active watchlist entries · Review exceptions and overdue visits promptly.
            </DashboardInfoCard>
          </>
        )
      }
    />
  );
}
