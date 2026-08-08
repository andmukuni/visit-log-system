import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Users,
  Clock,
  Star,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  IconButton,
  ActionToolbar,
} from '../../components/ui';
import { HighlightBalanceCard, DashboardInfoCard } from '../../components/dashboard';
import { formatDateTime, formatTime } from '../../utils/helpers';
import { executiveApi } from '../../utils/visitorApi';

function KpiCard({ label, value, hint, accent = 'blue' }) {
  const accents = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };

  return (
    <div className={`rounded-2xl border p-5 ${accents[accent] || accents.blue}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs opacity-70">{hint}</p>}
    </div>
  );
}

export default function ExecutiveDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await executiveApi.getDashboard());
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

  const scheduleColumns = [
    {
      key: 'scheduled_at',
      label: 'Time',
      render: (_, row) => formatTime(row.scheduled_at),
    },
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'company', label: 'Company' },
    {
      key: 'classification',
      label: 'Type',
      render: (_, row) => (
        <span className="capitalize">{row.classification || 'standard'}</span>
      ),
    },
    {
      key: 'visit_status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.visit_status} />,
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={32} />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const executive = data?.executive || {};
  const next = data?.nextAppointment;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${executive.name?.split(' ')[0] || 'Executive'}`}
        subtitle={`${executive.title || 'Executive'} office — your appointments and visitors at a glance`}
        breadcrumbs={[{ label: executive.title || 'Executive', to: '/executive' }, { label: 'Dashboard' }]}
        actions={(
          <ActionToolbar>
            <IconButton icon={RefreshCw} label="Refresh" tooltip="Refresh" variant="ghost" onClick={load} />
          </ActionToolbar>
        )}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Today's appointments" value={kpis.todayAppointments ?? 0} hint="Scheduled for today" accent="blue" />
            <KpiCard label="This week" value={kpis.weekAppointments ?? 0} hint="Upcoming 7 days" accent="purple" />
            <KpiCard label="Visitors on-site" value={kpis.onSiteNow ?? 0} hint="For your meetings now" accent="emerald" />
            <KpiCard label="Awaiting approval" value={kpis.pendingApprovals ?? 0} hint="Need your decision" accent="amber" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2 space-y-6">
              <Card
                title="Today's schedule"
                subtitle={`${data.todaySchedule?.length || 0} appointments`}
                actions={(
                  <Link to="/executive/appointments" className="text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                    View all
                    <ArrowRight size={14} />
                  </Link>
                )}
              >
                <DataTable
                  embedded
                  columns={scheduleColumns}
                  data={data.todaySchedule || []}
                  emptyTitle="No appointments today"
                  emptyDescription="Your calendar is clear for today."
                  toolbar={{ placeholder: 'Search visitors…', searchKeys: ['visitor_name', 'company', 'title'] }}
                />
              </Card>
            </div>

            <div className="space-y-4">
              {next ? (
                <HighlightBalanceCard
                  title="Next appointment"
                  value={formatTime(next.scheduled_at)}
                  subtitle={`${next.visitor_name}${next.company ? ` · ${next.company}` : ''}`}
                  badge={next.classification?.toUpperCase() || 'VISITOR'}
                />
              ) : (
                <DashboardInfoCard title="Next appointment" variant="blue">
                  No upcoming appointments scheduled.
                </DashboardInfoCard>
              )}

              <Card title="Quick links">
                <div className="space-y-2">
                  {[
                    { label: 'My appointments', to: '/executive/appointments', icon: CalendarDays },
                    { label: 'My visitors', to: '/executive/visitors', icon: Users },
                    { label: 'Pending approvals', to: '/executive/visitors?status=pending_approval', icon: Clock },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <span className="inline-flex items-center gap-2">
                        <item.icon size={16} className="text-gray-400" />
                        {item.label}
                      </span>
                      <ArrowRight size={14} className="text-gray-400" />
                    </Link>
                  ))}
                </div>
              </Card>

              {(kpis.vipToday ?? 0) > 0 && (
                <DashboardInfoCard title="VIP arrivals today" variant="blue">
                  <span className="inline-flex items-center gap-2">
                    <Star size={16} />
                    {kpis.vipToday} VIP/VVIP visitor{kpis.vipToday === 1 ? '' : 's'} on your schedule today
                  </span>
                </DashboardInfoCard>
              )}

              <DashboardInfoCard title="This week">
                {kpis.completedThisWeek ?? 0} visit{kpis.completedThisWeek === 1 ? '' : 's'} completed this week
              </DashboardInfoCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
