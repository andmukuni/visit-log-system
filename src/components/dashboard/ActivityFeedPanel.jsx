import { useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import IconButton from '../ui/IconButton';
import { formatDateTime } from '../../utils/helpers';

const EVENT_META = {
  registered: { label: 'Registered', direction: 'in' },
  approved: { label: 'Approved', direction: 'in' },
  rejected: { label: 'Rejected', direction: 'out' },
  checked_in: { label: 'Check-in', direction: 'in' },
  checked_out: { label: 'Check-out', direction: 'out' },
};

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

export default function ActivityFeedPanel({
  title = 'Recent activity',
  items = [],
  tabs = ['History', 'Pending', 'Today'],
}) {
  const [tab, setTab] = useState(tabs[0]);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let rows = items;
    if (tab === 'Pending') {
      rows = rows.filter((r) => ['registered', 'approved'].includes(r.event_type));
    } else if (tab === 'Today') {
      const today = new Date().toDateString();
      rows = rows.filter((r) => r.created_at && new Date(r.created_at).toDateString() === today);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => (r.visitor_name || '').toLowerCase().includes(q));
    }
    return rows;
  }, [items, tab, query]);

  const groups = groupByDate(filtered);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100 h-full">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <div className="flex items-center gap-1">
          <div className="relative hidden sm:block">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search activity"
              className="h-8 w-32 rounded-xl border border-gray-100 bg-gray-50 pl-8 pr-2 text-xs"
            />
          </div>
          <IconButton icon={Filter} label="Filter" tooltip="Filter" size="sm" variant="ghost" />
        </div>
      </div>

      <div className="flex gap-2 mb-4 p-1 bg-gray-100 rounded-2xl">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
        {groups.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No activity yet.</p>
        )}
        {groups.map(([date, rows]) => (
          <div key={date}>
            <p className="text-xs font-semibold text-gray-400 mb-2">{date}</p>
            <div className="space-y-2">
              {rows.map((row) => {
                const meta = EVENT_META[row.event_type] || { label: row.event_type, direction: 'in' };
                const inbound = meta.direction === 'in';
                return (
                  <div key={row.id} className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-gray-50 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                      {(row.visitor_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{row.visitor_name || 'Visitor'}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(row.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${inbound ? 'text-emerald-600' : 'text-gray-700'}`}>
                        {meta.label}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">
                        {inbound ? 'In' : 'Out'}
                      </p>
                    </div>
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
