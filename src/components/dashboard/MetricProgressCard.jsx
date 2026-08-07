const ACCENTS = {
  charcoal: {
    card: 'bg-metric-charcoal border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
    iconBadge: 'bg-white/10 text-white',
    featuredRing: 'ring-white/20',
  },
  navy: {
    card: 'bg-metric-navy border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
    iconBadge: 'bg-white/10 text-white',
    featuredRing: 'ring-white/20',
  },
  light: {
    card: 'bg-white border-navy-100',
    title: 'text-navy-500',
    value: 'text-navy-900',
    meta: 'text-navy-400',
    track: 'bg-navy-100',
    bar: 'bg-metric-navy',
    chip: 'bg-navy-50 text-navy-700',
    iconBadge: 'bg-navy-50 text-navy-600',
    featuredRing: 'ring-navy-200',
  },
  // Legacy keys — mapped to the two metric swatches
  blue: {
    card: 'bg-metric-navy border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
    iconBadge: 'bg-white/10 text-white',
  },
  purple: {
    card: 'bg-metric-charcoal border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
    iconBadge: 'bg-white/10 text-white',
  },
  orange: {
    card: 'bg-metric-navy border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
    iconBadge: 'bg-white/10 text-white',
  },
  violet: {
    card: 'bg-metric-charcoal border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
  },
  teal: {
    card: 'bg-metric-navy border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
  },
  amber: {
    card: 'bg-metric-charcoal border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
  },
  rose: {
    card: 'bg-metric-navy border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
  },
  slate: {
    card: 'bg-metric-charcoal border-white/10',
    title: 'text-white/65',
    value: 'text-white',
    meta: 'text-white/45',
    track: 'bg-white/12',
    bar: 'bg-white/70',
    chip: 'bg-white/10 text-white/90',
  },
};

export default function MetricProgressCard({
  title,
  value,
  target,
  percent,
  trend,
  subtitle,
  icon: Icon,
  accent = 'charcoal',
  showProgress = true,
  featured = false,
  className = '',
}) {
  const theme = ACCENTS[accent] || ACCENTS.charcoal;
  const pct = Math.min(100, Math.max(0, percent ?? (target ? Math.round((value / target) * 100) : 0)));

  return (
    <div
      className={`rounded-2xl border shadow-sm transition-shadow duration-300 hover:shadow-lg h-full min-w-0 p-4 ${theme.card} ${
        featured ? `ring-1 ${theme.featuredRing || 'ring-white/20'} shadow-md` : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${theme.title}`}>{title}</p>
          <p className={`font-bold mt-1 tabular-nums tracking-tight ${theme.value} ${featured ? 'text-3xl' : 'text-2xl'}`}>
            {value ?? 0}
          </p>
          {subtitle && <p className={`text-xs mt-0.5 ${theme.meta}`}>{subtitle}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {Icon && (
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.iconBadge || 'bg-white/10 text-white'}`}>
              <Icon size={18} strokeWidth={2} />
            </span>
          )}
          {trend != null && (
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${theme.chip}`}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      </div>
      {showProgress && target != null && (
        <p className={`text-xs mb-2 ${theme.meta}`}>Target {target}</p>
      )}
      {showProgress && (
        <>
          <div className={`h-1.5 rounded-full overflow-hidden ${theme.track}`}>
            <div
              className={`h-full rounded-full ${theme.bar} transition-all duration-700`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className={`text-[10px] mt-1.5 ${theme.meta}`}>{pct}% of target</p>
        </>
      )}
    </div>
  );
}
