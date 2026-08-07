export default function CategoryBarChart({
  title = 'Breakdown',
  subtitle,
  items = [],
  accent = 'orange',
}) {
  const barColors = {
    orange: 'bg-orange-400',
    blue: 'bg-blue-400',
    purple: 'bg-purple-400',
  };
  const barClass = barColors[accent] || barColors.orange;
  const values = items.map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
      <div className="flex items-end justify-between gap-2 h-40 pt-2">
        {items.map((item) => (
          <div key={item.label} className="flex flex-1 flex-col items-center gap-2 min-w-0">
            <div className="w-full flex items-end justify-center h-32">
              <div
                className={`w-full max-w-[2rem] rounded-t-2xl ${barClass} transition-all duration-500`}
                style={{ height: `${Math.max(12, (Number(item.value || 0) / max) * 100)}%` }}
                title={`${item.label}: ${item.value}`}
              />
            </div>
            <span className="text-[10px] font-medium text-gray-400 truncate w-full text-center">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
