import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ClipboardList,
  Filter,
  MapPin,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Spinner,
  VisitorTypeBadge,
} from '../../components/ui';
import { VISIT_LOG_STATUS_OPTIONS } from '../../components/logbook/filterOptions';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { platformApi } from '../../utils/visitorApi';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...VISIT_LOG_STATUS_OPTIONS.filter((option) => option.value),
  { value: 'expected', label: 'Expected' },
  { value: 'arrived_at_gate', label: 'Arrived at gate' },
  { value: 'in_meeting', label: 'In meeting' },
  { value: 'left_premises', label: 'Left premises' },
  { value: 'cancelled', label: 'Cancelled' },
];

const JOURNEY_STEPS = [
  { key: 'expected', label: 'Expected' },
  { key: 'approved', label: 'Approved' },
  { key: 'arrived_at_gate', label: 'At gate' },
  { key: 'reception_check_in', label: 'Reception' },
  { key: 'checked_in', label: 'On site' },
  { key: 'in_meeting', label: 'In meeting' },
  { key: 'checked_out', label: 'Checked out' },
  { key: 'left_premises', label: 'Left premises' },
  { key: 'completed', label: 'Completed' },
];

const STATUS_ALIASES = {
  pre_registered: 'expected',
  pending_approval: 'expected',
  entered_premises: 'reception_check_in',
  waiting: 'checked_in',
};

const EVENT_LABELS = {
  registered: 'Registered',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  arrived_at_gate: 'Arrived at gate',
  reception_check_in: 'Reception check-in',
  entered_premises: 'Entered premises',
  in_meeting: 'In meeting',
  left_premises: 'Left premises',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

function FilterDropdown({ label, icon: Icon, value, onChange, options }) {
  const activeLabel = options.find((option) => option.value === value)?.label || label;
  const isActive = Boolean(value);

  return (
    <label className="relative inline-flex shrink-0">
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
          isActive
            ? 'border-[#1a73e8]/30 bg-sky-50 text-[#1a73e8]'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" />}
        <span>{activeLabel}</span>
        <ChevronDown size={14} className="text-gray-400" aria-hidden="true" />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value || 'all'} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <>
      <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0 pb-2">
        <p className="text-xs font-medium leading-none text-gray-500">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-snug text-navy-900">
          {value || '—'}
        </p>
      </div>
    </>
  );
}

function resolveJourneyIndex(status) {
  const normalized = STATUS_ALIASES[status] || status;
  const idx = JOURNEY_STEPS.findIndex((step) => step.key === normalized);
  return idx >= 0 ? idx : 0;
}

function VisitJourney({ status }) {
  const terminal = ['rejected', 'cancelled', 'denied', 'expired'].includes(status);
  const currentIndex = resolveJourneyIndex(status);

  if (terminal) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
        <p className="text-xs font-medium text-red-700">Visit ended</p>
        <div className="mt-1">
          <StatusBadge status={status} />
        </div>
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {JOURNEY_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? 'bg-[#1a73e8] text-white ring-4 ring-sky-100'
                    : done
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              {index < JOURNEY_STEPS.length - 1 && (
                <span className={`my-0.5 w-0.5 flex-1 min-h-[14px] ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
              )}
            </div>
            <div className={`pb-3 pt-0.5 ${active ? 'text-navy-900' : done ? 'text-gray-700' : 'text-gray-400'}`}>
              <p className={`text-xs font-semibold ${active ? 'text-[#1a73e8]' : ''}`}>{step.label}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VisitorDetailSidebar({ visit, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!visit?.id) {
      setDetail(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setDetail(await platformApi.getVisit(visit.id));
    } catch (err) {
      setDetail(null);
      setError(err?.message || 'Unable to load visit details.');
    } finally {
      setLoading(false);
    }
  }, [visit?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!visit) return null;

  const visitData = detail?.visit || visit;
  const events = detail?.events || [];
  const history = detail?.visitorHistory || [];

  return (
    <aside className="flex min-h-0 w-full flex-col overflow-hidden bg-white lg:w-[360px] lg:shrink-0 lg:border-l lg:border-gray-200">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy-900">{visitData.full_name || visit.visitor_name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{visitData.reference_number || visitData.pass_code || visit.reference_number || 'Visit record'}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close details"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        {loading && (
          <div className="flex justify-center py-12">
            <Spinner size={28} />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={visitData.status || visit.status} />
              <VisitorTypeBadge classification={visitData.classification || visit.classification} size="xs" />
            </div>

            <section className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
                Visit statement
              </h3>
              <p className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-navy-900">
                {visitData.purpose || visit.purpose || 'No purpose recorded for this visit.'}
              </p>
            </section>

            <section className="mt-4 sm:mt-5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
                Who they came to see
              </h3>
              <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
                <DetailRow icon={User} label="Host / employee" value={visitData.host_name || visit.host_name} />
                <DetailRow icon={Building2} label="Organisation" value={visitData.organisation_name || visit.organisation_name} />
                <DetailRow icon={MapPin} label="Site / location" value={visitData.site_name || visit.site_name} />
                <DetailRow icon={Users} label="Company" value={visitData.company || visit.company} />
              </div>
            </section>

            <section className="mt-4 sm:mt-5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
                Progress through the company
              </h3>
              <div className="mt-2">
                <VisitJourney status={visitData.status || visit.status} />
              </div>
            </section>

            <section className="mt-4 sm:mt-5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
                Activity & reasons
              </h3>
              {events.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No activity recorded yet.</p>
              ) : (
                <ol className="mt-2 space-y-2.5">
                  {events.map((evt) => (
                    <li key={evt.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-navy-900">
                        {EVENT_LABELS[evt.event_type] || evt.event_type}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatDateTime(evt.created_at)}
                        {evt.actor_name ? ` · ${evt.actor_name}` : ''}
                      </p>
                      {evt.reason && (
                        <p className="mt-1 text-xs leading-relaxed text-gray-700">{evt.reason}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {history.length > 0 && (
              <section className="mt-4 sm:mt-5">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
                  Previous visits
                </h3>
                <ul className="mt-2 space-y-2">
                  {history.map((item) => (
                    <li key={item.id} className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-navy-900">{formatDateTime(item.created_at)}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="mt-1 text-gray-700">{item.purpose || '—'}</p>
                      <p className="mt-0.5 text-gray-500">Host: {item.host_name || '—'}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

export default function PlatformVisitorsPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (statusFilter) params.status = statusFilter;
      setRows(await platformApi.getVisitors(params));
    } catch (err) {
      setRows([]);
      toast.error(err?.message || 'Unable to load visitors.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [
      row.visitor_name,
      row.full_name,
      row.phone,
      row.email,
      row.company,
      row.purpose,
      row.host_name,
      row.organisation_name,
      row.reference_number,
      row.site_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q)));
  }, [rows, searchInput]);

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (window.innerWidth < 1024) setMobileDetailOpen(true);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'visitor_name',
      label: 'Visitor',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.visitor_name || row.full_name}</p>
          <p className="text-xs text-gray-500">{row.company || row.reference_number || '—'}</p>
        </div>
      ),
    },
    {
      key: 'purpose',
      label: 'Purpose',
      render: (value) => (
        <span className="line-clamp-2 text-sm text-gray-700">{value || '—'}</span>
      ),
    },
    {
      key: 'host_name',
      label: 'Host',
      render: (value) => <span className="text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'organisation_name',
      label: 'Organisation',
      render: (value) => <span className="text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Progress',
      render: (value) => <StatusBadge status={value || 'expected'} />,
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => (
        <span className="text-sm text-gray-600">{formatDateTime(row.created_at)}</span>
      ),
    },
  ], []);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Visitors"
        subtitle="Platform-wide visitor register — purpose, host and journey across all organisations"
        iconKey="visitors"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Visitors' }]}
      />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="border-b border-gray-200 px-4 py-2 sm:px-5 sm:py-2.5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <label className="relative block min-w-0 flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search visitor, purpose, host, organisation…"
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                  />
                </label>
                <FilterDropdown
                  label="Status"
                  icon={Filter}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>

            <DataTable
              embedded
              columns={columns}
              data={filteredRows}
              loading={loading}
              emptyTitle="No visitor records found."
              emptyDescription="Visits will appear here as organisations register and process guests."
              onRowClick={handleSelect}
              activeRowId={selected?.id}
              pagination
              pageSize={10}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>

          {selected && (
            <VisitorDetailSidebar
              visit={selected}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </div>

      {mobileDetailOpen && selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy-900">{selected.visitor_name || selected.full_name}</p>
              <p className="text-xs text-gray-500">{selected.purpose || 'Visit details'}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <VisitorDetailSidebar visit={selected} onClose={() => setMobileDetailOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
