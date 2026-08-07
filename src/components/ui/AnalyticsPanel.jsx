export default function AnalyticsPanel({ title = 'Overview', children, className = '' }) {
  return (
    <aside className={`hidden xl:block w-[var(--panel-width)] shrink-0 ${className}`}>
      <div className="sticky top-[var(--header-height)] max-h-[calc(100vh-var(--header-height))] overflow-y-auto p-4 space-y-4">
        {title && (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">{title}</h2>
        )}
        {children}
      </div>
    </aside>
  );
}

export function AnalyticsCard({ title, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {title && <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>}
      {children}
    </div>
  );
}

export function MicroStatGrid({ items = [] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">{item.label}</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{item.value ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}
