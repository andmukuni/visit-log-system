import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';

const ACCENT_STYLES = {
  amber: 'bg-amber-400 text-white shadow-sm shadow-amber-400/30',
  emerald: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30',
  sky: 'bg-sky-400 text-white shadow-sm shadow-sky-400/30',
  violet: 'bg-violet-500 text-white shadow-sm shadow-violet-500/30',
  rose: 'bg-rose-400 text-white shadow-sm shadow-rose-400/30',
  orange: 'bg-orange-400 text-white shadow-sm shadow-orange-400/30',
};

const ACCENT_CYCLE = ['amber', 'emerald', 'sky', 'violet', 'rose', 'orange'];

/** Rotate accent colors for KPI icon badges (reference dashboard style). */
export function kpiAccent(index) {
  return ACCENT_CYCLE[index % ACCENT_CYCLE.length];
}

/** @deprecated Use kpiAccent instead */
export function kpiTone(index) {
  return kpiAccent(index);
}

function formatTrend(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(2)}%`;
}

export default function PortalKpiCard({
  label,
  value,
  icon: Icon,
  footer,
  trend,
  trendLabel = 'this week',
  accent = 'sky',
  to,
  tone,
  highlighted = false,
}) {
  const activeAccent = tone === 'charcoal' ? 'violet' : accent;
  const accentClass = ACCENT_STYLES[activeAccent] || ACCENT_STYLES.sky;
  const hasTrend = trend != null && !Number.isNaN(Number(trend));

  const card = (
    <div className="flex h-full min-h-[140px] flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {Icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
            <Icon size={20} strokeWidth={2} />
          </span>
        )}
      </div>

      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-gray-900">
        {value}
      </p>

      {hasTrend ? (
        <p
          className={`mt-auto flex items-center gap-1 pt-3 text-sm font-medium ${
            Number(trend) >= 0 ? 'text-emerald-500' : 'text-red-500'
          }`}
        >
          {Number(trend) >= 0 ? (
            <TrendingUp size={16} strokeWidth={2.5} />
          ) : (
            <TrendingDown size={16} strokeWidth={2.5} />
          )}
          <span>
            {formatTrend(Number(trend))} {trendLabel}
          </span>
        </p>
      ) : footer ? (
        <p className="mt-auto pt-3 text-sm text-gray-400">{footer}</p>
      ) : (
        <span className="mt-auto" aria-hidden="true" />
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {card}
      </Link>
    );
  }

  return card;
}
