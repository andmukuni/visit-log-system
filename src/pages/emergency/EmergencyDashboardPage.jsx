import { useCallback, useEffect, useState } from 'react';
import { Siren, Users, ExternalLink, AlertTriangle } from 'lucide-react';
import { RefreshAction, ActionToolbar } from '../../components/ui';
import {
  PortalDashboardLayout,
  RecordFeedPanel,
  MetricsSection,
  HighlightBalanceCard,
  QuickActionList,
  DashboardInfoCard,
  RollCallBanner,
  metricTarget,
} from '../../components/dashboard';
import { formatDateTime } from '../../utils/helpers';
import { emergencyApi } from '../../utils/visitorApi';

export default function EmergencyDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await emergencyApi.getDashboard());
    } catch (err) {
      setError(err?.message || 'Unable to load dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const readinessItems = data
    ? [
        {
          id: 'on-site',
          title: 'People on site',
          subtitle: 'Currently checked in',
          badge: data.currentlyInside,
          badgeLabel: 'Live',
        },
        {
          id: 'unresolved',
          title: 'Unresolved in roll call',
          subtitle: data.activeRollCall ? 'Active roll call' : 'No active roll call',
          badge: data.unresolved,
          badgeLabel: 'Pending',
        },
        {
          id: 'roll-call',
          title: data.activeRollCall ? 'Roll call in progress' : 'No roll call active',
          subtitle: data.activeRollCall
            ? `Started ${formatDateTime(data.activeRollCall.startedAt)}`
            : 'Start a roll call to snapshot everyone on site',
          to: data.activeRollCall ? `/emergency/roll-call/${data.activeRollCall.id}` : '/emergency/roll-call/new',
        },
      ]
    : [];

  return (
    <PortalDashboardLayout
      title="Overview"
      subtitle={data?.scope?.siteName ? `${data.scope.siteName} — evacuation readiness` : undefined}
      actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      loading={loading}
      error={error}
      left={<RecordFeedPanel title="Evacuation readiness" items={readinessItems} emptyMessage="No readiness data." />}
      center={
        data && (
          <>
            {data.activeRollCall ? (
              <RollCallBanner rollCall={data.activeRollCall} to={`/emergency/roll-call/${data.activeRollCall.id}`} />
            ) : (
              <DashboardInfoCard title="No active roll call" variant="amber">
                Start a roll call to snapshot everyone currently on site and track accountability.
              </DashboardInfoCard>
            )}
            <MetricsSection
              title="Headcount"
              cards={[
                { title: 'On site now', value: data.currentlyInside, target: metricTarget(data.currentlyInside), accent: 'blue' },
                { title: 'Unresolved', value: data.unresolved, target: metricTarget(data.unresolved, 1), accent: 'orange' },
              ]}
            />
          </>
        )
      }
      right={
        data && (
          <>
            <HighlightBalanceCard
              title="On site now"
              value={data.currentlyInside}
              subtitle={data.activeRollCall ? `${data.unresolved} not yet accounted for` : 'No active roll call'}
              badge={data.activeRollCall ? 'Roll call' : 'Live'}
            />
            <QuickActionList
              items={[
                { label: data.activeRollCall ? 'Open roll call' : 'Start roll call', icon: Siren, to: data.activeRollCall ? `/emergency/roll-call/${data.activeRollCall.id}` : '/emergency/roll-call/new' },
                { label: 'Live occupancy', icon: Users, to: '/emergency/occupancy' },
                { label: 'Unresolved entries', icon: AlertTriangle, to: '/emergency/unresolved' },
                { label: 'Roll call history', icon: ExternalLink, to: '/emergency/roll-call' },
              ]}
            />
            <DashboardInfoCard title="Auto-refresh">
              This dashboard refreshes every 30 seconds during an active emergency.
            </DashboardInfoCard>
          </>
        )
      }
    />
  );
}
