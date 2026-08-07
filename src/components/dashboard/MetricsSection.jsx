import MetricProgressCard from './MetricProgressCard';

export default function MetricsSection({ title = "Today's metrics", cards = [] }) {
  if (!cards.length) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="flex flex-col sm:flex-row gap-3">
        {cards.map((card) => (
          <MetricProgressCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}
