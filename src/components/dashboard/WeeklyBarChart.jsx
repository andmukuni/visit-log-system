const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyBarChart({ title = 'Activity', subtitle = 'This week', data = [] }) {
  const values = data.length === 7 ? data : [3, 5, 2, 8, 6, 4, 7];
  const max = Math.max(...values, 1);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        <select className="text-xs rounded-xl border border-gray-100 bg-gray-50 px-2 py-1.5 text-gray-600" aria-label="Chart range">
          <option>Weekly</option>
          <option>Monthly</option>
        </select>
      </div>
      <div className="flex items-end justify-between gap-2 h-40 pt-2">
        {values.map((value, idx) => (
          <div key={DAY_LABELS[idx]} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full flex items-end justify-center h-32">
              <div
                className="w-full max-w-[2rem] rounded-t-2xl bg-orange-400 transition-all duration-500"
                style={{ height: `${Math.max(12, (value / max) * 100)}%` }}
                aria-label={`${value} visits`}
              />
            </div>
            <span className="text-[10px] font-medium text-gray-400">{DAY_LABELS[idx]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
