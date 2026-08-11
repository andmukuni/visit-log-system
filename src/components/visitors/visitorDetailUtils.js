export function visitorInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getVisitHostPosition(visit) {
  if (!visit) return '';
  return String(visit.host_position_name || visit.position_name || '').trim();
}

/** Host salutation + name — e.g. "Eng Daniel Sikatali" */
export function formatVisitHostName(visit, { empty = 'Not assigned' } = {}) {
  if (!visit) return empty;

  const title = String(visit.host_title || visit.title || '').trim();
  const name = String(visit.host_name || visit.name || '').trim();
  const titledName = [title, name].filter(Boolean).join(' ');
  return titledName || empty;
}

/** Single-line host label for tables — title + name, with position when present. */
export function formatVisitHostLabel(visit, { empty = 'Not assigned' } = {}) {
  const name = formatVisitHostName(visit, { empty: '' });
  if (!name) return empty;
  const position = getVisitHostPosition(visit);
  return position ? `${name} · ${position}` : name;
}
