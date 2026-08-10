import { useCallback, useEffect, useState } from 'react';
import { MapPin, Users, ClipboardList, Clock3, Building2 } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  RefreshAction,
  ActionToolbar,
} from '../../components/ui';
import { DashboardOverviewLayout } from '../../components/dashboard';
import { formatDateTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await visitorApi.getOrgDashboard());
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

  const orgName = data?.scope?.organisation_name;

  const kpis = [
    {
      label: 'Sites',
      value: data?.sites ?? 0,
      icon: MapPin,
      footer: 'Branches & facilities configured',
      to: '/admin/sites',
    },
    {
      label: 'System users',
      value: data?.users ?? 0,
      icon: Users,
      footer: 'Staff accounts across the organisation',
      to: '/admin/users',
    },
    {
      label: 'Pending approvals',
      value: data?.pendingApprovals ?? 0,
      icon: Clock3,
      footer: 'Awaiting host or admin action',
    },
  ];

  const sideKpi = {
    label: 'Visits today',
    value: data?.visitsToday ?? 0,
    icon: ClipboardList,
    trend: data?.visitTrend,
    trendLabel: 'vs yesterday',
  };

  const columns = [
    {
      key: 'created_at',
      label: 'Date',
      render: (_, row) => formatDateTime(row.created_at),
    },
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    { key: 'site_name', label: 'Site' },
    { key: 'category_name', label: 'Category' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Admin Dashboard"
        subtitle={orgName ? `${orgName} — organisation overview and operational metrics` : 'Organisation overview and operational metrics'}
        breadcrumbs={[{ label: 'Administration', to: '/admin' }, { label: 'Dashboard' }]}
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
            }}
            donutChart={{
              title: 'Organisation stats',
              subtitle: 'Visits by organisation',
              centerTitle: 'Organisation share',
              centerIcon: Building2,
              data: data.visitsByOrganisation || [],
              nameKey: 'organisation_name',
              valueKey: 'total',
              emptyLabel: 'No organisation visit data yet.',
            }}
          />

          <Card title="Recent visits" subtitle="Latest visitor registrations and check-ins">
            <DataTable
              embedded
              toolbar={{
                placeholder: 'Search visitors, hosts, sites…',
                searchKeys: ['visitor_name', 'host_name', 'site_name', 'category_name', 'status'],
              }}
              columns={columns}
              data={data.recentVisits || []}
              emptyTitle="No visits yet"
              emptyDescription="Visitor records will appear here as they are registered."
            />
          </Card>
        </>
      )}
    </div>
  );
}
