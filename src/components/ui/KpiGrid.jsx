import PortalKpiCard, { kpiAccent } from './PortalKpiCard';

/**
 * Responsive KPI grid — auto-fits cards based on available width and item count.
 * Min card width ~15rem; wraps cleanly for any number of metrics.
 */
export default function KpiGrid({ items, className = '' }) {
  if (!items?.length) return null;

  return (
    <div
      className={`mb-6 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))] ${className}`}
    >
      {items.map((item, index) => (
        <PortalKpiCard
          key={item.key || item.label}
          accent={item.accent ?? kpiAccent(index)}
          {...item}
        />
      ))}
    </div>
  );
}
