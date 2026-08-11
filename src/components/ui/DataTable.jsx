import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from '../EmptyState';
import IconButton from './IconButton';
import { Eye } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

const TABLE_SIZE = {
  default: {
    table: 'text-sm',
    th: 'text-xs',
    td: 'py-2',
    thPad: 'py-2.5',
    mobileLabel: 'text-xs',
    mobileValue: 'text-sm',
  },
  comfortable: {
    table: 'text-base',
    th: 'text-sm',
    td: 'py-2.5',
    thPad: 'py-3',
    mobileLabel: 'text-sm',
    mobileValue: 'text-base',
  },
};

function AvatarCell({ name }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
        {initial}
      </span>
      <span className="truncate font-medium text-gray-900">{name || '—'}</span>
    </div>
  );
}

function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  return (
    <div className={`flex flex-col gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p className="text-sm text-gray-500">
        {totalItems === 0
          ? 'No results'
          : `Showing ${start}–${end} of ${totalItems}`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-500">
          <span className="hidden sm:inline">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <IconButton
            icon={ChevronLeft}
            label="Previous page"
            tooltip="Previous page"
            size="sm"
            variant="ghost"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          />
          <span className="min-w-[5.5rem] text-center text-sm font-medium text-gray-700">
            Page {safePage} of {totalPages}
          </span>
          <IconButton
            icon={ChevronRight}
            label="Next page"
            tooltip="Next page"
            size="sm"
            variant="ghost"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          />
        </div>
      </div>
    </div>
  );
}

function TableToolbar({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
      <label className="relative block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
        />
      </label>
    </div>
  );
}

export { TablePagination };

const ACTION_COLUMN_KEYS = new Set(['actions', 'action', 'view']);

function isInteractiveClickTarget(target) {
  return Boolean(
    target?.closest?.(
      'a, button, input, select, textarea, label, [role="button"], [data-row-click-ignore="true"]',
    ),
  );
}

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyTitle = 'No data found',
  emptyDescription = 'There are no items to display.',
  emptyAction,
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectionChange,
  getRowId = (row) => row.id,
  embedded = false,
  toolbar,
  pagination = true,
  serverPagination = false,
  page: pageProp,
  pageSize: pageSizeProp,
  totalItems: totalItemsProp,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  activeRowId = null,
  getRowClassName,
  initialPage = 1,
  size = 'default',
}) {
  const tableSize = TABLE_SIZE[size] || TABLE_SIZE.default;
  const [internalSelected, setInternalSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(pageSizeProp || DEFAULT_PAGE_SIZE);

  const selected = selectedIds ?? internalSelected;
  const setSelected = onSelectionChange ?? setInternalSelected;

  const filteredData = useMemo(() => {
    if (serverPagination) return data;
    const term = String(search || '').trim().toLowerCase();
    if (!term || !toolbar?.searchKeys?.length) return data;

    return data.filter((row) => toolbar.searchKeys.some((key) => (
      String(row[key] ?? '').toLowerCase().includes(term)
    )));
  }, [data, search, serverPagination, toolbar]);

  const effectivePageSize = serverPagination ? (pageSizeProp || pageSize) : pageSize;
  const effectivePage = serverPagination ? (pageProp || 1) : Math.min(page, Math.max(1, Math.ceil(filteredData.length / effectivePageSize)));
  const totalItems = serverPagination ? (totalItemsProp ?? data.length) : filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));

  const paginatedData = useMemo(() => {
    if (serverPagination || !pagination || filteredData.length <= effectivePageSize) return filteredData;
    const start = (effectivePage - 1) * effectivePageSize;
    return filteredData.slice(start, start + effectivePageSize);
  }, [filteredData, pagination, effectivePageSize, effectivePage, serverPagination]);

  useEffect(() => {
    if (serverPagination) return;
    setPage(1);
  }, [search, data, pageSize, serverPagination]);

  useEffect(() => {
    if (serverPagination) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, serverPagination]);

  const allIds = useMemo(
    () => paginatedData.map(getRowId).filter(Boolean),
    [paginatedData, getRowId],
  );
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? [] : allIds);
  }, [allSelected, allIds, setSelected]);

  const toggleRow = useCallback((id, e) => {
    e?.stopPropagation();
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }, [selected, setSelected]);

  useEffect(() => {
    if (!selectable) setSelected([]);
  }, [data, selectable]); // eslint-disable-line react-hooks/exhaustive-deps

  const getCellValue = (row, col) => {
    if (col.type === 'avatar') {
      return <AvatarCell name={row[col.key]} />;
    }
    if (col.render) return col.render(row[col.key], row);
    return row[col.key];
  };

  const tableShell = embedded
    ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
    : 'rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden';

  const showPagination = pagination && totalItems > 0;
  const displayData = pagination ? paginatedData : filteredData;

  if (loading) {
    return (
      <div className={tableShell}>
        <div className="overflow-x-auto">
          <table className={`w-full ${tableSize.table}`}>
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-200">
                {selectable && <th className={`w-10 px-3 ${tableSize.thPad}`} />}
                {columns.map((col, i) => (
                  <th key={i} className={`text-left px-3 ${tableSize.thPad}`}>
                    <div className="h-3 bg-gray-200 rounded w-16 animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b border-gray-100">
                  {selectable && <td className={`px-3 ${tableSize.td}`} />}
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} className={`px-3 ${tableSize.td}`}>
                      <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + (rowIdx * 7) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`${tableShell} ${embedded ? 'p-0' : 'p-8'}`}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  if (filteredData.length === 0) {
    return (
      <div className={tableShell}>
        {toolbar && (
          <TableToolbar
            value={search}
            onChange={setSearch}
            placeholder={toolbar.placeholder}
          />
        )}
        <div className={embedded ? 'py-8' : 'p-8'}>
          <EmptyState
            title="No matching results"
            description="Try adjusting your search terms."
          />
        </div>
      </div>
    );
  }

  return (
    <div className={tableShell}>
      {toolbar && (
        <TableToolbar
          value={search}
          onChange={setSearch}
          placeholder={toolbar.placeholder}
        />
      )}

      <div className="hidden min-h-0 flex-1 overflow-x-auto overflow-y-auto md:block">
        <table className={`w-full min-w-[720px] ${tableSize.table}`}>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-200">
              {selectable && (
                <th className={`w-10 px-3 ${tableSize.thPad}`}>
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {columns.map((col, i) => (
                <th
                  key={col.key || i}
                  className={`px-3 ${tableSize.thPad} ${tableSize.th} font-semibold uppercase tracking-wide text-gray-500 ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, rowIdx) => {
              const rowId = getRowId(row) ?? rowIdx;
              const isSelected = selected.includes(rowId);
              const isActive = activeRowId != null && rowId === activeRowId;
              return (
                <tr
                  key={rowId}
                  className={`border-b border-gray-100 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                  } ${isSelected || isActive ? 'bg-cyan-50/40' : ''} ${getRowClassName?.(row) ?? ''}`}
                  onClick={(e) => {
                    if (!onRowClick || isInteractiveClickTarget(e.target)) return;
                    onRowClick(row);
                  }}
                >
                  {selectable && (
                    <td className={`px-3 ${tableSize.td}`} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${rowIdx + 1}`}
                        checked={isSelected}
                        onChange={(e) => toggleRow(rowId, e)}
                        className="rounded border-gray-300"
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => (
                    <td
                      key={col.key || colIdx}
                      className={`px-3 ${tableSize.td} align-middle ${col.align === 'right' ? 'text-right' : ''} ${col.className || ''}`}
                      onClick={ACTION_COLUMN_KEYS.has(col.key) ? (e) => e.stopPropagation() : undefined}
                    >
                      {getCellValue(row, col)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-gray-100">
        {displayData.map((row, rowIdx) => {
          const rowId = getRowId(row) ?? rowIdx;
          return (
            <article
              key={rowId}
              onClick={(e) => {
                if (!onRowClick || isInteractiveClickTarget(e.target)) return;
                onRowClick(row);
              }}
              className={`p-4 ${onRowClick ? 'cursor-pointer active:bg-gray-50 transition-colors' : ''}`}
            >
              <div className="space-y-2">
                {columns.filter((c) => c.key !== 'actions').map((col, colIdx) => {
                  const value = getCellValue(row, col);
                  return (
                    <div key={col.key || colIdx} className="flex items-start justify-between gap-3">
                      <span className={`font-medium text-gray-400 uppercase tracking-wide ${tableSize.mobileLabel}`}>{col.label}</span>
                      <div className={`text-gray-800 text-right ${tableSize.mobileValue} ${colIdx === 0 ? 'font-semibold' : ''}`}>
                        {value ?? '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      {showPagination && (
        <TablePagination
          page={effectivePage}
          pageSize={effectivePageSize}
          totalItems={totalItems}
          onPageChange={serverPagination ? onPageChange : setPage}
          onPageSizeChange={serverPagination ? onPageSizeChange : setPageSize}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </div>
  );
}

export function RowViewAction({ to, onClick, label = 'View' }) {
  return (
    <IconButton
      icon={Eye}
      label={label}
      tooltip={label}
      size="sm"
      variant="ghost"
      onClick={onClick}
      {...(to ? { as: 'span' } : {})}
    />
  );
}
