import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const PERIOD_OPTIONS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

const CHART_SERIES = [
  {
    key: 'visits',
    label: 'Total visits',
    color: '#34d399',
    lightColor: '#6ee7a8',
    dash: null,
    strokeWidth: 3,
    showArea: true,
    showShadow: true,
  },
  {
    key: 'walking',
    label: 'Walking visits',
    color: '#38bdf8',
    lightColor: '#7dd3fc',
    dash: '2 5',
    strokeWidth: 1.25,
    showArea: false,
    showShadow: false,
  },
  {
    key: 'driveIn',
    label: 'Drive-in visits',
    color: '#fb923c',
    lightColor: '#fdba74',
    dash: '8 5',
    strokeWidth: 1.25,
    showArea: false,
    showShadow: false,
  },
];

function readSeriesValue(row, key) {
  if (key === 'driveIn') {
    return Number(row.driveIn ?? row.drive_in ?? 0);
  }
  return Number(row[key] ?? 0);
}

function normalizeSeries(data) {
  if (!Array.isArray(data) || !data.length) return [];

  if (typeof data[0] === 'number') {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, data.length).map((label, index) => ({
      label,
      visits: Number(data[index] || 0),
      walking: 0,
      driveIn: 0,
    }));
  }

  return data.map((row, index) => ({
    label: row.period || row.label || row.day || `Day ${index + 1}`,
    visits: Number(row.visits ?? row.value ?? row.count ?? 0),
    walking: Number(row.walking ?? 0),
    driveIn: Number(row.driveIn ?? row.drive_in ?? 0),
  }));
}

function smoothLinePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const cx = (current.x + next.x) / 2;
    path += ` C ${cx} ${current.y}, ${cx} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function smoothAreaPath(points, bottomY) {
  if (!points.length) return '';
  const linePath = smoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
}

function buildYTicks(maxValue, tickCount = 4) {
  if (maxValue <= 0) return [0, 1, 2, 3, 4];
  if (maxValue <= 10) {
    const top = Math.max(4, Math.ceil(maxValue));
    return Array.from({ length: top + 1 }, (_, index) => index);
  }

  const roughStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.ceil(roughStep / magnitude) * magnitude || 1;
  const top = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] < maxValue) ticks.push(ticks[ticks.length - 1] + step);
  return ticks.length > 1 ? ticks : [0, maxValue || 1];
}

function formatAxisValue(value) {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

function formatTotal(value) {
  return Number(value).toLocaleString();
}

function formatTrend(value) {
  const sign = value > 0 ? '+' : '';
  const abs = Math.abs(Number(value));
  const text = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return `${sign}${text}%`;
}

function SeriesLegend({ items }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2 text-xs text-gray-500">
          <svg width="28" height="10" aria-hidden="true" className="shrink-0">
            <line
              x1="0"
              y1="5"
              x2="28"
              y2="5"
              stroke={item.color}
              strokeWidth={item.strokeWidth ?? 2.5}
              strokeLinecap="round"
              strokeDasharray={item.dash || undefined}
            />
          </svg>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardLineChart({
  data = [],
  title = 'Visit statistics',
  trend,
  period = 'week',
  onPeriodChange,
  periodOptions = PERIOD_OPTIONS,
  emptyLabel = 'No visit data yet.',
  className = '',
}) {
  const svgRef = useRef(null);
  const chartId = useId().replace(/:/g, '');
  const [hoverIndex, setHoverIndex] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const series = useMemo(() => normalizeSeries(data), [data]);
  const totalValues = series.map((row) => row.visits);
  const total = totalValues.reduce((sum, value) => sum + value, 0);
  const allValues = series.flatMap((row) => CHART_SERIES.map((cfg) => readSeriesValue(row, cfg.key)));
  const hasData = series.length > 0 && allValues.some((value) => value > 0);

  const computedTrend = useMemo(() => {
    if (trend != null && !Number.isNaN(Number(trend))) return Number(trend);
    if (totalValues.length < 2) return 0;
    const mid = Math.floor(totalValues.length / 2);
    const first = totalValues.slice(0, mid).reduce((sum, value) => sum + value, 0);
    const second = totalValues.slice(mid).reduce((sum, value) => sum + value, 0);
    if (first === 0) return second > 0 ? 100 : 0;
    return ((second - first) / first) * 100;
  }, [trend, totalValues]);

  const activePeriod = periodOptions.find((option) => option.value === period) || periodOptions[0];

  const chart = useMemo(() => {
    const width = 520;
    const height = 220;
    const padLeft = 8;
    const padRight = 12;
    const padTop = 12;
    const padBottom = 28;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;
    const maxValue = Math.max(...allValues, 1);
    const yTicks = buildYTicks(maxValue);
    const yMax = yTicks[yTicks.length - 1] || 1;

    const buildPoints = (key) =>
      series.map((row, index) => {
        const value = readSeriesValue(row, key);
        return {
          x: padLeft + (index / Math.max(series.length - 1, 1)) * innerW,
          y: padTop + innerH - (value / yMax) * innerH,
          value,
          label: row.label,
        };
      });

    const lineSeries = CHART_SERIES.map((cfg) => {
      const points = buildPoints(cfg.key);
      return {
        ...cfg,
        points,
        linePath: smoothLinePath(points),
        areaPath: cfg.showArea ? smoothAreaPath(points, padTop + innerH) : '',
      };
    });

    const primaryPoints = lineSeries[0]?.points || [];

    return {
      width,
      height,
      padTop,
      padBottom,
      innerH,
      yTicks,
      yMax,
      lineSeries,
      primaryPoints,
    };
  }, [allValues, series]);

  const handlePointer = (event) => {
    const svg = svgRef.current;
    if (!svg || !chart.primaryPoints.length) return;

    const rect = svg.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * chart.width;
    let nearest = 0;
    let nearestDist = Infinity;

    chart.primaryPoints.forEach((point, index) => {
      const dist = Math.abs(point.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = index;
      }
    });

    setHoverIndex(nearest);
  };

  if (!hasData) {
    return (
      <div className={`flex h-full min-h-[22rem] flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">0</p>
          </div>
          <PeriodDropdown
            active={activePeriod}
            open={menuOpen}
            options={periodOptions}
            onToggle={() => setMenuOpen((open) => !open)}
            onSelect={(value) => {
              setMenuOpen(false);
              onPeriodChange?.(value);
            }}
          />
        </div>
        <div className="mt-6 flex h-56 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
          {emptyLabel}
        </div>
      </div>
    );
  }

  const activeIndex = hoverIndex ?? null;
  const activeLabel = activeIndex != null ? series[activeIndex]?.label : null;
  const activePrimaryPoint = activeIndex != null ? chart.primaryPoints[activeIndex] : null;
  const trendPositive = computedTrend >= 0;

  return (
    <div className={`flex h-full min-h-[22rem] flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-bold tracking-tight text-gray-900 tabular-nums">
              {formatTotal(total)}
            </span>
            <span className={`text-sm font-semibold tabular-nums ${trendPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatTrend(computedTrend)}
            </span>
          </div>
        </div>
        <PeriodDropdown
          active={activePeriod}
          open={menuOpen}
          options={periodOptions}
          onToggle={() => setMenuOpen((open) => !open)}
          onSelect={(value) => {
            setMenuOpen(false);
            onPeriodChange?.(value);
          }}
        />
      </div>

      <SeriesLegend items={CHART_SERIES} />

      <div className="mt-2 flex min-h-0 flex-1 gap-3">
        <div className="flex w-9 shrink-0 flex-col justify-between py-2 text-[11px] tabular-nums text-gray-400">
          {[...chart.yTicks].reverse().map((tick) => (
            <span key={tick}>{formatAxisValue(tick)}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 flex flex-col">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            className="h-full min-h-[12rem] w-full flex-1 touch-none"
            onMouseMove={handlePointer}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchMove={(event) => handlePointer(event.touches[0])}
            onTouchEnd={() => setHoverIndex(null)}
            role="img"
            aria-label={`${title} line chart`}
          >
            <defs>
              <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_SERIES[0].lightColor} stopOpacity="0.32" />
                <stop offset="100%" stopColor={CHART_SERIES[0].lightColor} stopOpacity="0" />
              </linearGradient>
              <filter id={`${chartId}-shadow`} x="-10%" y="-20%" width="120%" height="150%" filterUnits="objectBoundingBox">
                <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor={CHART_SERIES[0].color} floodOpacity="0.35" />
              </filter>
            </defs>

            {chart.yTicks.map((tick) => {
              const y = chart.padTop + chart.innerH - (tick / chart.yMax) * chart.innerH;
              return (
                <line
                  key={tick}
                  x1={0}
                  y1={y}
                  x2={chart.width}
                  y2={y}
                  stroke="#eef0f4"
                  strokeWidth={1}
                />
              );
            })}

            {chart.lineSeries.map((line) => (
              line.showArea ? (
                <path key={`${line.key}-area`} d={line.areaPath} fill={`url(#${chartId}-area)`} />
              ) : null
            ))}

            {chart.lineSeries.map((line) => (
              <path
                key={line.key}
                d={line.linePath}
                fill="none"
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={line.dash || undefined}
                filter={line.showShadow ? `url(#${chartId}-shadow)` : undefined}
              />
            ))}

            {activePrimaryPoint && (
              <>
                <line
                  x1={activePrimaryPoint.x}
                  y1={chart.padTop}
                  x2={activePrimaryPoint.x}
                  y2={chart.height - chart.padBottom}
                  stroke="#d1d5db"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <polygon
                  points={`${activePrimaryPoint.x - 4},${chart.height - chart.padBottom + 2} ${activePrimaryPoint.x + 4},${chart.height - chart.padBottom + 2} ${activePrimaryPoint.x},${chart.height - chart.padBottom + 8}`}
                  fill="#374151"
                />
                {chart.lineSeries.map((line) => {
                  const point = line.points[activeIndex];
                  if (!point) return null;
                  const isPrimary = line.key === 'visits';
                  return (
                    <circle
                      key={line.key}
                      cx={point.x}
                      cy={point.y}
                      r={isPrimary ? 5 : 3.5}
                      fill="#ffffff"
                      stroke={line.color}
                      strokeWidth={isPrimary ? 2.5 : 1.5}
                    />
                  );
                })}
              </>
            )}

            {chart.primaryPoints.map((point, index) => (
              <circle
                key={point.label}
                cx={point.x}
                cy={point.y}
                r={12}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(index)}
              />
            ))}

            {series.map((row, index) => {
              const x = chart.primaryPoints[index]?.x ?? 0;
              return (
                <text
                  key={row.label}
                  x={x}
                  y={chart.height - 8}
                  textAnchor="middle"
                  className="fill-gray-400 text-[11px]"
                >
                  {row.label}
                </text>
              );
            })}
          </svg>

          {activeLabel && activeIndex != null && (
            <div
              className="pointer-events-none absolute z-10 min-w-[10rem] rounded-xl bg-gray-900 px-3 py-2 text-white shadow-lg"
              style={{
                left: `${(activePrimaryPoint.x / chart.width) * 100}%`,
                top: `${(activePrimaryPoint.y / chart.height) * 100 - 18}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <p className="text-[11px] text-gray-300">{activeLabel}</p>
              <div className="mt-1 space-y-1">
                {chart.lineSeries.map((line) => {
                  const value = line.points[activeIndex]?.value ?? 0;
                  return (
                    <p key={line.key} className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
                      {line.label}: {formatTotal(value)}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodDropdown({ active, open, options, onToggle, onSelect }) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
      >
        {active.label}
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close period menu"
            onClick={onToggle}
          />
          <ul className="absolute right-0 z-20 mt-1 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => onSelect(option.value)}
                  className={`block w-full px-3 py-2 text-left text-xs ${
                    option.value === active.value
                      ? 'bg-gray-50 font-semibold text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
