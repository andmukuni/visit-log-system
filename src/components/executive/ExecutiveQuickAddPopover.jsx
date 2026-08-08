import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Clock,
  GripHorizontal,
  TextAlignStart,
  UserPlus,
  X,
} from 'lucide-react';
import ExecutiveAppointmentModal from './ExecutiveAppointmentModal';
import ExecutiveQuickAddSchedule from './ExecutiveQuickAddSchedule';
import ExecutiveContactAutocomplete from './ExecutiveContactAutocomplete';
import { LoadingButton } from '../ui';
import {
  buildDraftScheduleUpdate,
  clampPopoverToViewport,
  computeQuickAddPopoverPosition,
  resolveExecutiveSiteId,
  resolveExecutiveSiteLabel,
  setScheduleEndTime,
  setScheduleStartTime,
  toAllDaySchedule,
  toIsoLocalDateTime,
} from './calendarUtils';

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

export default function ExecutiveQuickAddPopover({
  draft,
  executive,
  referenceData,
  appointments = [],
  saving = false,
  onClose,
  onSave,
  onDraftChange,
}) {
  const [form, setForm] = useState(initialForm);
  const [visible, setVisible] = useState(false);
  const [showFullEditor, setShowFullEditor] = useState(false);
  const [activeTimePicker, setActiveTimePicker] = useState(null);
  const [viewportPosition, setViewportPosition] = useState(null);
  const popoverRef = useRef(null);
  const openedSessionIdRef = useRef(null);
  const previousScheduleRef = useRef(null);

  useEffect(() => {
    if (!draft) {
      setForm(initialForm());
      setVisible(false);
      setShowFullEditor(false);
      setActiveTimePicker(null);
      setViewportPosition(null);
      openedSessionIdRef.current = null;
      return undefined;
    }

    const isNewSession = openedSessionIdRef.current !== draft.sessionId;
    if (isNewSession) {
      setForm({
        ...initialForm(),
        siteId: referenceData?.defaultSiteId || referenceData?.sites?.[0]?.id || '',
      });
      openedSessionIdRef.current = draft.sessionId;
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    return undefined;
  }, [draft, draft?.sessionId, referenceData?.defaultSiteId, referenceData?.sites]);

  useEffect(() => {
    if (!draft) return undefined;

    const defaultSiteId = referenceData?.defaultSiteId || referenceData?.sites?.[0]?.id || '';
    if (!defaultSiteId) return undefined;

    setForm((prev) => (prev.siteId ? prev : { ...prev, siteId: defaultSiteId }));
  }, [draft?.sessionId, referenceData?.defaultSiteId, referenceData?.sites]);

  useEffect(() => {
    if (!draft) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (showFullEditor) {
        setShowFullEditor(false);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [draft, onClose, showFullEditor]);

  const position = useMemo(
    () => computeQuickAddPopoverPosition(draft?.slotRect),
    [draft?.slotRect],
  );

  const syncViewportPosition = () => {
    if (!position || !popoverRef.current) return;

    const rect = popoverRef.current.getBoundingClientRect();
    const next = clampPopoverToViewport({
      left: position.left,
      top: position.top,
      width: position.width,
      height: rect.height,
    });

    setViewportPosition((current) => (
      current?.left === next.left && current?.top === next.top ? current : next
    ));
  };

  useLayoutEffect(() => {
    if (!draft || !position || !visible) return undefined;

    syncViewportPosition();

    const onViewportChange = () => syncViewportPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [draft, position, visible, form.allDay, activeTimePicker]);

  if (!draft || !position) return null;

  const startAt = draft.startAt;
  const endAt = draft.endAt;
  const calendarLabel = `${executive?.title || 'Executive'} office`;
  const resolvedSiteId = resolveExecutiveSiteId(form.siteId, referenceData);
  const resolvedSiteLabel = resolveExecutiveSiteLabel(referenceData, resolvedSiteId);

  const updateTimes = (nextStart, nextEnd) => {
    onDraftChange(buildDraftScheduleUpdate(draft, nextStart, nextEnd));
  };

  const handleStartTime = (value) => {
    const next = setScheduleStartTime(startAt, endAt, value);
    updateTimes(next.startAt, next.endAt);
  };

  const handleEndTime = (value) => {
    const next = setScheduleEndTime(startAt, endAt, value);
    updateTimes(next.startAt, next.endAt);
  };

  const handleAllDayChange = (checked) => {
    if (checked) {
      previousScheduleRef.current = { startAt: new Date(startAt), endAt: new Date(endAt) };
      const next = toAllDaySchedule(startAt);
      updateTimes(next.startAt, next.endAt);
    } else {
      const previous = previousScheduleRef.current;
      if (previous) {
        updateTimes(previous.startAt, previous.endAt);
      } else {
        const next = setScheduleStartTime(startAt, endAt, '09:00');
        updateTimes(next.startAt, next.endAt);
      }
      previousScheduleRef.current = null;
    }
    setForm((prev) => ({ ...prev, allDay: checked }));
  };

  const handleContactSelect = (contact) => {
    setForm((prev) => ({
      ...prev,
      visitorName: contact.visitorName || prev.visitorName,
      company: contact.company || prev.company,
      phone: contact.phone || prev.phone,
      email: contact.email || prev.email,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      title: form.title.trim(),
      visitorName: form.visitorName.trim(),
      company: form.company.trim(),
      phone: form.phone.trim(),
      email: form.email?.trim() || '',
      purpose: form.purpose.trim(),
      siteId: resolvedSiteId,
      categoryId: form.categoryId || undefined,
      scheduledAt: toIsoLocalDateTime(startAt),
      allDay: form.allDay,
    });
  };

  if (showFullEditor) {
    return (
      <ExecutiveAppointmentModal
        open
        form={form}
        setForm={setForm}
        draft={draft}
        executive={executive}
        referenceData={referenceData}
        appointments={appointments}
        saving={saving}
        onClose={() => setShowFullEditor(false)}
        onSave={onSave}
        onDraftChange={onDraftChange}
      />
    );
  }

  const renderedLeft = viewportPosition?.left ?? position.left;
  const renderedTop = viewportPosition?.top ?? position.top;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close quick add"
        className="fixed inset-0 z-[55] bg-transparent"
        onClick={onClose}
      />
      <div
        ref={popoverRef}
        style={{
          position: 'fixed',
          left: renderedLeft,
          top: renderedTop,
          width: position.width,
          maxHeight: position.maxHeight,
          zIndex: 60,
        }}
        className={`flex max-h-[calc(100vh-24px)] flex-col rounded-3xl border border-gray-200/80 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.18)] overflow-hidden ${
          visible
            ? (position.placement === 'left' ? 'animate-gcal-popover' : 'animate-gcal-popover-right')
            : 'opacity-0'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-4 pt-3">
            <GripHorizontal size={18} className="text-gray-300" aria-hidden="true" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="shrink-0 px-5 pb-2">
            <input
              autoFocus
              value={form.title}
              onChange={(event) => {
                const title = event.target.value;
                setForm((prev) => ({ ...prev, title }));
                onDraftChange?.({ ...draft, title });
              }}
              placeholder="Add title"
              className="w-full border-0 border-b-2 border-[#1a73e8] bg-transparent px-0 pb-2 text-[22px] leading-tight text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
          </div>

          <div className="shrink-0 px-5 pb-1">
            <div className="inline-flex rounded-full bg-[#e8f0fe] p-1 text-sm">
              <span className="rounded-full bg-[#d2e3fc] px-4 py-1.5 font-medium text-[#1967d2]">
                Appointment
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-3">
            <div className="flex items-start gap-3">
              <Clock size={18} className="mt-3 shrink-0 text-gray-500" />
              <div className="flex-1 space-y-2">
                <ExecutiveQuickAddSchedule
                  startAt={startAt}
                  endAt={endAt}
                  allDay={form.allDay}
                  activeTimePicker={activeTimePicker}
                  onActiveTimePickerChange={setActiveTimePicker}
                  onStartTimeChange={handleStartTime}
                  onEndTimeChange={handleEndTime}
                />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.allDay}
                    onChange={(event) => handleAllDayChange(event.target.checked)}
                  />
                  All day
                </label>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <UserPlus size={18} className="mt-2 shrink-0 text-gray-500" />
              <div className="flex-1 space-y-2">
                <button type="button" className="text-sm text-gray-600 hover:text-gray-800 text-left">
                  Add guest
                </button>
                <ExecutiveContactAutocomplete
                  value={form.visitorName}
                  onChange={(visitorName) => setForm((prev) => ({ ...prev, visitorName }))}
                  onSelectContact={handleContactSelect}
                  placeholder="Visitor name"
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={form.company}
                    onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                    placeholder="Company"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
                  />
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="Phone"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <TextAlignStart size={18} className="mt-2 shrink-0 text-gray-500" />
              <textarea
                value={form.purpose}
                onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
                placeholder="Add description or meeting notes"
                rows={2}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm resize-none"
              />
            </div>

            <div className="flex items-start gap-3">
              <Calendar size={18} className="mt-2 shrink-0 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-800 inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#039be5]" />
                  {calendarLabel}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {resolvedSiteLabel ? `${resolvedSiteLabel} · ` : ''}
                  Busy · Default visibility · Notify 30 minutes before
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              onClick={() => setShowFullEditor(true)}
              className="text-sm font-medium text-navy-700 hover:underline"
            >
              More options
            </button>
            <LoadingButton
              type="submit"
              loading={saving}
              loadingLabel="Saving"
              variant="primary"
              className="rounded-full bg-[#1a73e8] hover:bg-[#1765cc] px-6"
            >
              Save
            </LoadingButton>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
