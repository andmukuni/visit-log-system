export function buildWeeklySeries(activity = [], todayFloor = 0) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const today = new Date();
  for (const row of activity) {
    if (!row.created_at) continue;
    const d = new Date(row.created_at);
    const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) {
      const idx = (d.getDay() + 6) % 7;
      counts[idx] += 1;
    }
  }
  if (todayFloor > 0) {
    const todayIdx = (today.getDay() + 6) % 7;
    counts[todayIdx] = Math.max(counts[todayIdx], todayFloor);
  }
  return counts;
}

export function metricTarget(value = 0, padding = 5, floor = 10) {
  return Math.max(value + padding, floor);
}
