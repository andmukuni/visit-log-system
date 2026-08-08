import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft,
  Bell,
  Bold,
  BriefcaseBusiness,
  HelpCircle,
  Italic,
  Link2,
  List,
  ListOrdered,
  MapPin,
  RemoveFormatting,
  Underline,
  X,
} from 'lucide-react';
import { LoadingButton } from '../ui';
import { useToast } from '../../context/ToastContext';
import ExecutiveFindTimePanel from './ExecutiveFindTimePanel';
import ExecutiveContactAutocomplete from './ExecutiveContactAutocomplete';
import {
  buildDraftScheduleUpdate,
  FUTURE_SCHEDULE_ERROR,
  formatShortDate,
  formatTime12Compact,
  formatTimezoneShort,
  isSameDay,
  isScheduleInPast,
  resolveExecutiveSiteId,
  resolveExecutiveSiteLabel,
  setScheduleEndDate,
  setScheduleEndTime,
  setScheduleStartTime,
  shiftScheduleByStartDate,
  toAllDaySchedule,
  toDateInputValue,
  toIsoLocalDateTime,
  toTimeInputValue,
} from './calendarUtils';

const GCAL_BLUE = '#1a73e8';

function SchedulePill({ label, value, type = 'text', onChange, ariaLabel, min }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Fall through when showPicker is blocked.
      }
    }
    input.focus();
    input.click();
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex min-h-[36px] items-center rounded-md bg-[#f1f3f4] px-3 py-2 text-sm text-gray-800 transition-colors hover:bg-[#e8eaed]"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type={type}
        value={value}
        min={min}
        onChange={onChange}
        aria-label={ariaLabel}
        tabIndex={-1}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </span>
  );
}

function FieldRow({ icon: Icon, children, iconClassName = 'mt-2.5' }) {
  return (
    <div className="flex items-start gap-5 border-b border-transparent py-1.5">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center text-gray-500 ${iconClassName}`}>
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </div>
  );
}

function GrayInput({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-md border-0 bg-[#f1f3f4] px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30 ${className}`}
      {...props}
    />
  );
}

function GraySelect({ className = '', children, ...props }) {
  return (
    <select
      className={`rounded-md border-0 bg-[#f1f3f4] px-3 py-2.5 text-sm text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
        active
          ? 'border-[#1a73e8] text-[#1a73e8]'
          : 'border-transparent text-gray-600 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

export default function ExecutiveAppointmentModal({
  open,
  form,
  setForm,
  draft,
  executive,
  referenceData,
  saving = false,
  appointments = [],
  onClose,
  onSave,
  onDraftChange,
}) {
  const [activeTab, setActiveTab] = useState('details');
  const previousScheduleRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) {
      setActiveTab('details');
      previousScheduleRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !draft) return null;

  const startAt = draft.startAt;
  const endAt = draft.endAt;

  const updateSchedule = (nextStart, nextEnd) => {
    if (isScheduleInPast(nextStart)) {
      toast.error(FUTURE_SCHEDULE_ERROR);
      return;
    }
    onDraftChange?.(buildDraftScheduleUpdate(draft, nextStart, nextEnd));
  };

  const handleStartDate = (value) => {
    const next = shiftScheduleByStartDate(startAt, endAt, value);
    updateSchedule(next.startAt, next.endAt);
  };

  const handleEndDate = (value) => {
    const next = setScheduleEndDate(startAt, endAt, value);
    updateSchedule(next.startAt, next.endAt);
  };

  const handleStartTime = (value) => {
    const next = setScheduleStartTime(startAt, endAt, value);
    updateSchedule(next.startAt, next.endAt);
  };

  const handleEndTime = (value) => {
    const next = setScheduleEndTime(startAt, endAt, value);
    updateSchedule(next.startAt, next.endAt);
  };

  const handleAllDayChange = (checked) => {
    if (checked) {
      previousScheduleRef.current = { startAt: new Date(startAt), endAt: new Date(endAt) };
      const next = toAllDaySchedule(startAt);
      updateSchedule(next.startAt, next.endAt);
    } else {
      const previous = previousScheduleRef.current;
      if (previous) {
        updateSchedule(previous.startAt, previous.endAt);
      } else {
        const next = setScheduleStartTime(startAt, endAt, '09:00');
        updateSchedule(next.startAt, next.endAt);
      }
      previousScheduleRef.current = null;
    }
    setForm((prev) => ({ ...prev, allDay: checked }));
  };

  const sameDay = isSameDay(startAt, endAt);
  const timezoneLabel = formatTimezoneShort(startAt);
  const resolvedSiteId = resolveExecutiveSiteId(form.siteId, referenceData);
  const resolvedSiteLabel = resolveExecutiveSiteLabel(referenceData, resolvedSiteId) || 'Office location';
  const todayMinDate = toDateInputValue(new Date());

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
    if (isScheduleInPast(startAt)) {
      toast.error(FUTURE_SCHEDULE_ERROR);
      return;
    }
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

  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#eceff1] py-10 sm:py-14 animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="flex min-h-[calc(100vh-5rem)] w-full flex-col bg-white"
      >
        {/* Header + title + schedule */}
        <div className="shrink-0 border-b border-gray-200">
          <div className="mx-auto w-full max-w-[920px] px-5 pb-5 pt-5 sm:px-8 sm:pt-6">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="Close appointment editor"
            >
              <X size={22} />
            </button>

            <div className="min-w-0 flex-1">
              <input
                autoFocus
                value={form.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setForm((prev) => ({ ...prev, title }));
                  onDraftChange?.({ ...draft, title });
                }}
                placeholder="Add title"
                className="w-full border-0 border-b-2 bg-transparent px-0 pb-2 text-[26px] leading-tight text-gray-900 placeholder:text-gray-400 focus:outline-none"
                style={{ borderColor: GCAL_BLUE }}
              />

              <div className="mt-5 space-y-3">
                {!form.allDay ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <SchedulePill
                      label={formatShortDate(startAt)}
                      value={toDateInputValue(startAt)}
                      type="date"
                      min={todayMinDate}
                      onChange={(event) => handleStartDate(event.target.value)}
                      ariaLabel="Start date"
                    />
                    <SchedulePill
                      label={formatTime12Compact(startAt)}
                      value={toTimeInputValue(startAt)}
                      type="time"
                      onChange={(event) => handleStartTime(event.target.value)}
                      ariaLabel="Start time"
                    />
                    <span className="px-1 text-sm text-gray-600">to</span>
                    <SchedulePill
                      label={formatTime12Compact(endAt)}
                      value={toTimeInputValue(endAt)}
                      type="time"
                      onChange={(event) => handleEndTime(event.target.value)}
                      ariaLabel="End time"
                    />
                    {!sameDay && (
                      <SchedulePill
                        label={formatShortDate(endAt)}
                        value={toDateInputValue(endAt)}
                        type="date"
                        min={todayMinDate}
                        onChange={(event) => handleEndDate(event.target.value)}
                        ariaLabel="End date"
                      />
                    )}
                    <span className="text-sm text-gray-500" title={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                      {timezoneLabel}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <SchedulePill
                      label={formatShortDate(startAt)}
                      value={toDateInputValue(startAt)}
                      type="date"
                      min={todayMinDate}
                      onChange={(event) => handleStartDate(event.target.value)}
                      ariaLabel="Date"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-5 text-sm text-gray-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.allDay}
                      onChange={(event) => handleAllDayChange(event.target.checked)}
                      className="rounded border-gray-300"
                    />
                    All day
                  </label>
                  <GraySelect
                    value={form.repeat || 'none'}
                    onChange={(event) => setForm((prev) => ({ ...prev, repeat: event.target.value }))}
                    className="min-w-[10rem]"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </GraySelect>
                </div>
              </div>
            </div>

            <LoadingButton
              type="submit"
              loading={saving}
              loadingLabel="Saving"
              variant="primary"
              className="mt-1 shrink-0 rounded-full px-7 py-2.5 text-sm font-medium shadow-none hover:opacity-95"
              style={{ backgroundColor: GCAL_BLUE }}
            >
              Save
            </LoadingButton>
          </div>
          </div>
        </div>

          {/* Main two-column body */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            <div className="mx-auto flex w-full max-w-[920px] flex-col gap-0 px-5 py-6 sm:px-8 lg:flex-row lg:gap-10">
            {/* Left — event details */}
            <div className="min-w-0 flex-1">
              <div className="mb-5 flex gap-6 border-b border-gray-200">
                <TabButton active={activeTab === 'details'} onClick={() => setActiveTab('details')}>
                  Event details
                </TabButton>
                <TabButton active={activeTab === 'find-time'} onClick={() => setActiveTab('find-time')}>
                  Find a time
                </TabButton>
              </div>

              {activeTab === 'details' ? (
                <div className="space-y-0">
                  <FieldRow icon={MapPin}>
                    <p className="rounded-md bg-[#f1f3f4] px-3 py-2.5 text-sm text-gray-800">
                      {resolvedSiteLabel}
                    </p>
                  </FieldRow>

                  <FieldRow icon={Bell}>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <GraySelect className="w-auto min-w-[7rem]">
                          <option>Notification</option>
                        </GraySelect>
                        <GraySelect
                          value={form.notifyMinutes ?? 30}
                          onChange={(event) => setForm((prev) => ({
                            ...prev,
                            notifyMinutes: Number(event.target.value),
                          }))}
                          className="w-auto min-w-[4rem]"
                        >
                          <option value={10}>10</option>
                          <option value={30}>30</option>
                          <option value={60}>60</option>
                          <option value={1440}>1440</option>
                        </GraySelect>
                        <GraySelect className="w-auto min-w-[6rem]">
                          <option>minutes</option>
                          <option>hours</option>
                          <option>days</option>
                        </GraySelect>
                        <button
                          type="button"
                          className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                          aria-label="Remove notification"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <button type="button" className="text-sm font-medium text-[#1a73e8] hover:underline">
                        Add notification
                      </button>
                    </div>
                  </FieldRow>

                  <FieldRow icon={BriefcaseBusiness}>
                    <div className="flex flex-wrap items-center gap-2">
                      <GraySelect className="w-auto min-w-[6rem]">
                        <option>Busy</option>
                        <option>Free</option>
                      </GraySelect>
                      <GraySelect className="w-auto min-w-[10rem]">
                        <option>Default visibility</option>
                        <option>Public</option>
                        <option>Private</option>
                      </GraySelect>
                      <GraySelect
                        value={form.categoryId}
                        onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                        className="min-w-[10rem] flex-1"
                      >
                        <option value="">Standard visitor</option>
                        {(referenceData?.categories || []).map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </GraySelect>
                      <button type="button" className="text-gray-500" aria-label="Visibility help">
                        <HelpCircle size={18} />
                      </button>
                    </div>
                  </FieldRow>

                  <FieldRow icon={AlignLeft} iconClassName="mt-3">
                    <div className="overflow-hidden rounded-md border border-gray-200 bg-[#f1f3f4]">
                      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-white px-2 py-1.5">
                        {[Bold, Italic, Underline, List, ListOrdered, Link2, RemoveFormatting].map((Icon, index) => (
                          <button
                            key={Icon.displayName || index}
                            type="button"
                            className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
                            aria-hidden="true"
                            tabIndex={-1}
                          >
                            <Icon size={16} />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={form.purpose}
                        onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
                        placeholder="Add description"
                        rows={6}
                        className="w-full resize-y border-0 bg-[#f1f3f4] px-3 py-3 text-sm text-gray-800 placeholder:text-gray-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </FieldRow>
                </div>
              ) : (
                <ExecutiveFindTimePanel
                  draft={draft}
                  appointments={appointments}
                  onDraftChange={onDraftChange}
                  onScheduleRejected={(message) => toast.error(message)}
                />
              )}
            </div>

            {/* Right — guests */}
            <aside className="w-full shrink-0 lg:w-[280px]">
              <div className="mb-4 border-b-2 border-[#1a73e8] pb-2">
                <h3 className="text-sm font-medium text-[#1a73e8]">Guests</h3>
              </div>

              <ExecutiveContactAutocomplete
                value={form.visitorName}
                onChange={(visitorName) => setForm((prev) => ({ ...prev, visitorName }))}
                onSelectContact={handleContactSelect}
                placeholder="Add guests"
                required
                inputClassName="w-full rounded-md border-0 bg-[#f1f3f4] px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30"
              />

              <div className="mt-3 space-y-2">
                <GrayInput
                  type="email"
                  value={form.email || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                />
                <GrayInput
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Phone"
                />
                <GrayInput
                  value={form.company}
                  onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                  placeholder="Company / organization"
                />
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-gray-800">Guest permissions</p>
                <div className="mt-3 space-y-2.5 text-sm text-gray-700">
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" disabled className="rounded border-gray-300" />
                    Modify event
                  </label>
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" defaultChecked disabled className="rounded border-gray-300 text-[#1a73e8]" />
                    Invite others
                  </label>
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" defaultChecked disabled className="rounded border-gray-300 text-[#1a73e8]" />
                    See guest list
                  </label>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
