const VARIANT_CLASSES = {
  default: {
    active: 'bg-gray-900 text-white',
    inactive: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
  },
  soft: {
    active: 'bg-cyan-50 text-cyan-800 border border-cyan-200 shadow-sm',
    inactive: 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100 hover:border-gray-200',
  },
  outline: {
    active: 'bg-navy-900 text-white border border-navy-900 shadow-sm',
    inactive: 'bg-white text-navy-600 border border-gray-200 hover:border-navy-200 hover:bg-navy-50/50',
  },
};

const SIZE_CLASSES = {
  default: 'px-3.5 py-1.5 text-sm',
  sm: 'px-3 py-1 text-xs',
};

export default function FilterPills({
  options = [],
  value,
  onChange,
  className = '',
  variant = 'default',
  size = 'default',
}) {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.default;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.default;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value ?? opt.label}
            type="button"
            onClick={() => onChange?.(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-colors ${sizeClass} ${
              active ? variantClass.active : variantClass.inactive
            }`}
          >
            {opt.dot && (
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-white/90' : opt.dot}`}
                aria-hidden="true"
              />
            )}
            {opt.label}
            {opt.count != null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                active && variant === 'outline' ? 'bg-white/15 text-white' : active ? 'text-cyan-600' : 'text-gray-400'
              }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
