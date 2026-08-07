import PortalKpiCard, { kpiAccent } from '../ui/PortalKpiCard';
import DashboardLineChart from '../charts/DashboardLineChart';
import DashboardDonutChart from '../charts/DashboardDonutChart';
import MetricsSection from './MetricsSection';

/**
 * Fintech dashboard layout: KPI row (3 left + optional 1 right),
 * or MetricProgressCard section, then line + donut charts at equal height.
 */
export default function DashboardOverviewLayout({
  kpis = [],
  sideKpi,
  metricsSection,
  lineChart,
  donutChart,
  className = '',
}) {
  const topKpis = kpis.slice(0, 3);

  return (
    <div
      className={`mb-6 grid grid-cols-1 gap-5 lg:grid-cols-4 lg:grid-rows-[auto_minmax(22rem,1fr)] ${className}`}
    >
      {metricsSection ? (
        <div className="lg:col-span-4 lg:row-start-1">
          <MetricsSection {...metricsSection} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-3 lg:row-start-1">
            {topKpis.map((item, index) => (
              <PortalKpiCard
                key={item.key || item.label}
                accent={item.accent ?? kpiAccent(index)}
                animateDelay={index * 80}
                {...item}
              />
            ))}
          </div>

          {sideKpi && (
            <div className="lg:col-start-4 lg:row-start-1">
              <PortalKpiCard
                accent={sideKpi.accent ?? kpiAccent(3)}
                animateDelay={240}
                {...sideKpi}
              />
            </div>
          )}
        </>
      )}

      <div className="flex min-h-[22rem] flex-col lg:col-span-3 lg:row-start-2">
        <DashboardLineChart {...lineChart} className="h-full min-h-0 flex-1" />
      </div>

      <div className="flex min-h-[22rem] flex-col lg:col-start-4 lg:row-start-2">
        <DashboardDonutChart {...donutChart} className="h-full min-h-0 flex-1" />
      </div>
    </div>
  );
}
