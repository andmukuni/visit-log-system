import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft,
  Bell,
  Bold,
  BriefcaseBusiness,
  CalendarDays,
  HelpCircle,
  Italic,
  Link2,
  List,
  ListOrdered,
  MapPin,
  RemoveFormatting,
  TriangleAlert,
  Underline,
  Users,
  X,
} from 'lucide-react';
import { LoadingButton, PhoneInput, SegmentedControl } from '../ui';
import { useToast } from '../../context/ToastContext';
import ExecutiveDatePicker from './ExecutiveDatePicker';
import ExecutiveFindTimePanel from './ExecutiveFindTimePanel';
import ExecutiveContactAutocomplete from './ExecutiveContactAutocomplete';
import {
  buildDraftScheduleUpdate,
  END_BEFORE_START_ERROR,
  END_BEFORE_START_DATE_ERROR,
  FUTURE_SCHEDULE_ERROR,
  formatShortDate,
  formatTime12Compact,
  formatTimezoneShort,
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
import {
  DEFAULT_PHONE_COUNTRY,
  NRC_INPUT_MAX_LENGTH,
  NRC_PLACEHOLDER,
  buildFullPhone,
  formatNrcInput,
  isCompleteNrc,
  normalizePhoneNational,
} from '../../utils/helpers';

const INPUT =
  'w-full rounded-xl border border-navy-200 bg-navy-50 text-navy-900 placeholder:text-navy-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500 px-3 py-2.5 text-sm';
const SELECT =
  'rounded-xl border border-navy-200 bg-navy-50 text-navy-900 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500 px-3 py-2.5 text-sm';

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
        className="inline-flex min-h-[40px] items-center rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm font-medium text-navy-800 shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50"
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

function FormSection({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      {(title || subtitle) && (
        <div className="mb-4 border-b border-navy-100 pb-3">
          {title ? <h3 className="text-sm font-semibold text-navy-900">{title}</h3> : null}
          {subtitle ? <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

function FieldRow({ icon: Icon, children, iconClassName = 'mt-2.5' }) {
  return (
    <div className="flex items-start gap-4 py-2">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-navy-50 text-cyan-700 ${iconClassName}`}
      >
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pb-1">{children}</div>
    </div>
  );
}

function NavySelect({ className = '', children, ...props }) {
  return (
    <select className={`${SELECT} ${className}`} {...props}>
      {children}
    </select>
  );
}

function NavyInput({ className = '', ...props }) {
  return <input className={`${INPUT} ${className}`} {...props} />;
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
  variant = 'modal',
}) {
  const [activeTab, setActiveTab] = useState('details');
  const [openDatePicker, setOpenDatePicker] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
  const previousScheduleRef = useRef(null);
  const toast = useToast();
  const isPage = variant === 'page';

  useEffect(() => {
    if (!open) {
      setActiveTab('details');
      setOpenDatePicker(null);
      setScheduleError('');
      previousScheduleRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || isPage) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (openDatePicker) {
        setOpenDatePicker(null);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, isPage, openDatePicker]);

  if (!open || !draft) return null;

  const startAt = draft.startAt;
  const endAt = draft.endAt;

  const updateSchedule = (nextStart, nextEnd) => {
    if (isScheduleInPast(nextStart)) {
      // A silent revert here reads as "the picker ignored what I chose" — the
      // time field snaps back with no visible reason. Keep the toast, but also
      // hold a message right at the field so it can't be missed.
      setScheduleError(FUTURE_SCHEDULE_ERROR);
      toast.error(FUTURE_SCHEDULE_ERROR);
      return;
    }
    setScheduleError('');
    onDraftChange?.(buildDraftScheduleUpdate(draft, nextStart, nextEnd));
  };

  const handleStartDate = (value) => {
    const next = shiftScheduleByStartDate(startAt, endAt, value);
    updateSchedule(next.startAt, next.endAt);
  };

  const handleEndDate = (value) => {
    const next = setScheduleEndDate(startAt, endAt, value);
    if (next.adjusted) toast.error(END_BEFORE_START_DATE_ERROR);
    updateSchedule(next.startAt, next.endAt);
  };

  const handleStartTime = (value) => {
    const next = setScheduleStartTime(startAt, endAt, value);
    updateSchedule(next.startAt, next.endAt);
  };

  const handleEndTime = (value) => {
    const next = setScheduleEndTime(startAt, endAt, value);
    if (next.adjusted) toast.error(END_BEFORE_START_ERROR);
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
      idNumber: contact.idNumber || contact.id_number || prev.idNumber,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isScheduleInPast(startAt)) {
      toast.error(FUTURE_SCHEDULE_ERROR);
      return;
    }
    if (!form.visitorName?.trim()) {
      toast.error('Visitor name is required.');
      return;
    }
    const nationalPhone = normalizePhoneNational(form.phone);
    if (!nationalPhone || nationalPhone.length < 9) {
      toast.error('A valid mobile phone number is required.');
      return;
    }
    const nrc = formatNrcInput(form.idNumber);
    if (nrc && !isCompleteNrc(nrc)) {
      toast.error('Enter a complete NRC (e.g. 123456/78/9) or leave it blank.');
      return;
    }
    onSave({
      title: form.title.trim(),
      visitorName: form.visitorName.trim(),
      company: form.company.trim(),
      phone: buildFullPhone(form.phoneCountry || DEFAULT_PHONE_COUNTRY, form.phone),
      idType: 'nrc',
      idNumber: nrc,
      email: form.email?.trim() || '',
      purpose: form.purpose.trim(),
      siteId: resolvedSiteId,
      categoryId: form.categoryId || undefined,
      scheduledAt: toIsoLocalDateTime(startAt),
      allDay: form.allDay,
    });
  };

  const formClassName = isPage
    ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm'
    : 'mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-navy-100 bg-white shadow-xl shadow-navy-950/20';

  const editor = (
      <form
        onSubmit={handleSubmit}
        className={formClassName}
      >
        <div className="shrink-0 border-b border-navy-100 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-navy-50 text-navy-600 transition-colors hover:bg-navy-100 hover:text-navy-900"
              aria-label={isPage ? 'Back to appointments' : 'Close appointment editor'}
            >
              <X size={18} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-navy-50 text-cyan-700 shadow-sm">
                  <CalendarDays size={22} strokeWidth={2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
                    Executive appointment
                  </p>
                  <p className="truncate text-sm text-navy-500">
                    {executive?.name ? `Scheduling for ${executive.name}` : 'Schedule a visitor appointment'}
                  </p>
                </div>
              </div>

              <input
                autoFocus
                value={form.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setForm((prev) => ({ ...prev, title }));
                  onDraftChange?.({ ...draft, title });
                }}
                placeholder="Add title"
                className="w-full rounded-xl border border-navy-200 bg-navy-50 px-3 py-3 text-lg font-semibold text-navy-900 placeholder:text-navy-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />

              <div className="mt-4 rounded-2xl border border-navy-100 bg-navy-50/70 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
                      {form.allDay ? 'Date' : 'Starts'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <ExecutiveDatePicker
                        label={formatShortDate(startAt)}
                        value={toDateInputValue(startAt)}
                        min={todayMinDate}
                        isOpen={openDatePicker === 'start'}
                        onOpenChange={(nextOpen) => setOpenDatePicker(nextOpen ? 'start' : null)}
                        onChange={handleStartDate}
                        ariaLabel={form.allDay ? 'Date' : 'Start date'}
                      />
                      {!form.allDay && (
                        <SchedulePill
                          label={formatTime12Compact(startAt)}
                          value={toTimeInputValue(startAt)}
                          type="time"
                          onChange={(event) => handleStartTime(event.target.value)}
                          ariaLabel="Start time"
                        />
                      )}
                    </div>
                  </div>

                  {!form.allDay && (
                    <>
                      <div className="hidden pb-2 text-sm font-semibold text-navy-300 sm:block" aria-hidden="true">
                        →
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
                          Ends
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <SchedulePill
                            label={formatTime12Compact(endAt)}
                            value={toTimeInputValue(endAt)}
                            type="time"
                            onChange={(event) => handleEndTime(event.target.value)}
                            ariaLabel="End time"
                          />
                          <ExecutiveDatePicker
                            label={formatShortDate(endAt)}
                            value={toDateInputValue(endAt)}
                            min={toDateInputValue(startAt)}
                            isOpen={openDatePicker === 'end'}
                            onOpenChange={(nextOpen) => setOpenDatePicker(nextOpen ? 'end' : null)}
                            onChange={handleEndDate}
                            ariaLabel="End date"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div
                    className="inline-flex h-10 shrink-0 items-center self-start rounded-xl border border-navy-200 bg-white px-3 text-xs font-semibold text-navy-500 sm:self-end"
                  >
                    {timezoneLabel}
                  </div>
                </div>

                {scheduleError && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    <TriangleAlert size={16} className="shrink-0" aria-hidden="true" />
                    {scheduleError}
                  </div>
                )}

                <div className="mt-3 flex flex-col gap-3 border-t border-navy-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="inline-flex items-center gap-2.5 text-sm font-medium text-navy-700">
                    <input
                      type="checkbox"
                      checked={form.allDay}
                      onChange={(event) => handleAllDayChange(event.target.checked)}
                      className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    All day
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs font-semibold uppercase tracking-wider text-navy-400 sm:inline">
                      Repeat
                    </span>
                    <NavySelect
                      value={form.repeat || 'none'}
                      onChange={(event) => setForm((prev) => ({ ...prev, repeat: event.target.value }))}
                      className="min-w-[11rem] bg-white"
                    >
                      <option value="none">Does not repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </NavySelect>
                  </div>
                </div>
              </div>
            </div>

            <LoadingButton
              type="submit"
              loading={saving}
              loadingLabel="Saving"
              variant="primary"
              className="mt-0.5 shrink-0 border-navy-800 bg-navy-800 px-5 hover:bg-navy-700"
            >
              Save
            </LoadingButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-navy-50/60">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:gap-6">
            <div className="min-w-0 flex-1 space-y-5">
              <SegmentedControl
                fullWidth
                size="md"
                variant="kioskSoft"
                value={activeTab}
                onChange={setActiveTab}
                options={[
                  { value: 'details', label: 'Event details', icon: BriefcaseBusiness },
                  { value: 'find-time', label: 'Find a time', icon: CalendarDays },
                ]}
              />

              {activeTab === 'details' ? (
                <FormSection
                  title="Appointment details"
                  subtitle="Location, reminders, and visit notes"
                >
                  <div className="space-y-1">
                    <FieldRow icon={MapPin} iconClassName="mt-0">
                      <p className={`${INPUT} font-medium`}>{resolvedSiteLabel}</p>
                    </FieldRow>

                    <FieldRow icon={Bell}>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <NavySelect className="w-auto min-w-[8rem]">
                            <option>Notification</option>
                          </NavySelect>
                          <NavySelect
                            value={form.notifyMinutes ?? 30}
                            onChange={(event) => setForm((prev) => ({
                              ...prev,
                              notifyMinutes: Number(event.target.value),
                            }))}
                            className="w-auto min-w-[4.5rem]"
                          >
                            <option value={10}>10</option>
                            <option value={30}>30</option>
                            <option value={60}>60</option>
                            <option value={1440}>1440</option>
                          </NavySelect>
                          <NavySelect className="w-auto min-w-[6.5rem]">
                            <option>minutes</option>
                            <option>hours</option>
                            <option>days</option>
                          </NavySelect>
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-navy-200 bg-white text-navy-500 hover:bg-navy-50"
                            aria-label="Remove notification"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="text-sm font-semibold text-cyan-700 hover:text-cyan-800 hover:underline"
                        >
                          Add notification
                        </button>
                      </div>
                    </FieldRow>

                    <FieldRow icon={BriefcaseBusiness}>
                      <div className="flex flex-wrap items-center gap-2">
                        <NavySelect className="w-auto min-w-[6.5rem]">
                          <option>Busy</option>
                          <option>Free</option>
                        </NavySelect>
                        <NavySelect className="w-auto min-w-[10rem]">
                          <option>Default visibility</option>
                          <option>Public</option>
                          <option>Private</option>
                        </NavySelect>
                        <NavySelect
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
                        </NavySelect>
                        <button type="button" className="text-navy-400 hover:text-navy-600" aria-label="Visibility help">
                          <HelpCircle size={18} />
                        </button>
                      </div>
                    </FieldRow>

                    <FieldRow icon={AlignLeft} iconClassName="mt-1">
                      <div className="overflow-hidden rounded-xl border border-navy-200 bg-navy-50">
                        <div className="flex flex-wrap items-center gap-1 border-b border-navy-100 bg-white px-2 py-1.5">
                          {[Bold, Italic, Underline, List, ListOrdered, Link2, RemoveFormatting].map((Icon, index) => (
                            <button
                              key={Icon.displayName || index}
                              type="button"
                              className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-50 hover:text-navy-800"
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
                          className="w-full resize-y border-0 bg-navy-50 px-3 py-3 text-sm text-navy-900 placeholder:text-navy-400 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </FieldRow>
                  </div>
                </FormSection>
              ) : (
                <FormSection title="Find a time" subtitle="Pick an open slot on the calendar">
                  <ExecutiveFindTimePanel
                    draft={draft}
                    appointments={appointments}
                    onDraftChange={onDraftChange}
                    onScheduleRejected={(message) => toast.error(message)}
                  />
                </FormSection>
              )}
            </div>

            <aside className="w-full shrink-0 lg:w-[300px]">
              <FormSection title="Guests" subtitle="Visitor contact details">
                <div className="mb-1 flex items-center gap-2 text-cyan-700">
                  <Users size={16} aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Primary guest</span>
                </div>

                <ExecutiveContactAutocomplete
                  value={form.visitorName}
                  onChange={(visitorName) => setForm((prev) => ({ ...prev, visitorName }))}
                  onSelectContact={handleContactSelect}
                  placeholder="Add guests"
                  required
                  inputClassName={INPUT}
                />

                <div className="mt-3 space-y-2.5">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-500">
                      Mobile phone <span className="text-red-500">*</span>
                    </label>
                    <PhoneInput
                      country={form.phoneCountry || DEFAULT_PHONE_COUNTRY}
                      value={form.phone || ''}
                      onCountryChange={(phoneCountry) => setForm((prev) => ({ ...prev, phoneCountry }))}
                      onChange={(phone) => setForm((prev) => ({ ...prev, phone }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-500">
                      NRC
                    </label>
                    <NavyInput
                      value={form.idNumber || ''}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        idNumber: formatNrcInput(event.target.value),
                      }))}
                      placeholder={NRC_PLACEHOLDER}
                      maxLength={NRC_INPUT_MAX_LENGTH}
                      inputMode="numeric"
                    />
                  </div>
                  <NavyInput
                    type="email"
                    value={form.email || ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="Email"
                  />
                  <NavyInput
                    value={form.company}
                    onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                    placeholder="Company / organization"
                  />
                </div>

                <div className="mt-5 border-t border-navy-100 pt-4">
                  <p className="text-sm font-semibold text-navy-900">Guest permissions</p>
                  <div className="mt-3 space-y-2.5 text-sm text-navy-700">
                    <label className="flex items-center gap-2.5">
                      <input type="checkbox" disabled className="h-4 w-4 rounded border-navy-300" />
                      Modify event
                    </label>
                    <label className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        defaultChecked
                        disabled
                        className="h-4 w-4 rounded border-navy-300 text-cyan-600"
                      />
                      Invite others
                    </label>
                    <label className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        defaultChecked
                        disabled
                        className="h-4 w-4 rounded border-navy-300 text-cyan-600"
                      />
                      See guest list
                    </label>
                  </div>
                </div>
              </FormSection>
            </aside>
          </div>
        </div>
      </form>
  );

  if (isPage) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {editor}
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-navy-950/45 px-3 py-6 backdrop-blur-[2px] sm:px-6 sm:py-10 animate-in fade-in duration-200">
      {editor}
    </div>,
    document.body,
  );
}
