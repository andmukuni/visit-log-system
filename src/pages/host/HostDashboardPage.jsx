import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, ClipboardList, UserCheck, Users, Clock } from 'lucide-react';
import { RefreshAction, ActionToolbar, LoadingButton } from '../../components/ui';
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
import { useToast } from '../../context/ToastContext';
import { hostApi } from '../../utils/visitorApi';

export default function HostDashboardPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
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

  const available = data?.host?.availability !== 'unavailable';

  const markAvailability = async (availability) => {
    setSavingAvailability(true);
    try {
      await hostApi.setAvailability(availability);
      setData((prev) => (prev?.host
        ? { ...prev, host: { ...prev.host, availability } }
        : prev));
      toast.success(
        availability === 'available'
          ? 'You are marked available for reception.'
          : 'You are marked not available for reception.',
      );
    } catch (err) {
      toast.error(err.message || 'Unable to update availability.');
    } finally {
      setSavingAvailability(false);
    }
  };

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
              subtitle={`${data.completed} completed · ${data.pendingApprovals} awaiting approval${available ? '' : ' · Not available'}`}
            />
            {data.host ? (
              <DashboardInfoCard title="Your availability" variant={available ? 'blue' : 'amber'}>
                <p className="mb-3 text-sm">
                  Reception sees you as{' '}
                  <span className="font-semibold">{available ? 'Available' : 'Not available'}</span>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <LoadingButton
                    size="sm"
                    loading={savingAvailability && available}
                    disabled={savingAvailability || available}
                    onClick={() => void markAvailability('available')}
                    className="bg-emerald-600 hover:bg-emerald-500 border-emerald-600"
                  >
                    Mark available
                  </LoadingButton>
                  <LoadingButton
                    size="sm"
                    variant="secondary"
                    loading={savingAvailability && !available}
                    disabled={savingAvailability || !available}
                    onClick={() => void markAvailability('unavailable')}
                  >
                    Mark not available
                  </LoadingButton>
                </div>
              </DashboardInfoCard>
            ) : null}
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
