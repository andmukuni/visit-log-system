export default function HighlightBalanceCard({
  title = 'On site now',
  value = 0,
  subtitle,
  badge = 'Live',
}) {
  return (
    <div className="rounded-3xl p-5 text-white shadow-lg bg-blue-500 min-h-[160px] flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-white/90">{title}</p>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-1 rounded-lg">{badge}</span>
      </div>
      <div>
        <p className="text-4xl font-bold tabular-nums">{value}</p>
        {subtitle && <p className="text-xs text-white/80 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
