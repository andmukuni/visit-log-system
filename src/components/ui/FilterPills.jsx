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
  segmented: {
    active: 'bg-white text-navy-900 shadow-sm ring-1 ring-navy-900/5',
    inactive: 'text-navy-600 hover:bg-white/60 hover:text-navy-900',
  },
};

const SIZE_CLASSES = {
  default: 'px-3.5 py-1.5 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

function renderDot(opt, active, variant) {
  if (!opt.dot) return null;

  const dotClass = variant === 'segmented' || !active
    ? opt.dot
    : 'bg-white/90';

  return (
    <span
      className={`shrink-0 rounded-full ${variant === 'segmented' ? 'h-2 w-2' : 'h-1.5 w-1.5'} ${dotClass}`}
      aria-hidden="true"
    />
  );
}

export default function FilterPills({
  options = [],
  value,
  onChange,
  className = '',
  variant = 'default',
  size = 'default',
  scrollable = variant === 'segmented',
  'aria-label': ariaLabel = 'Filter options',
}) {
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.default;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.default;

  const pills = options.map((opt) => {
    const active = value === opt.value;
    return (
      <button
        key={opt.value ?? opt.label}
        type="button"
        role={variant === 'segmented' ? 'tab' : undefined}
        aria-selected={variant === 'segmented' ? active : undefined}
        onClick={() => onChange?.(opt.value)}
        className={`inline-flex shrink-0 items-center gap-1.5 font-medium transition-all ${sizeClass} ${
          variant === 'segmented' ? 'rounded-lg' : 'rounded-full'
        } ${active ? variantClass.active : variantClass.inactive}`}
      >
        {renderDot(opt, active, variant)}
        {opt.label}
        {opt.count != null && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            active && variant === 'outline'
              ? 'bg-white/15 text-white'
              : active && variant === 'segmented'
                ? 'bg-cyan-50 text-cyan-700'
                : active
                  ? 'text-cyan-600'
                  : 'text-gray-400'
          }`}
          >
            {opt.count}
          </span>
        )}
      </button>
    );
  });

  if (variant === 'segmented') {
    return (
      <div className={`${scrollable ? 'overflow-x-auto pb-0.5' : ''} ${className}`}>
        <div
          role="tablist"
          aria-label={ariaLabel}
          className={`inline-flex gap-0.5 rounded-xl border border-navy-200/80 bg-navy-50/80 p-1 ${
            scrollable ? 'min-w-max' : 'flex flex-wrap'
          }`}
        >
          {pills}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {pills}
    </div>
  );
}
