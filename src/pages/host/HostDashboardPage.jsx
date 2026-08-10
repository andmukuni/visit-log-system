import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, ClipboardList, UserCheck, Users, Clock } from 'lucide-react';
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
import { hostApi } from '../../utils/visitorApi';

export default function HostDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await hostApi.getDashboard());
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
    () => buildWeeklySeries(data?.recentActivity, data?.onSite),
    [data],
  );

  return (
    <PortalDashboardLayout
      title="Overview"
      subtitle={data?.host ? `Hi ${data.host.name.split(' ')[0]} — your visitors and approvals` : undefined}
      actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      loading={loading}
      error={error}
      left={<ActivityFeedPanel title="Visitor activity" items={data?.recentActivity || []} tabs={['History', 'Pending', 'Today']} />}
      center={
        data && (
          <>
            <MetricsSection
              cards={[
                { title: 'Pending approvals', value: data.pendingApprovals, target: metricTarget(data.pendingApprovals), accent: 'purple' },
                { title: 'Approved today', value: data.approvedToday, target: metricTarget(data.approvedToday), accent: 'blue' },
              ]}
            />
            <WeeklyBarChart title="Your visitor flow" subtitle="Events this week" data={weeklyData} />
          </>
        )
      }
      right={
        data && (
          <>
            <HighlightBalanceCard
              title="Visitors on-site"
              value={data.onSite}
              subtitle={`${data.completed} completed · ${data.pendingApprovals} awaiting approval${data.onSite > 0 ? ' · You are occupied' : ''}`}
            />
            <QuickActionList
              items={[
                { label: 'Invite visitor', icon: UserPlus, to: '/host/invite' },
                { label: 'Approval queue', icon: ClipboardList, to: '/host/approvals' },
                { label: 'On-site visitors', icon: UserCheck, to: '/host/on-site' },
                { label: 'My contacts', icon: Users, to: '/host/contacts' },
                { label: 'Pending approvals', icon: Clock, to: '/host/approvals' },
              ]}
            />
            {data.host && (
              <DashboardInfoCard title="Your profile" variant="blue">
                {data.host.name} · {data.host.email}
              </DashboardInfoCard>
            )}
          </>
        )
      }
    />
  );
}
