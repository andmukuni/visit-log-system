import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

export default function RecordFeedPanel({
  title = 'Records',
  items = [],
  emptyMessage = 'Nothing to show yet.',
  searchPlaceholder = 'Search',
  getSearchText = (item) => [item.title, item.subtitle, item.badge].filter(Boolean).join(' '),
  tabs,
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(tabs?.[0]);

  const filtered = useMemo(() => {
    let rows = items;
    if (tab && tab !== 'All') {
      rows = rows.filter((item) => item.group === tab || item.status === tab);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((item) => getSearchText(item).toLowerCase().includes(q));
    }
    return rows;
  }, [items, tab, query, getSearchText]);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100 h-full">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <div className="relative hidden sm:block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search ${title}`}
            className="h-8 w-32 rounded-xl border border-gray-100 bg-gray-50 pl-8 pr-2 text-xs"
          />
        </div>
      </div>

      {tabs?.length > 0 && (
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
      )}

      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">{emptyMessage}</p>
        )}
        {filtered.map((item) => {
          const content = (
            <>
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                {(item.avatar || item.title || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                {item.subtitle && <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>}
              </div>
              {item.badge != null && (
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">{item.badge}</p>
                  {item.badgeLabel && (
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{item.badgeLabel}</p>
                  )}
                </div>
              )}
            </>
          );
          const className = 'flex items-center gap-3 rounded-2xl p-2.5 hover:bg-gray-50 transition-colors';
          if (item.to) {
            return (
              <Link key={item.id || item.title} to={item.to} className={className}>
                {content}
              </Link>
            );
          }
          return (
            <div key={item.id || item.title} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
