export function visitorInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Host office, title (salutation), and name — e.g. "#12 · Sales, Mr Kenneth Lungu" */
export function formatVisitHostLabel(visit, { empty = 'Not assigned' } = {}) {
  if (!visit) return empty;

  const officeNumber = String(visit.host_office_number || visit.office_number || '').trim();
  const officeName = String(visit.host_office_name || visit.office_name || '').trim();
  const office = [officeNumber ? `#${officeNumber}` : '', officeName].filter(Boolean).join(' · ');

  const title = String(visit.host_title || visit.title || '').trim();
  const name = String(visit.host_name || visit.name || '').trim();
  const titledName = [title, name].filter(Boolean).join(' ');

  const label = [office, titledName].filter(Boolean).join(', ');
  return label || empty;
}
