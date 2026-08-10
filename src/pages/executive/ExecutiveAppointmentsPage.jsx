import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import ExecutiveDashboardHeaderActions from '../../components/executive/ExecutiveDashboardHeaderActions';
import ExecutiveAppointmentDetailPanel from '../../components/executive/ExecutiveAppointmentDetailPanel';
import ExecutiveAppointmentsKpiRow from '../../components/executive/ExecutiveAppointmentsKpiRow';
import ExecutiveAppointmentsTableSection, {
  ExecutiveAppointmentsTableFooter,
} from '../../components/executive/ExecutiveAppointmentsTableSection';
import ExecutiveAppointmentsDetailSidebar, {
  ExecutiveAppointmentsDetailActions,
} from '../../components/executive/ExecutiveAppointmentsDetailSidebar';
import { executiveApi } from '../../utils/visitorApi';

export default function ExecutiveAppointmentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || 'all';
  const search = searchParams.get('search') || '';
  const classification = searchParams.get('type') || '';
  const status = searchParams.get('status') || '';
  const dateRange = searchParams.get('range') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({});
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const updateParams = useCallback((updates) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === '' || value == null) next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listResult = await executiveApi.listAppointments({
        tab,
        search,
        classification,
        status,
        range: dateRange,
        page,
        pageSize,
      });

      const listStats = listResult?.stats || {};
      setRows(listResult?.rows || []);
      setTotal(Number(listResult?.total || 0));
      setStats(listStats);
      setKpis({
        todayAppointments: listStats.today ?? 0,
        weekAppointments: listStats.week ?? 0,
        pendingApprovals: listStats.awaiting ?? 0,
        onSiteNow: listStats.onSiteNow ?? 0,
        completedThisMonth: listStats.completedThisMonth ?? 0,
      });

      setSelected((current) => {
        const nextRows = listResult?.rows || [];
        if (!nextRows.length) return null;
        if (current && nextRows.some((row) => row.id === current.id)) return current;
        return nextRows[0];
      });
    } catch {
      setRows([]);
      setTotal(0);
      setStats({});
      setKpis({});
    } finally {
      setLoading(false);
    }
  }, [tab, search, classification, status, dateRange, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== search) {
        updateParams({ search: searchInput, page: 1 });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  const openNewAppointment = useCallback(() => {
    navigate('/host/appointments/new', { state: { from: '/host/appointments' } });
  }, [navigate]);

  const openReschedule = useCallback((appointment, schedule) => {
    const startAt = schedule?.start || appointment.scheduled_at || null;
    navigate('/host/appointments/new', {
      state: {
        from: '/host/appointments',
        startAt,
        prefill: {
          title: appointment.title || '',
          visitorName: appointment.visitor_name || '',
          company: appointment.company || '',
          phone: appointment.phone || '',
          email: appointment.email || '',
          purpose: appointment.purpose || '',
        },
      },
    });
  }, [navigate]);

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (window.innerWidth < 1024) {
      setMobileDetailOpen(true);
    }
  }, []);

  const pageActions = useMemo(() => (
    <ExecutiveDashboardHeaderActions onNewAppointment={openNewAppointment} />
  ), [openNewAppointment]);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col gap-2.5 overflow-hidden sm:gap-3">
      <PageHeader
        title="Appointments"
        subtitle="View, manage and approve all appointments."
        actions={pageActions}
      />

      <ExecutiveAppointmentsKpiRow kpis={kpis} className="shrink-0" />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch">
          <ExecutiveAppointmentsTableSection
            rows={rows}
            loading={loading}
            total={total}
            page={page}
            pageSize={pageSize}
            tab={tab}
            stats={stats}
            search={searchInput}
            dateRange={dateRange}
            classification={classification}
            status={status}
            selectedId={selected?.id}
            splitLayout={Boolean(selected)}
            onTabChange={(value) => updateParams({ tab: value, page: 1 })}
            onSearchChange={setSearchInput}
            onDateRangeChange={(value) => updateParams({ range: value, page: 1 })}
            onClassificationChange={(value) => updateParams({ type: value, page: 1 })}
            onStatusChange={(value) => updateParams({ status: value, page: 1 })}
            onPageChange={(value) => updateParams({ page: value })}
            onPageSizeChange={(value) => updateParams({ pageSize: value, page: 1 })}
            onSelect={handleSelect}
            onView={(row) => {
              handleSelect(row);
              if (window.innerWidth < 1024) setMobileDetailOpen(true);
            }}
          />

          {selected && (
            <div className="hidden lg:contents">
              <ExecutiveAppointmentsDetailSidebar
                appointment={selected}
                splitLayout
                onClose={() => setSelected(null)}
                onReschedule={openReschedule}
              />
            </div>
          )}
        </div>

        {selected && (
          <div className="hidden shrink-0 border-t border-gray-200 lg:flex lg:items-stretch">
            <div className="min-w-0 flex-[1.75]">
              <ExecutiveAppointmentsTableFooter
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={(value) => updateParams({ page: value })}
                onPageSizeChange={(value) => updateParams({ pageSize: value, page: 1 })}
              />
            </div>
            <div className="flex min-w-[280px] max-w-[360px] flex-1 items-center border-l border-gray-200">
              <ExecutiveAppointmentsDetailActions
                appointment={selected}
                onReschedule={openReschedule}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      <ExecutiveAppointmentDetailPanel
        appointment={selected}
        open={mobileDetailOpen && Boolean(selected)}
        onClose={() => setMobileDetailOpen(false)}
      />
    </div>
  );
}
