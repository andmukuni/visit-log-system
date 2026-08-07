import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, LogIn, LogOut, Car, ClipboardList, Users } from 'lucide-react';
import { RefreshAction, ActionToolbar } from '../../components/ui';
import {
  PortalDashboardLayout,
  ActivityFeedPanel,
  MetricsSection,
  WeeklyBarChart,
  HighlightBalanceCard,
  QuickActionList,
  DashboardInfoCard,
  buildWeeklySeries,
  metricTarget,
} from '../../components/dashboard';
import { visitorApi } from '../../utils/visitorApi';

export default function StationDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await visitorApi.getStationDashboard());
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
    () => buildWeeklySeries(data?.recentActivity, data?.visitorsToday),
    [data],
  );

  return (
    <PortalDashboardLayout
      title="Overview"
      subtitle={data?.scope ? `${data.scope.stationName} · ${data.scope.siteName}` : undefined}
      actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      loading={loading}
      error={error}
      left={<ActivityFeedPanel items={data?.recentActivity || []} />}
      center={
        data && (
          <>
            <MetricsSection
              cards={[
                { title: 'Visitors today', value: data.visitorsToday, target: metricTarget(data.visitorsToday, 5, 20), accent: 'blue' },
                { title: 'Pending approvals', value: data.pendingApprovals, target: metricTarget(data.pendingApprovals), accent: 'purple' },
              ]}
            />
            <WeeklyBarChart title="Visitor flow" subtitle="Events this week" data={weeklyData} />
          </>
        )
      }
      right={
        data && (
          <>
            <HighlightBalanceCard
              value={data.currentlyInside}
              subtitle={`${data.visitorsToday} arrivals today · ${data.vehiclesToday} vehicles`}
            />
            <QuickActionList
              items={[
                { label: 'Register visitor', icon: UserPlus, to: '/station/visitors/new' },
                { label: 'Check in', icon: LogIn, to: '/station/check-in' },
                { label: 'Check out', icon: LogOut, to: '/station/check-out' },
                { label: 'Register vehicle', icon: Car, to: '/station/vehicles/new' },
                { label: 'Visitor logs', icon: ClipboardList, to: '/station/visitors' },
                { label: 'Pending approvals', icon: Users, to: '/station/pending' },
              ]}
            />
            <DashboardInfoCard title="Station alerts">
              Overdue visits: {data.overdueVisits} · Denied today: {data.deniedRejected}
            </DashboardInfoCard>
          </>
        )
      }
    />
  );
}
