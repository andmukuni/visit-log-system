import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, RefreshAction, ActionToolbar, Spinner } from '../../components/ui';
import ExecutiveWeekCalendar, { periodQueryRange, normalizePeriodStart } from '../../components/executive/ExecutiveWeekCalendar';
import { formatExecutiveDashboardDate } from '../../components/executive/ExecutiveDashboardWidgets';
import { receptionApi } from '../../utils/visitorApi';

function mapCalendarRow(row) {
  const scheduledAt = row.scheduled_at || row.expected_at;
  return {
    id: row.id || row.visit_id,
    visit_id: row.visit_id,
    title: row.title || row.purpose || 'Visit',
    scheduled_at: scheduledAt,
    status: row.appointment_status || 'scheduled',
    visit_status: row.visit_status,
    visitor_name: row.visitor_name || row.full_name,
    host_name: row.host_name,
    classification: row.classification || 'standard',
    category_name: row.category_name,
    purpose: row.purpose,
    pass_code: row.pass_code,
    expected_plates: row.expected_plates,
    duration_minutes: row.duration_minutes || 60,
  };
}

export default function ReceptionCalendarPage() {
  const [weekStart, setWeekStart] = useState(() => normalizePeriodStart(new Date(), 'week'));
  const [viewMode, setViewMode] = useState('week');
  const [appointments, setAppointments] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const range = periodQueryRange(weekStart, viewMode);
      const [calendarRows, dash] = await Promise.all([
        receptionApi.getCalendar({ start: range.from, end: range.to }),
        receptionApi.getDashboard(),
      ]);
      setAppointments((calendarRows || []).map(mapCalendarRow));
      setDashboard(dash);
    } catch (err) {
      setError(err.message || 'Unable to load calendar.');
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => ({
    todayAppointments: dashboard?.expectedToday || 0,
    weekAppointments: appointments.length,
    onSiteNow: dashboard?.checkedInAtDesk || 0,
    pendingApprovals: dashboard?.pendingApprovals || 0,
    vipToday: appointments.filter((row) => ['vip', 'vvip'].includes(String(row.classification || '').toLowerCase())).length,
  }), [dashboard, appointments]);

  const nextAppointment = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((row) => row.scheduled_at && new Date(row.scheduled_at).getTime() >= now)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || null;
  }, [appointments]);

  const handleViewModeChange = useCallback((nextMode) => {
    setViewMode(nextMode);
    setWeekStart((current) => normalizePeriodStart(current, nextMode));
  }, []);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col overflow-hidden overscroll-none">
      <PageHeader
        title="Expected Visitors"
        subtitle={formatExecutiveDashboardDate()}
        actions={(
          <ActionToolbar>
            <Link
              to="/reception/check-in"
              className="hidden rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 sm:inline-flex"
            >
              Check-in desk
            </Link>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      {error ? (
        <div className="mb-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
          <button type="button" onClick={load} className="ml-3 font-medium underline">Retry</button>
        </div>
      ) : null}

      {loading && appointments.length === 0 ? (
        <div className="flex flex-1 justify-center py-20"><Spinner size={32} /></div>
      ) : (
        <ExecutiveWeekCalendar
          className="h-full min-h-0 flex-1 overflow-hidden"
          executive={{ name: dashboard?.scope?.siteName || 'Reception', title: 'Reception' }}
          kpis={kpis}
          nextAppointment={nextAppointment}
          appointments={appointments}
          loading={loading}
          weekStart={weekStart}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onWeekChange={setWeekStart}
          onRefresh={load}
          newAppointmentTrigger={0}
        />
      )}
    </div>
  );
}
