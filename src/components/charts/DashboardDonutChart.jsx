import {
  Building,
  Building2,
  Factory,
  Landmark,
  Store,
  Warehouse,
} from 'lucide-react';

const SEGMENT_COLORS = ['#6366f1', '#22d3ee', '#a3e635', '#f97316', '#8b5cf6', '#14b8a6'];
const LEGEND_ICONS = [Building2, Landmark, Factory, Store, Warehouse, Building];

const GAP_FRACTION = 0.018;

function formatPercent(value) {
  return `${Number(value).toFixed(2).replace('.', ',')}%`;
}

function formatLegendName(name) {
  return String(name).replace(/_/g, ' ');
}

function normalizeData(data, nameKey, valueKey) {
  return data
    .map((row) => ({
      name: row[nameKey] || row.site_name || row.status || 'Other',
      value: Number(row[valueKey] ?? row.count ?? row.total ?? 0),
      icon: row.icon,
    }))
    .filter((row) => row.value > 0);
}

function buildSegments(chartData) {
  const total = chartData.reduce((sum, row) => sum + row.value, 0);
  let cumulative = 0;

  return chartData.map((row, index) => {
    const fraction = total > 0 ? row.value / total : 0;
    const start = cumulative + GAP_FRACTION / 2;
    const end = cumulative + fraction - GAP_FRACTION / 2;
    cumulative += fraction;
    const pct = total > 0 ? (row.value / total) * 100 : 0;

    return {
      ...row,
      start,
      end: Math.max(end, start + 0.001),
      fraction,
      pct,
      color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    };
  });
}

function arcStrokePath(cx, cy, radius, startFrac, endFrac) {
  const startAngle = startFrac * 2 * Math.PI - Math.PI / 2;
  const endAngle = endFrac * 2 * Math.PI - Math.PI / 2;
  const large = endFrac - startFrac > 0.5 ? 1 : 0;
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

function ChartCardHeader({ title, subtitle }) {
  if (!title && !subtitle) return null;

  return (
    <div className="border-b border-navy-100 bg-navy-50 px-5 py-3.5">
      {title && <h3 className="text-sm font-semibold text-navy-800">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
    </div>
  );
}

export default function DashboardDonutChart({
  data = [],
  nameKey = 'label',
  valueKey = 'value',
  title,
  subtitle,
  centerTitle = 'Visit share',
  centerIcon: CenterIcon,
  centerValue,
  emptyLabel = 'No data yet.',
  maxLegendItems = 4,
  className = '',
}) {
  const chartData = normalizeData(data, nameKey, valueKey);

  if (!chartData.length) {
    return (
      <div className={`flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
        <ChartCardHeader title={title} subtitle={subtitle} />
        <div className="flex flex-1 flex-col p-5">
          <div className="flex h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
            {emptyLabel}
          </div>
        </div>
      </div>
    );
  }

  const total = chartData.reduce((sum, row) => sum + row.value, 0);
  const segments = buildSegments(chartData);
  const legendItems = segments.slice(0, maxLegendItems);
  const topPct = segments.reduce((max, row) => Math.max(max, row.pct), 0);
  const resolvedCenterValue = centerValue ?? formatPercent(topPct);

  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 96;
  const strokeWidth = 22;

  return (
    <div className={`flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
      <ChartCardHeader title={title} subtitle={subtitle} />

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="mx-auto flex flex-1 flex-col justify-center py-2">
          <div className="relative mx-auto w-full max-w-[240px]">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block w-full" aria-hidden="true">
              {segments.map((seg) => (
                <path
                  key={seg.name}
                  d={arcStrokePath(cx, cy, radius, seg.start, seg.end)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              {CenterIcon ? (
                <CenterIcon size={22} strokeWidth={1.75} className="text-gray-400" aria-hidden="true" />
              ) : (
                <p className="text-sm leading-snug text-gray-400">{centerTitle}</p>
              )}
              <span className="sr-only">{centerTitle}</span>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-gray-900">
                {resolvedCenterValue}
              </p>
            </div>
          </div>
        </div>

        <ul className="mt-auto space-y-3">
        {legendItems.map((row, index) => {
          const LegendIcon = row.icon || LEGEND_ICONS[index % LEGEND_ICONS.length];
          const legendName = formatLegendName(row.name);

          return (
            <li key={row.name} className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${row.color}18`, color: row.color }}
              >
                <LegendIcon size={14} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-500 capitalize">
                {legendName}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
                {Math.round(row.pct)}%
              </span>
            </li>
          );
        })}
      </ul>

      {segments.length > maxLegendItems && (
        <p className="mt-3 text-xs text-gray-400">
          +{segments.length - maxLegendItems} more · {total} visits total
        </p>
      )}
      </div>
    </div>
  );
}
