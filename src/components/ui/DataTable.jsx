import { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from '../EmptyState';
import IconButton from './IconButton';
import { Eye } from 'lucide-react';

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
}) {
  const [internalSelected, setInternalSelected] = useState([]);
  const selected = selectedIds ?? internalSelected;
  const setSelected = onSelectionChange ?? setInternalSelected;

  const allIds = useMemo(() => data.map(getRowId).filter(Boolean), [data, getRowId]);
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

  const tableShell = 'rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden';

  if (loading) {
    return (
      <div className={tableShell}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-200">
                {selectable && <th className="w-10 px-3 py-2.5" />}
                {columns.map((col, i) => (
                  <th key={i} className="text-left px-3 py-2.5">
                    <div className="h-3 bg-gray-200 rounded w-16 animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b border-gray-100">
                  {selectable && <td className="px-3 py-2" />}
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} className="px-3 py-2">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
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
      <div className={`${tableShell} p-8`}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <div className={tableShell}>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-200">
              {selectable && (
                <th className="w-10 px-3 py-2.5">
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
                  className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => {
              const rowId = getRowId(row) ?? rowIdx;
              const isSelected = selected.includes(rowId);
              return (
                <tr
                  key={rowId}
                  className={`border-b border-gray-100 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                  } ${isSelected ? 'bg-cyan-50/40' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                      className={`px-3 py-2 align-middle ${col.align === 'right' ? 'text-right' : ''}`}
                      onClick={col.key === 'actions' ? (e) => e.stopPropagation() : undefined}
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
        {data.map((row, rowIdx) => {
          const rowId = getRowId(row) ?? rowIdx;
          return (
            <article
              key={rowId}
              onClick={() => onRowClick?.(row)}
              className={`p-4 ${onRowClick ? 'cursor-pointer active:bg-gray-50 transition-colors' : ''}`}
            >
              <div className="space-y-2">
                {columns.filter((c) => c.key !== 'actions').map((col, colIdx) => {
                  const value = getCellValue(row, col);
                  return (
                    <div key={col.key || colIdx} className="flex items-start justify-between gap-3">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{col.label}</span>
                      <div className={`text-sm text-gray-800 text-right ${colIdx === 0 ? 'font-semibold' : ''}`}>
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
