import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';

export default function AdminDashboardPage() {
  const {
    queryParams,
    label: orgFilterLabel,
    canSelect,
    organisationId,
    filterReady,
    loading: orgFilterLoading,
  } = useAdminOrganisation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!filterReady) return;
    setLoading(true);
    setError('');
    try {
      setData(await visitorApi.getOrgDashboard(queryParams));
    } catch (err) {
      setError(err?.message || 'Unable to load dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryParams, filterReady]);

  useEffect(() => {
    load();
  }, [load]);

  const orgName = data?.scope?.organisation_name || orgFilterLabel;
  const subtitle = canSelect
    ? `${orgName} — organisation overview and operational metrics`
    : (orgName
      ? `${orgName} — organisation overview and operational metrics`
      : 'Organisation overview and operational metrics');

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

  const donutChart = useMemo(() => {
    if (organisationId) {
      return {
        title: 'Site stats',
        subtitle: 'Visits by site for the selected organisation',
        centerTitle: 'Site share',
        centerIcon: MapPin,
        data: data?.visitsBySite || [],
        nameKey: 'site_name',
        valueKey: 'total',
        emptyLabel: 'No site visit data for this organisation yet.',
      };
    }
    return {
      title: 'Organisation stats',
      subtitle: 'Visits by organisation',
      centerTitle: 'Organisation share',
      centerIcon: Building2,
      data: data?.visitsByOrganisation || [],
      nameKey: 'organisation_name',
      valueKey: 'total',
      emptyLabel: 'No organisation visit data yet.',
    };
  }, [organisationId, data?.visitsBySite, data?.visitsByOrganisation]);

  const columns = [
    {
      key: 'created_at',
      label: 'Date',
      render: (_, row) => formatDateTime(row.created_at),
    },
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    ...(canSelect && !organisationId
      ? [{ key: 'organisation_name', label: 'Organisation' }]
      : []),
    { key: 'site_name', label: 'Site' },
    { key: 'category_name', label: 'Category' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} iconOnly />,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Admin Dashboard"
        subtitle={subtitle}
        breadcrumbs={[{ label: 'Administration', to: '/admin' }, { label: 'Dashboard' }]}
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      {(loading || orgFilterLoading) && (
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      )}

      {!loading && !orgFilterLoading && error && (
        <Card title="Dashboard error" className="mb-6">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {!loading && !orgFilterLoading && data && (
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
            donutChart={donutChart}
          />

          <Card title="Recent visits" subtitle="Latest visitor registrations and check-ins">
            <DataTable
              embedded
              toolbar={{
                placeholder: 'Search visitors, hosts, sites…',
                searchKeys: ['visitor_name', 'host_name', 'organisation_name', 'site_name', 'category_name', 'status'],
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
