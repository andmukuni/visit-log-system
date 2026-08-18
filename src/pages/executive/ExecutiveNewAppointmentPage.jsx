import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ExecutiveAppointmentModal from '../../components/executive/ExecutiveAppointmentModal';
import {
  addMinutes,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  DEFAULT_EVENT_MINUTES,
  startOfDay,
} from '../../components/executive/calendarUtils';
import { Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { executiveApi } from '../../utils/visitorApi';

const initialForm = () => ({
  title: '',
  visitorName: '',
  company: '',
  phone: '',
  phoneCountry: 'ZM',
  idNumber: '',
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
  if (Number.isNaN(start.getTime())) {
    start = new Date(nowDate);
  }

  if (!startAt || Number.isNaN(new Date(startAt).getTime())) {
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
    sessionId: `appointment-page-${Date.now()}`,
    openFullEditor: true,
  };
}

export default function ExecutiveNewAppointmentPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState(initialForm);
  const [draft, setDraft] = useState(null);
  const [referenceData, setReferenceData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const returnTo = useMemo(() => {
    const fromState = location.state?.from;
    if (typeof fromState === 'string' && fromState.startsWith('/host')) return fromState;
    return '/host/appointments';
  }, [location.state]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [refData, listResult] = await Promise.all([
          executiveApi.getReferenceData(),
          executiveApi.listAppointments({ tab: 'upcoming', page: 1, pageSize: 50 }).catch(() => null),
        ]);
        if (cancelled) return;

        setReferenceData(refData || null);
        setAppointments(listResult?.rows || []);

        const prefill = location.state?.prefill || {};
        const startParam = searchParams.get('start') || location.state?.startAt || null;

        setForm({
          ...initialForm(),
          ...prefill,
          siteId: prefill.siteId
            || refData?.defaultSiteId
            || refData?.sites?.[0]?.id
            || '',
        });
        setDraft(buildDefaultDraft(startParam));
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.message || 'Unable to open appointment editor.');
          navigate(returnTo, { replace: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.state, navigate, returnTo, searchParams, toast]);

  const handleClose = useCallback(() => {
    navigate(returnTo);
  }, [navigate, returnTo]);

  const handleSave = useCallback(async (payload) => {
    if (!payload.visitorName?.trim()) {
      toast.error('Visitor name is required.');
      return;
    }
    if (!payload.phone?.trim()) {
      toast.error('Mobile phone number is required.');
      return;
    }
    setSaving(true);
    try {
      await executiveApi.createAppointment(payload);
      toast.success('Appointment saved.');
      navigate('/host/appointments');
    } catch (err) {
      toast.error(err?.message || 'Could not save appointment.');
    } finally {
      setSaving(false);
    }
  }, [navigate, toast]);

  if (loading || !draft) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <ExecutiveAppointmentModal
      open
      variant="page"
      form={form}
      setForm={setForm}
      draft={draft}
      executive={referenceData?.host || {}}
      referenceData={referenceData}
      appointments={appointments}
      saving={saving}
      onClose={handleClose}
      onSave={handleSave}
      onDraftChange={setDraft}
    />
  );
}
