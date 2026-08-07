import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Users, Download, Archive, Shield, AlertTriangle } from 'lucide-react';
import { RefreshAction, ActionToolbar } from '../../components/ui';
import {
  PortalDashboardLayout,
  AuditFeedPanel,
  MetricsSection,
  CategoryBarChart,
  HighlightBalanceCard,
  QuickActionList,
  DashboardInfoCard,
  metricTarget,
} from '../../components/dashboard';
import { complianceApi } from '../../utils/visitorApi';

export default function ComplianceDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await complianceApi.getDashboard());
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

  const chartItems = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Audit', value: data.auditToday },
      { label: 'Exports', value: data.exportsToday },
      { label: 'Approvals', value: data.approvalsToday },
      { label: 'Privacy', value: data.openPrivacy },
      { label: 'Incidents', value: data.openIncidents },
    ];
  }, [data]);

  return (
    <PortalDashboardLayout
      title="Overview"
      subtitle="Audit activity, privacy requests and regulatory oversight"
      actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      loading={loading}
      error={error}
      left={<AuditFeedPanel items={data?.recentAudit || []} />}
      center={
        data && (
          <>
            <MetricsSection
              title="Today's compliance"
              cards={[
                { title: 'Audit events', value: data.auditToday, target: metricTarget(data.auditToday), accent: 'blue' },
                { title: 'Exports', value: data.exportsToday, target: metricTarget(data.exportsToday), accent: 'purple' },
              ]}
            />
            <CategoryBarChart title="Compliance breakdown" subtitle="Today & open items" items={chartItems} accent="blue" />
          </>
        )
      }
      right={
        data && (
          <>
            <HighlightBalanceCard
              title="Open privacy requests"
              value={data.openPrivacy}
              subtitle={`${data.openIncidents} open incidents · ${data.approvalsToday} approvals today`}
              badge="Open"
            />
            <QuickActionList
              items={[
                { label: 'Audit trail', icon: FileText, to: '/compliance/audit' },
                { label: 'User access review', icon: Users, to: '/compliance/access' },
                { label: 'Compliance reports', icon: Download, to: '/compliance/reports' },
                { label: 'Retention policies', icon: Archive, to: '/compliance/retention' },
                { label: 'Privacy requests', icon: Shield, to: '/compliance/privacy' },
                { label: 'Incidents', icon: AlertTriangle, to: '/compliance/incidents' },
              ]}
            />
            <DashboardInfoCard title="Regulatory oversight">
              Monitor audit logs, export activity, and open privacy requests across your organisation.
            </DashboardInfoCard>
          </>
        )
      }
    />
  );
}
