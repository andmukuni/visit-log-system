const SIZE_CLASSES = {
  sm: {
    track: 'p-1',
    button: 'px-3 py-1.5 text-xs gap-1.5',
    icon: 14,
  },
  md: {
    track: 'p-1.5',
    button: 'px-4 py-2 text-sm gap-2',
    icon: 16,
  },
};

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  className = '',
  size = 'md',
  fullWidth = false,
}) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-navy-100 bg-navy-50/70 ${sizeClass.track} ${
        fullWidth ? 'flex w-full' : ''
      } ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;

        return (
          <button
            key={opt.value ?? opt.label}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(opt.value)}
            className={`inline-flex flex-1 items-center justify-center rounded-lg font-medium transition-all duration-200 ${sizeClass.button} ${
              active
                ? 'bg-white text-navy-900 shadow-sm ring-1 ring-navy-100'
                : 'text-navy-500 hover:bg-white/60 hover:text-navy-700'
            }`}
          >
            {Icon ? <Icon size={sizeClass.icon} strokeWidth={2} aria-hidden="true" /> : null}
            <span>{opt.label}</span>
            {opt.count != null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                active ? 'bg-cyan-50 text-cyan-700' : 'bg-navy-100 text-navy-500'
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
