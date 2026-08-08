import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import ExecutiveDashboardHeaderActions from '../../components/executive/ExecutiveDashboardHeaderActions';
import ExecutiveAppointmentModal from '../../components/executive/ExecutiveAppointmentModal';
import ExecutiveAppointmentDetailPanel from '../../components/executive/ExecutiveAppointmentDetailPanel';
import ExecutiveAppointmentsKpiRow from '../../components/executive/ExecutiveAppointmentsKpiRow';
import ExecutiveAppointmentsTableSection from '../../components/executive/ExecutiveAppointmentsTableSection';
import ExecutiveAppointmentsDetailSidebar from '../../components/executive/ExecutiveAppointmentsDetailSidebar';
import {
  addMinutes,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  DEFAULT_EVENT_MINUTES,
  startOfDay,
} from '../../components/executive/calendarUtils';
import { useToast } from '../../context/ToastContext';
import { executiveApi, notificationsApi } from '../../utils/visitorApi';

const initialForm = () => ({
  title: '',
  visitorName: '',
  company: '',
  phone: '',
  email: '',
  purpose: '',
  siteId: '',
  categoryId: '',
  allDay: false,
  repeat: 'none',
  notifyMinutes: 30,
});

function buildDefaultDraft(startAt = null) {
  const nowDate = new Date();
  let start = startAt ? new Date(startAt) : new Date(nowDate);
  if (!startAt) {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    if (start.getHours() < CALENDAR_START_HOUR) {
      start.setHours(CALENDAR_START_HOUR, 0, 0, 0);
    }
    if (start.getHours() >= CALENDAR_END_HOUR) {
      start = startOfDay(nowDate);
      start.setDate(start.getDate() + 1);
      start.setHours(CALENDAR_START_HOUR, 0, 0, 0);
    }
  }

  const end = addMinutes(start, DEFAULT_EVENT_MINUTES);
  const day = startOfDay(start);

  return {
    day,
    dayKey: day.toISOString(),
    startAt: start,
    endAt: end,
    title: '',
    slotRect: null,
    sessionId: `appointments-${Date.now()}`,
    openFullEditor: true,
  };
}

export default function ExecutiveAppointmentsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || 'all';
  const search = searchParams.get('search') || '';
  const classification = searchParams.get('type') || '';
  const status = searchParams.get('status') || '';
  const dateRange = searchParams.get('range') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 10)));

  const [searchInput, setSearchInput] = useState(search);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({});
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [referenceData, setReferenceData] = useState(null);
  const [executive, setExecutive] = useState({});
  const [saving, setSaving] = useState(false);

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
      const [listResult, dashboard] = await Promise.all([
        executiveApi.listAppointments({
          tab,
          search,
          classification,
          status,
          range: dateRange,
          page,
          pageSize,
        }),
        executiveApi.getDashboard(),
      ]);

      setRows(listResult?.rows || []);
      setTotal(Number(listResult?.total || 0));
      setStats(listResult?.stats || {});
      setKpis(dashboard?.kpis || {});
      setExecutive(dashboard?.executive || {});

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

  useEffect(() => {
    let cancelled = false;
    notificationsApi.list(true)
      .then((items) => {
        if (!cancelled) setUnreadCount(Array.isArray(items) ? items.length : 0);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    executiveApi.getReferenceData()
      .then((data) => {
        if (!cancelled) setReferenceData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const openNewAppointment = useCallback(() => {
    setForm({
      ...initialForm(),
      siteId: referenceData?.defaultSiteId || referenceData?.sites?.[0]?.id || '',
    });
    setDraft(buildDefaultDraft());
  }, [referenceData?.defaultSiteId, referenceData?.sites]);

  const openReschedule = useCallback((appointment, schedule) => {
    setForm({
      ...initialForm(),
      title: appointment.title || '',
      visitorName: appointment.visitor_name || '',
      company: appointment.company || '',
      phone: appointment.phone || '',
      purpose: appointment.purpose || '',
      siteId: referenceData?.defaultSiteId || referenceData?.sites?.[0]?.id || '',
      categoryId: '',
    });
    setDraft(buildDefaultDraft(schedule?.start || appointment.scheduled_at));
  }, [referenceData?.defaultSiteId, referenceData?.sites]);

  const handleSaveAppointment = async (payload) => {
    if (!payload.visitorName?.trim()) {
      toast.error('Visitor name is required.');
      return;
    }
    setSaving(true);
    try {
      await executiveApi.createAppointment(payload);
      toast.success('Appointment saved.');
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save appointment.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (window.innerWidth < 1024) {
      setMobileDetailOpen(true);
    }
  }, []);

  const modalOpen = Boolean(draft?.openFullEditor);

  const pageActions = useMemo(() => (
    <ExecutiveDashboardHeaderActions
      onNewAppointment={openNewAppointment}
      unreadCount={unreadCount}
    />
  ), [openNewAppointment, unreadCount]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments"
        subtitle="View, manage and approve all appointments."
        actions={pageActions}
      />

      <ExecutiveAppointmentsKpiRow kpis={kpis} />

      <div className="-mx-4 flex min-h-[calc(100vh-18rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:-mx-6 lg:-mx-8 lg:flex-row lg:items-stretch">
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
              onClose={() => setSelected(null)}
              onReschedule={openReschedule}
            />
          </div>
        )}
      </div>

      <ExecutiveAppointmentDetailPanel
        appointment={selected}
        open={mobileDetailOpen && Boolean(selected)}
        onClose={() => setMobileDetailOpen(false)}
      />

      {modalOpen && draft && (
        <ExecutiveAppointmentModal
          open
          form={form}
          setForm={setForm}
          draft={draft}
          executive={executive}
          referenceData={referenceData}
          appointments={rows}
          saving={saving}
          onClose={() => setDraft(null)}
          onSave={handleSaveAppointment}
          onDraftChange={setDraft}
        />
      )}

    </div>
  );
}
