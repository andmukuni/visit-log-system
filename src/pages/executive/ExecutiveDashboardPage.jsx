import { useCallback, useEffect, useState } from 'react';
import { PageHeader, ActionToolbar, Spinner } from '../../components/ui';
import ExecutiveWeekCalendar, { startOfWeek, weekQueryRange } from '../../components/executive/ExecutiveWeekCalendar';
import { executiveApi } from '../../utils/visitorApi';
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dashboard, setDashboard] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError('');

    const range = weekQueryRange(weekStart);
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
  }, [weekStart, isAuthenticated]);

  useEffect(() => {
    load();
  }, [load, permissions]);

  const executive = dashboard?.executive || {};
  const kpis = dashboard?.kpis || {};

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Good day, ${executive.name?.split(' ')[0] || 'Executive'}`}
        subtitle={`${executive.title || 'Executive'} office — weekly schedule`}
        breadcrumbs={[{ label: executive.title || 'Executive', to: '/executive' }, { label: 'Dashboard' }]}
        actions={<ActionToolbar />}
      />

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
        executive={executive}
        kpis={kpis}
        appointments={appointments}
        loading={loading}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        onRefresh={load}
      />
    </div>
  );
}
