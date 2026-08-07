export default function MetricProgressCard({
  title,
  value,
  target,
  percent,
  trend,
  subtitle,
  accent = 'blue',
  showProgress = true,
}) {
  const accents = {
    blue: { chip: 'bg-blue-100 text-blue-600', bar: 'bg-blue-500', surface: 'bg-blue-50' },
    purple: { chip: 'bg-purple-100 text-purple-600', bar: 'bg-purple-500', surface: 'bg-purple-50' },
    orange: { chip: 'bg-orange-100 text-orange-600', bar: 'bg-orange-500', surface: 'bg-orange-50' },
  };
  const theme = accents[accent] || accents.blue;
  const pct = Math.min(100, Math.max(0, percent ?? (target ? Math.round((value / target) * 100) : 0)));

  return (
    <div className={`rounded-3xl border border-gray-100 ${theme.surface} p-4 shadow-sm min-w-[220px] flex-1`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value ?? 0}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {trend != null && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${theme.chip}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      {showProgress && target != null && (
        <p className="text-xs text-gray-400 mb-2">Target {target}</p>
      )}
      {showProgress && (
        <>
          <div className="h-2 rounded-full bg-white/80 overflow-hidden">
            <div className={`h-full rounded-full ${theme.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">{pct}% of target</p>
        </>
      )}
    </div>
  );
}
