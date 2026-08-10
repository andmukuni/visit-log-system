export default function UnderlineTabs({
  options = [],
  value,
  onChange,
  className = '',
  fullWidth = false,
  scrollable = false,
}) {
  const tabList = (
    <div
      className={`flex gap-0 border-b border-gray-200 ${fullWidth && !scrollable ? 'w-full' : ''} ${
        scrollable ? 'min-w-max px-1' : ''
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
            className={`-mb-px inline-flex shrink-0 items-center justify-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors sm:justify-start sm:px-5 ${
              fullWidth && !scrollable ? 'flex-1 sm:flex-none' : ''
            } ${
              active
                ? 'border-cyan-600 text-navy-900'
                : 'border-transparent text-navy-400 hover:border-navy-200 hover:text-navy-700'
            }`}
          >
            {Icon ? (
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active ? 'bg-cyan-50 text-cyan-700' : 'bg-navy-50 text-navy-400'
                }`}
              >
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
              </span>
            ) : null}
            <span className="whitespace-nowrap">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (scrollable) {
    return <div className="overflow-x-auto">{tabList}</div>;
  }

  return tabList;
}
