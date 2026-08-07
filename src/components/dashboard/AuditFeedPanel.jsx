import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatDateTime } from '../../utils/helpers';

function groupByDate(items) {
  const groups = {};
  for (const item of items) {
    const key = item.created_at
      ? new Date(item.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Recent';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups);
}

export default function AuditFeedPanel({ title = 'Audit activity', items = [] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (r) =>
        (r.action || '').toLowerCase().includes(q) ||
        (r.actor_name || '').toLowerCase().includes(q) ||
        (r.result || '').toLowerCase().includes(q),
    );
  }, [items, query]);

  const groups = groupByDate(filtered);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100 h-full">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <div className="relative hidden sm:block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search audit"
            className="h-8 w-32 rounded-xl border border-gray-100 bg-gray-50 pl-8 pr-2 text-xs"
          />
        </div>
      </div>

      <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
        {groups.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No audit events yet.</p>
        )}
        {groups.map(([date, rows]) => (
          <div key={date}>
            <p className="text-xs font-semibold text-gray-400 mb-2">{date}</p>
            <div className="space-y-2">
              {rows.map((row) => {
                const success = row.result === 'success' || row.result === 'allowed';
                return (
                  <div key={row.id} className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-gray-50 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                      {(row.actor_name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{row.action || 'Action'}</p>
                      <p className="text-xs text-gray-400">
                        {row.actor_name || 'System'}
                        {(row.subtitle || row.organisation_name) ? ` · ${row.subtitle || row.organisation_name}` : ''}
                        {' · '}
                        {formatDateTime(row.created_at)}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                      success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {row.result || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
