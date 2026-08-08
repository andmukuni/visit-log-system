import { useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  Eye,
  Filter,
  MoreVertical,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { Spinner } from '../ui';
import {
  formatAppointmentTimeRange,
  resolveAppointmentDisplayStatus,
  resolvePurposeDisplay,
  resolveVisitorType,
} from './appointmentDisplayUtils';

const TABS = [
  { id: 'all', label: 'All Appointments' },
  { id: 'awaiting', label: 'Awaiting Approval', badgeKey: 'awaiting' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'Date Range' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const VISITOR_TYPE_OPTIONS = [
  { value: '', label: 'Visitor Type' },
  { value: 'standard', label: 'Standard' },
  { value: 'vip', label: 'VIP' },
  { value: 'vvip', label: 'VVIP' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Status' },
  { value: 'expected', label: 'Expected' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'pre_registered', label: 'Pre-registered' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'completed', label: 'Completed' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'cancelled', label: 'Cancelled' },
];

function FilterDropdown({ label, icon: Icon, value, onChange, options }) {
  const activeLabel = options.find((option) => option.value === value)?.label || label;
  const isActive = Boolean(value);

  return (
    <label className="relative inline-flex shrink-0">
      <span
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
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

function AppointmentStatusPill({ visitStatus }) {
  const status = resolveAppointmentDisplayStatus(visitStatus);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${status.bg} ${status.text}`}>
      {status.label}
    </span>
  );
}

function VisitorTypeCell({ classification, categoryName }) {
  const type = resolveVisitorType(classification, categoryName);
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-800">
      <span className={`h-2 w-2 shrink-0 rounded-full ${type.dot}`} aria-hidden="true" />
      <span className="font-medium">{type.label}</span>
      {type.isVvip && <Crown size={14} className="text-amber-500" aria-hidden="true" />}
    </span>
  );
}

function exportAppointmentsCsv(rows) {
  const headers = ['Time', 'Visitor', 'Phone', 'Type', 'Purpose', 'Host', 'Status'];
  const lines = rows.map((row) => {
    const { range, dayLabel } = formatAppointmentTimeRange(row.scheduled_at, row.duration_minutes);
    const status = resolveAppointmentDisplayStatus(row.visit_status).label;
    const type = resolveVisitorType(row.classification, row.category_name).label;
    const { title, subtitle } = resolvePurposeDisplay(row);
    return [
      `${range} (${dayLabel})`,
      row.visitor_name || '',
      row.phone || '',
      type,
      subtitle ? `${title} / ${subtitle}` : title,
      row.host_name || '',
      status,
    ];
  });

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'appointments.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function ExecutiveAppointmentsTableFooter({
  total = 0,
  page = 1,
  pageSize = 7,
  onPageChange,
  onPageSizeChange,
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxVisible = 3;
    let startPage = Math.max(1, safePage - 1);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    startPage = Math.max(1, endPage - maxVisible + 1);
    for (let i = startPage; i <= endPage; i += 1) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  return (
    <div className={`grid shrink-0 grid-cols-1 items-center gap-3 bg-white px-5 py-3 sm:grid-cols-[1fr_auto_1fr] ${className}`}>
      <p className="text-sm text-gray-500 sm:justify-self-start">
        {total === 0
          ? 'No appointments'
          : `Showing ${start} to ${end} of ${total} appointments`}
      </p>

      <div className="flex items-center justify-center gap-1 sm:justify-self-center">
        <button
          type="button"
          onClick={() => onPageChange?.(safePage - 1)}
          disabled={safePage <= 1}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={18} />
        </button>
        {pageNumbers.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange?.(pageNumber)}
            className={`min-w-[2rem] rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors ${
              pageNumber === safePage
                ? 'bg-navy-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange?.(safePage + 1)}
          disabled={safePage >= totalPages}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <label className="flex items-center justify-start gap-2 text-sm text-gray-500 sm:justify-self-end">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
          aria-label="Appointments per page"
        >
          {[7, 10, 25, 50].map((size) => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export default function ExecutiveAppointmentsTableSection({
  rows = [],
  loading = false,
  total = 0,
  page = 1,
  pageSize = 7,
  tab = 'all',
  stats = {},
  search = '',
  dateRange = '',
  classification = '',
  status = '',
  selectedId = null,
  splitLayout = false,
  onTabChange,
  onSearchChange,
  onDateRangeChange,
  onClassificationChange,
  onStatusChange,
  onPageChange,
  onPageSizeChange,
  onSelect,
  onView,
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col overflow-hidden bg-white ${
      splitLayout ? 'flex-[1.75] lg:min-w-0' : 'rounded-2xl border border-gray-200 shadow-sm'
    }`}>
      <div className="border-b border-gray-200">
        <div className="flex gap-0 overflow-x-auto px-5 pt-1">
          {TABS.map(({ id, label, badgeKey }) => {
            const active = tab === id;
            const badge = badgeKey ? stats[badgeKey] : null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange?.(id)}
                className={`relative shrink-0 whitespace-nowrap px-4 pb-3 pt-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'text-navy-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#1a73e8]'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {label}
                  {badge > 0 && (
                    <span className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-gray-200 px-5 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search by visitor name, purpose or host..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <FilterDropdown
              label="Date range"
              icon={Calendar}
              value={dateRange}
              onChange={onDateRangeChange}
              options={DATE_RANGE_OPTIONS}
            />
            <FilterDropdown
              label="Visitor type"
              icon={Users}
              value={classification}
              onChange={onClassificationChange}
              options={VISITOR_TYPE_OPTIONS}
            />
            <FilterDropdown
              label="Status"
              icon={Filter}
              value={status}
              onChange={onStatusChange}
              options={STATUS_OPTIONS}
            />
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              More Filters
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportAppointmentsCsv(rows)}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 lg:self-center"
          >
            <Download size={15} aria-hidden="true" />
            Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">
            No appointments match your filters.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-3">Time</th>
                <th className="whitespace-nowrap px-4 py-3">Visitor</th>
                <th className="whitespace-nowrap px-4 py-3">Type</th>
                <th className="min-w-[180px] px-4 py-3">Purpose</th>
                <th className="whitespace-nowrap px-4 py-3">Host</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const selected = selectedId === row.id;
                const { range, dayLabel } = formatAppointmentTimeRange(row.scheduled_at, row.duration_minutes);
                const { title: purposeTitle, subtitle: purposeSubtitle } = resolvePurposeDisplay(row);

                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelect?.(row)}
                    className={`cursor-pointer transition-colors ${
                      selected
                        ? 'border-l-[3px] border-l-[#1a73e8] bg-sky-50/90'
                        : 'border-l-[3px] border-l-transparent hover:bg-gray-50/70'
                    }`}
                  >
                    <td className="whitespace-nowrap px-5 py-4 align-top">
                      <p className="font-semibold tabular-nums text-gray-900">{range}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{dayLabel}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-gray-900">{row.visitor_name || '—'}</p>
                      {row.phone && <p className="mt-0.5 text-xs text-gray-500">{row.phone}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 align-top">
                      <VisitorTypeCell classification={row.classification} categoryName={row.category_name} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-gray-900">{purposeTitle}</p>
                      {purposeSubtitle && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{purposeSubtitle}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 align-top text-gray-700">
                      {row.host_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 align-top">
                      <AppointmentStatusPill visitStatus={row.visit_status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 align-top text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onView?.(row);
                          }}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white hover:text-navy-700"
                          aria-label={`View ${row.visitor_name || 'appointment'}`}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white hover:text-navy-700"
                          aria-label="More actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ExecutiveAppointmentsTableFooter
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        className={`border-t border-gray-200 ${splitLayout ? 'lg:hidden' : ''}`}
      />
    </div>
  );
}
