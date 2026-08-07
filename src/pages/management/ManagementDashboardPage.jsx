import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, History, Users, BarChart3 } from 'lucide-react';
import { RefreshAction, ActionToolbar } from '../../components/ui';
import {
  PortalDashboardLayout,
  RecordFeedPanel,
  MetricsSection,
  CategoryBarChart,
  HighlightBalanceCard,
  QuickActionList,
  DashboardInfoCard,
  metricTarget,
} from '../../components/dashboard';
import { reportsApi } from '../../utils/visitorApi';

const STATUS_LABELS = {
  pending_approval: 'Pending approval',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  approved: 'Approved',
  rejected: 'Rejected',
  denied: 'Denied',
  overdue: 'Overdue',
};

export default function ManagementDashboardPage() {
  const [summary, setSummary] = useState([]);
  const [occupancy, setOccupancy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryData, occupancyData] = await Promise.all([
        reportsApi.preview({ type: 'summary', limit: 20 }),
        reportsApi.preview({ type: 'occupancy', limit: 1 }),
      ]);
      setSummary(summaryData.rows || []);
      setOccupancy(occupancyData);
    } catch (err) {
      setError(err?.message || 'Unable to load dashboard.');
      setSummary([]);
      setOccupancy(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSite = occupancy?.total || 0;
  const pending = summary.find((r) => r.status === 'pending_approval')?.count || 0;
  const checkedIn = summary.find((r) => r.status === 'checked_in')?.count || 0;
  const exceptions = summary
    .filter((r) => ['rejected', 'denied', 'overdue'].includes(r.status))
    .reduce((acc, r) => acc + Number(r.count || 0), 0);

  const feedItems = useMemo(
    () =>
      summary.map((row) => ({
        id: row.status,
        title: STATUS_LABELS[row.status] || row.status,
        subtitle: 'Visit status',
        badge: row.count,
        badgeLabel: 'Count',
      })),
    [summary],
  );

  const chartItems = useMemo(
    () =>
      summary.slice(0, 5).map((row) => ({
        label: (STATUS_LABELS[row.status] || row.status).split(' ')[0],
        value: row.count,
      })),
    [summary],
  );

  return (
    <PortalDashboardLayout
      title="Overview"
      subtitle="Executive summary — personal fields masked per policy"
      actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      loading={loading}
      error={error}
      left={<RecordFeedPanel title="Visit status summary" items={feedItems} emptyMessage="No visit data." />}
      center={
        <>
          <MetricsSection
            title="Key indicators"
            cards={[
              { title: 'Checked in', value: checkedIn, target: metricTarget(checkedIn), accent: 'blue' },
              { title: 'Pending approvals', value: pending, target: metricTarget(pending), accent: 'purple' },
            ]}
          />
          <CategoryBarChart title="Status distribution" subtitle="Current period" items={chartItems} accent="purple" />
        </>
      }
      right={
        <>
          <HighlightBalanceCard
            title="On site now"
            value={onSite}
            subtitle={`${exceptions} exceptions in period`}
            badge="Live"
          />
          <QuickActionList
            items={[
              { label: 'Generate report', icon: FileText, to: '/management/reports' },
              { label: 'Export history', icon: History, to: '/management/exports' },
              { label: 'Live occupancy', icon: Users, to: '/management/occupancy' },
              { label: 'Analytics', icon: BarChart3, to: '/management/reports' },
            ]}
          />
          {occupancy?.maskLevel && (
            <DashboardInfoCard title="Data masking">
              Occupancy data masking level: {occupancy.maskLevel}
            </DashboardInfoCard>
          )}
        </>
      }
    />
  );
}
