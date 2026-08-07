import PortalKpiCard, { kpiAccent } from '../ui/PortalKpiCard';
import DashboardLineChart from '../charts/DashboardLineChart';
import DashboardDonutChart from '../charts/DashboardDonutChart';

/**
 * Fintech dashboard layout: 3 KPIs top-left, wide line chart bottom-left,
 * tall donut panel on the right spanning both rows.
 */
export default function DashboardOverviewLayout({
  kpis = [],
  lineChart,
  donutChart,
  className = '',
}) {
  const topKpis = kpis.slice(0, 3);

  return (
    <div
      className={`mb-6 grid grid-cols-1 gap-5 lg:grid-cols-4 lg:grid-rows-[auto_1fr] ${className}`}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-3">
        {topKpis.map((item, index) => (
          <PortalKpiCard
            key={item.key || item.label}
            accent={item.accent ?? kpiAccent(index)}
            animateDelay={index * 80}
            {...item}
          />
        ))}
      </div>

      <div className="min-h-[22rem] lg:col-span-3 lg:row-start-2">
        <DashboardLineChart {...lineChart} className="h-full" />
      </div>

      <div className="min-h-[22rem] lg:col-start-4 lg:row-start-1 lg:row-span-2">
        <DashboardDonutChart {...donutChart} className="h-full" />
      </div>
    </div>
  );
}
