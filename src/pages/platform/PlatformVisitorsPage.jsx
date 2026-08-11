import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Filter,
  Search,
  X,
} from 'lucide-react';
import {
  PageHeader,
  DataTable,
  StatusBadge,
} from '../../components/ui';
import { VisitorDetailView } from '../../components/visitors';
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

function VisitorDetailSidebar({ visit, onClose }) {
  if (!visit?.id) return null;

  return (
    <VisitorDetailView
      visitId={visit.id}
      fetchVisit={platformApi.getVisit}
      layout="sidebar"
      onClose={onClose}
    />
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
