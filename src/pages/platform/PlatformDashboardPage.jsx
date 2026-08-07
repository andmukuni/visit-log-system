import { useCallback, useEffect, useState } from 'react';
import { Building2, Users, ClipboardList, UserCheck } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  Spinner,
  RefreshAction,
  ActionToolbar,
  ViewAllAction,
} from '../../components/ui';
import { DashboardOverviewLayout } from '../../components/dashboard';
import { formatDateTime } from '../../utils/helpers';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await platformApi.getDashboard());
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

  const kpis = [
    {
      label: 'Organisations',
      value: data?.organisations ?? 0,
      icon: Building2,
      footer: `${data?.activeOrganisations ?? 0} active tenants`,
      to: '/platform/organisations',
    },
    {
      label: 'Platform users',
      value: data?.users ?? 0,
      icon: Users,
      footer: 'Administrators and support accounts',
      to: '/platform/users',
    },
    {
      label: 'On site now',
      value: data?.checkedInNow ?? 0,
      icon: UserCheck,
      footer: 'Visitors currently checked in',
    },
  ];

  const sideKpi = {
    label: 'Visits today',
    value: data?.visitsToday ?? 0,
    icon: ClipboardList,
    trend: data?.visitTrend,
    trendLabel: 'vs yesterday',
  };

  const auditColumns = [
    {
      key: 'created_at',
      label: 'Time',
      render: (_, row) => formatDateTime(row.created_at),
    },
    { key: 'action', label: 'Action' },
    { key: 'actor_name', label: 'User' },
    { key: 'organisation_name', label: 'Organisation' },
    {
      key: 'result',
      label: 'Result',
      render: (_, row) => (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          row.result === 'success' || row.result === 'allowed'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-red-100 text-red-700'
        }`}
        >
          {row.result || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Platform Dashboard"
        subtitle="Multi-organisation overview and system health"
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
            kpis={kpis}
            sideKpi={sideKpi}
            lineChart={{
              title: 'Visit statistics',
              data: data.weeklyTrend || data.weeklyVisits,
              trend: data?.visitTrend,
              emptyLabel: 'No visit data for this week yet.',
              detailLink: '/platform/log-book',
            }}
            donutChart={{
              title: 'Recent month',
              subtitle: 'Visitors',
              centerTitle: 'Organisation share',
              centerIcon: Building2,
              data: data.visitsByOrganisation || [],
              nameKey: 'organisation_name',
              valueKey: 'total',
              emptyLabel: 'No organisation visit data yet.',
            }}
          />

          <Card
            title="Recent audit activity"
            subtitle="Latest platform-wide security and admin actions"
            actions={<ViewAllAction to="/platform/audit" label="View all audit logs" />}
          >
            <DataTable
              embedded
              toolbar={{
                placeholder: 'Search audit events…',
                searchKeys: ['action', 'actor_name', 'organisation_name', 'result'],
              }}
              columns={auditColumns}
              data={data.recentAudit || []}
              emptyTitle="No audit events yet"
              emptyDescription="Administrative actions will appear here as they occur."
            />
          </Card>
        </>
      )}
    </div>
  );
}
