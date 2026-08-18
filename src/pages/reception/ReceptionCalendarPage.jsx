import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, RefreshAction, ActionToolbar } from '../../components/ui';
import ExpectedVisitorsTimeline from '../../components/reception/ExpectedVisitorsTimeline';
import { formatExecutiveDashboardDate } from '../../components/executive/ExecutiveDashboardWidgets';
import { periodQueryRange, normalizePeriodStart } from '../../components/executive/calendarUtils';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';

function mapCalendarRow(row) {
  const scheduledAt = row.scheduled_at || row.expected_at;
  return {
    id: row.id || row.visit_id,
    visit_id: row.visit_id || row.id,
    title: row.title || row.purpose || 'Visit',
    scheduled_at: scheduledAt,
    status: row.visit_status || row.appointment_status || 'scheduled',
    visit_status: row.visit_status,
    appointment_status: row.appointment_status,
    visitor_name: row.visitor_name || row.full_name,
    host_name: row.host_name,
    host_id: row.host_id,
    company: row.company,
    phone: row.phone,
    department_name: row.department_name,
    classification: row.classification || 'standard',
    category_name: row.category_name,
    purpose: row.purpose,
    pass_code: row.pass_code,
    expected_plates: row.expected_plates,
    duration_minutes: row.duration_minutes || 60,
    _accessLevel: row._accessLevel,
  };
}

export default function ReceptionCalendarPage() {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(() => normalizePeriodStart(new Date(), 'day'));
  const [appointments, setAppointments] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [checkingOutId, setCheckingOutId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const range = periodQueryRange(selectedDate, 'day');
      const [calendarRows, dash] = await Promise.all([
        receptionApi.getCalendar({ start: range.from, end: range.to }),
        receptionApi.getDashboard(),
      ]);
      setAppointments((calendarRows || []).map(mapCalendarRow));
      setDashboard(dash);
    } catch (err) {
      setError(err.message || 'Unable to load expected visitors.');
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const inZone = appointments.filter((row) => row._accessLevel !== 'restricted');
    const vipToday = inZone.filter((row) => (
      ['vip', 'vvip'].includes(String(row.classification || '').toLowerCase())
    )).length;

    return {
      expectedToday: inZone.length,
      onSiteNow: dashboard?.checkedInAtDesk || 0,
      pendingApprovals: dashboard?.pendingApprovals || 0,
      vipToday,
    };
  }, [appointments, dashboard]);

  const handleDateChange = useCallback((nextDate) => {
    setSelectedDate(normalizePeriodStart(nextDate, 'day'));
  }, []);

  const handleCheckOut = useCallback(async (row) => {
    const visitId = row.visit_id || row.id;
    setCheckingOutId(visitId);
    try {
      await receptionApi.checkOutVisit(visitId);
      toast.success(`${row.visitor_name || 'Visitor'} checked out.`);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not check out visitor.');
    } finally {
      setCheckingOutId(null);
    }
  }, [load, toast]);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col overflow-hidden overscroll-none">
      <PageHeader
        title="Expected Visitors"
        subtitle={formatExecutiveDashboardDate(selectedDate)}
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

      <ExpectedVisitorsTimeline
        appointments={appointments}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        kpis={kpis}
        loading={loading}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onCheckOut={handleCheckOut}
        checkingOutId={checkingOutId}
        onRefresh={load}
      />
    </div>
  );
}
