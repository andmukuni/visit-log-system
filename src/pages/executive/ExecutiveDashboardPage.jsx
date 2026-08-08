import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Spinner } from '../../components/ui';
import ExecutiveWeekCalendar, { periodQueryRange, normalizePeriodStart } from '../../components/executive/ExecutiveWeekCalendar';
import ExecutiveDashboardHeaderActions from '../../components/executive/ExecutiveDashboardHeaderActions';
import { formatExecutiveDashboardDate } from '../../components/executive/ExecutiveDashboardWidgets';
import { executiveApi, notificationsApi } from '../../utils/visitorApi';
import { useAuth } from '../../context/AuthContext';

async function fetchWithRetry(fn, attempts = 2) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }
  throw lastError;
}

export default function ExecutiveDashboardPage() {
  const { isAuthenticated, permissions } = useAuth();
  const [weekStart, setWeekStart] = useState(() => normalizePeriodStart(new Date(), 'week'));
  const [viewMode, setViewMode] = useState('week');
  const [dashboard, setDashboard] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newAppointmentTrigger, setNewAppointmentTrigger] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError('');

    const range = periodQueryRange(weekStart, viewMode);
    let dashboardData = null;
    let weekAppointments = [];
    const errors = [];

    try {
      dashboardData = await fetchWithRetry(() => executiveApi.getDashboard());
    } catch (err) {
      errors.push(err?.message || 'Unable to load dashboard summary.');
    }

    try {
      weekAppointments = await fetchWithRetry(() => executiveApi.getAppointments({
        from: range.from,
        to: range.to,
      })) || [];
    } catch (err) {
      errors.push(err?.message || 'Unable to load weekly appointments.');
    }

    setDashboard(dashboardData);
    setAppointments(weekAppointments);
    setError(errors.join(' '));
    setLoading(false);
  }, [weekStart, viewMode, isAuthenticated]);

  useEffect(() => {
    load();
  }, [load, permissions]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let cancelled = false;
    notificationsApi.list(true)
      .then((rows) => {
        if (!cancelled) setUnreadCount(Array.isArray(rows) ? rows.length : 0);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, dashboard]);

  const executive = dashboard?.executive || {};
  const kpis = dashboard?.kpis || {};
  const dashboardTitle = useMemo(() => {
    if (executive?.title) return `${executive.title} Dashboard`;
    return 'Executive Dashboard';
  }, [executive?.title]);

  const handleViewModeChange = useCallback((nextMode) => {
    setViewMode(nextMode);
    setWeekStart((current) => normalizePeriodStart(current, nextMode));
  }, []);

  const handleNewAppointment = useCallback(() => {
    setNewAppointmentTrigger((current) => current + 1);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--header-height)-var(--shell-content-padding-y))] min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={dashboardTitle}
        subtitle={formatExecutiveDashboardDate()}
        actions={(
          <ExecutiveDashboardHeaderActions
            onNewAppointment={handleNewAppointment}
            unreadCount={unreadCount}
          />
        )}
      />

      {error && (
        <div className="mb-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
          <button
            type="button"
            onClick={load}
            className="ml-3 font-medium text-amber-900 underline"
          >
            Retry
          </button>
        </div>
      )}

      <ExecutiveWeekCalendar
        className="min-h-0 flex-1 overflow-hidden"
        executive={executive}
        kpis={kpis}
        nextAppointment={dashboard?.nextAppointment}
        appointments={appointments}
        loading={loading}
        weekStart={weekStart}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onWeekChange={setWeekStart}
        onRefresh={load}
        newAppointmentTrigger={newAppointmentTrigger}
      />
    </div>
  );
}
