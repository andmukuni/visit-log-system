export function visitorInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Host position and name — e.g. "IT Manager, Daniel Sikatali" */
export function formatVisitHostLabel(visit, { empty = 'Not assigned' } = {}) {
  if (!visit) return empty;

  const position = String(
    visit.host_position_name || visit.position_name || '',
  ).trim();
  const name = String(visit.host_name || visit.name || '').trim();

  const label = [position, name].filter(Boolean).join(', ');
  return label || empty;
}
