const SIZE_CLASSES = {
  sm: {
    track: 'p-1',
    button: 'px-3 py-1.5 text-xs gap-1.5',
    icon: 14,
    iconWrap: 'h-6 w-6',
  },
  md: {
    track: 'p-1.5',
    button: 'px-4 py-2 text-sm gap-2',
    icon: 16,
    iconWrap: 'h-7 w-7',
  },
  lg: {
    track: 'p-1.5',
    button: 'px-5 py-2.5 text-sm gap-2.5 font-semibold',
    icon: 18,
    iconWrap: 'h-8 w-8',
  },
};

const VARIANTS = {
  default: {
    track: 'border-navy-100 bg-navy-50/70',
    active: 'bg-white text-navy-900 shadow-sm ring-1 ring-navy-100',
    inactive: 'text-navy-500 hover:bg-white/60 hover:text-navy-700',
    activeIconWrap: 'bg-cyan-50 text-cyan-700',
    inactiveIconWrap: 'bg-navy-100/80 text-navy-400',
    activeCount: 'bg-cyan-50 text-cyan-700',
    inactiveCount: 'bg-navy-100 text-navy-500',
  },
  kiosk: {
    track: 'border-navy-200 bg-gradient-to-b from-navy-100/80 to-navy-50/90 shadow-inner',
    active: 'bg-cyan-600 text-white shadow-md shadow-cyan-900/20',
    inactive: 'text-navy-600 hover:bg-white/90 hover:text-navy-900',
    activeIconWrap: 'bg-white/20 text-white',
    inactiveIconWrap: 'bg-white/70 text-navy-500',
    activeCount: 'bg-white/20 text-white',
    inactiveCount: 'bg-navy-200/70 text-navy-600',
  },
  kioskSoft: {
    track: 'border-navy-200 bg-white shadow-sm',
    active: 'bg-cyan-50 text-cyan-900 shadow-sm ring-1 ring-cyan-200',
    inactive: 'text-navy-500 hover:bg-navy-50 hover:text-navy-800',
    activeIconWrap: 'bg-cyan-100 text-cyan-700',
    inactiveIconWrap: 'bg-navy-100 text-navy-400',
    activeCount: 'bg-cyan-100 text-cyan-800',
    inactiveCount: 'bg-navy-100 text-navy-500',
  },
};

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  className = '',
  size = 'md',
  variant = 'default',
  fullWidth = false,
}) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const variantClass = VARIANTS[variant] || VARIANTS.default;

  return (
    <div
      className={`inline-flex items-center rounded-xl border ${variantClass.track} ${sizeClass.track} ${
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
              active ? variantClass.active : variantClass.inactive
            }`}
          >
            {Icon ? (
              <span
                className={`flex shrink-0 items-center justify-center rounded-lg transition-colors ${sizeClass.iconWrap} ${
                  active ? variantClass.activeIconWrap : variantClass.inactiveIconWrap
                }`}
              >
                <Icon size={sizeClass.icon} strokeWidth={2} aria-hidden="true" />
              </span>
            ) : null}
            <span>{opt.label}</span>
            {opt.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  active ? variantClass.activeCount : variantClass.inactiveCount
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
