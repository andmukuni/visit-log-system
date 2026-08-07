export default function FilterPills({ options = [], value, onChange, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value ?? opt.label}
            type="button"
            onClick={() => onChange?.(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {opt.label}
            {opt.count != null && (
              <span className={`text-xs ${active ? 'text-gray-300' : 'text-gray-400'}`}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
