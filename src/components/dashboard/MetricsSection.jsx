import MetricProgressCard from './MetricProgressCard';

function MetricsGrid({ cards, className = '' }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {cards.map((card) => (
        <MetricProgressCard key={card.title} {...card} />
      ))}
    </div>
  );
}

/**
 * @param {'row' | 'overview' | 'grid'} variant
 * - row: horizontal strip (2 cards, station/host style)
 * - grid: equal columns (default for 3 or fewer)
 * - overview: platform-style 3 + featured + secondary row (security dashboard)
 */
export default function MetricsSection({
  title = "Today's metrics",
  cards = [],
  variant,
}) {
  if (!cards.length) return null;

  const layout = variant ?? (cards.length <= 2 ? 'row' : 'grid');
  const useOverview = layout === 'overview' && cards.length >= 4;
  const primary = useOverview ? cards.slice(0, 3) : cards;
  const featured = useOverview ? cards[3] : null;
  const secondary = useOverview ? cards.slice(4) : [];
  const showTitle = Boolean(title);

  return (
    <div>
      {showTitle && <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>}

      {useOverview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:items-stretch">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
              {primary.map((card) => (
                <MetricProgressCard key={card.title} {...card} />
              ))}
            </div>
            {featured && (
              <div className="lg:col-start-4">
                <MetricProgressCard featured {...featured} />
              </div>
            )}
          </div>

          {secondary.length > 0 && (
            <div className={`grid grid-cols-1 gap-4 ${secondary.length === 1 ? 'max-w-md' : 'sm:grid-cols-2'}`}>
              {secondary.map((card) => (
                <MetricProgressCard key={card.title} {...card} />
              ))}
            </div>
          )}
        </div>
      ) : layout === 'row' ? (
        <div className="@container/metrics w-full">
          <div className="grid grid-cols-1 gap-4 @sm/metrics:grid-cols-2">
            {cards.map((card) => (
              <MetricProgressCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      ) : (
        <MetricsGrid cards={cards} />
      )}
    </div>
  );
}
