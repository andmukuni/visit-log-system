import { useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  Download,
  Eye,
  Filter,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { DataTable, IconButton, StatusBadge, TablePagination, VisitorTypeBadge } from '../ui';
import {
  formatVisitExpectedDisplay,
} from './appointmentDisplayUtils';

const TABS = [
  { id: 'all', label: 'All Visitors' },
  { id: 'awaiting', label: 'Awaiting Approval', badgeKey: 'awaiting' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'on_site', label: 'On-Site Now', badgeKey: 'onSite' },
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

function useVisitorColumns(onView) {
  return useMemo(() => [
    {
      key: 'expected_at',
      label: 'Expected',
      render: (_, row) => {
        const { range, dayLabel } = formatVisitExpectedDisplay(row.expected_at);
        return (
          <div>
            <p className="font-medium tabular-nums text-gray-900">{range}</p>
            <p className="text-xs text-gray-500">{dayLabel}</p>
          </div>
        );
      },
    },
    {
      key: 'full_name',
      label: 'Visitor',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.full_name || '—'}</p>
          {row.phone && <p className="text-xs text-gray-500">{row.phone}</p>}
        </div>
      ),
    },
    {
      key: 'classification',
      label: 'Type',
      render: (_, row) => <VisitorTypeBadge classification={row.classification} />,
    },
    {
      key: 'purpose',
      label: 'Purpose',
      render: (_, row) => (
        <div className="min-w-[120px]">
          <p className="font-medium text-gray-900">{row.purpose || row.category_name || '—'}</p>
          {row.company && <p className="line-clamp-2 text-xs text-gray-500">{row.company}</p>}
        </div>
      ),
    },
    {
      key: 'host_name',
      label: 'Host',
      render: (_, row) => row.host_name || '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => (
        <IconButton
          icon={Eye}
          label={`View ${row.full_name || 'visitor'}`}
          tooltip="View"
          variant="ghost"
          size="sm"
          onClick={() => onView?.(row)}
        />
      ),
    },
  ], [onView]);
}

function exportVisitorsCsv(rows) {
  const headers = ['Expected', 'Visitor', 'Phone', 'Type', 'Purpose', 'Company', 'Host', 'Status'];
  const lines = rows.map((row) => {
    const { range, dayLabel } = formatVisitExpectedDisplay(row.expected_at);
    return [
      `${range} (${dayLabel})`,
      row.full_name || '',
      row.phone || '',
      row.classification || 'standard',
      row.purpose || '',
      row.company || '',
      row.host_name || '',
      row.status || '',
    ];
  });

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'visitors.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function ExecutiveVisitorsTableFooter({
  total = 0,
  page = 1,
  pageSize = 7,
  onPageChange,
  onPageSizeChange,
  className = '',
}) {
  return (
    <TablePagination
      page={page}
      pageSize={pageSize}
      totalItems={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={[7, 10, 25, 50]}
      className={className}
    />
  );
}

export default function ExecutiveVisitorsTableSection({
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
  const columns = useVisitorColumns(onView);

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white ${
      splitLayout ? 'lg:min-w-0 lg:flex-[1.75]' : ''
    }`}
    >
      <div className="shrink-0 border-b border-gray-200">
        <div className="flex gap-0 overflow-x-auto px-4 pt-0.5 sm:px-5">
          {TABS.map(({ id, label, badgeKey }) => {
            const active = tab === id;
            const badge = badgeKey ? stats[badgeKey] : null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange?.(id)}
                className={`relative shrink-0 whitespace-nowrap px-3 pb-2 pt-2 text-xs font-semibold transition-colors sm:px-4 sm:pb-2.5 sm:pt-2.5 sm:text-sm ${
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

      <div className="shrink-0 border-b border-gray-200 px-4 py-2 sm:px-5 sm:py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search by visitor name, purpose or host..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0">
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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              More Filters
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportVisitorsCsv(rows)}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm lg:self-center"
          >
            <Download size={14} aria-hidden="true" />
            Export
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <DataTable
          embedded
          columns={columns}
          data={rows}
          loading={loading}
          emptyTitle="No visitors match your filters."
          emptyDescription="Try adjusting your search or filters."
          onRowClick={onSelect}
          activeRowId={selectedId}
          serverPagination
          page={page}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={[7, 10, 25, 50]}
          pagination={!splitLayout}
        />
      </div>

      {splitLayout && (
        <ExecutiveVisitorsTableFooter
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          className="border-t border-gray-200 lg:hidden"
        />
      )}
    </div>
  );
}
