function formatLocalIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last 7 calendar days ending on endDate (inclusive), oldest first. */
export function rollingWeekDates(endDate = new Date()) {
  const end = new Date(endDate);
  end.setHours(12, 0, 0, 0);

  const dates = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - offset);
    const iso = formatLocalIso(d);
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    dates.push({ iso, label });
  }
  return dates;
}

export function buildRollingWeekTrend(counts = [], endDate = new Date()) {
  const dates = rollingWeekDates(endDate);
  return dates.map((entry, index) => ({
    period: entry.label,
    label: entry.label,
    date: entry.iso,
    visits: Number(counts[index] || 0),
    walking: 0,
    driveIn: 0,
  }));
}
