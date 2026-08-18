/** Keep only offices in the receptionist zone set. */
export function filterOfficesByReceptionZones(offices = [], zoneIds = []) {
  const zones = (zoneIds || []).map(String).filter(Boolean);
  if (!zones.length) return offices || [];
  const allowed = new Set(zones);
  return (offices || []).filter((office) => {
    const officeZone = office?.zone_id != null ? String(office.zone_id) : '';
    return officeZone && allowed.has(officeZone);
  });
}

/** Departments that still have at least one zone-scoped host or office. */
export function filterDepartmentsForReceptionZone(departments = [], hosts = [], offices = []) {
  const departmentIds = new Set(
    [...(hosts || []), ...(offices || [])]
      .map((row) => row?.department_id)
      .filter(Boolean)
      .map(String),
  );
  if (!departmentIds.size) return departments || [];
  return (departments || []).filter((department) => departmentIds.has(String(department.id)));
}

// Hosts are already zone-scoped server-side (host_zones-aware — a host can be
// assigned to several zones, so there's no single zone_id column here that a
// client-side re-filter could check without wrongly dropping multi-zone
// hosts). Only offices, which have exactly one zone, get a client-side pass.
export function scopeReceptionReferenceData(ref = {}) {
  const zoneIds = Array.isArray(ref?.scope?.zone_ids) ? ref.scope.zone_ids : [];
  const hosts = ref.hosts || [];
  const offices = filterOfficesByReceptionZones(ref.offices || [], zoneIds);
  const departments = filterDepartmentsForReceptionZone(ref.departments || [], hosts, offices);
  return {
    ...ref,
    hosts,
    offices,
    departments,
  };
}

/** Keep only visits that belong to the receptionist zone set (by visit zone or host). */
export function filterVisitsByReceptionZones(rows = [], zoneIds = [], zoneHostIds = []) {
  const zones = (zoneIds || []).map(String).filter(Boolean);
  if (!zones.length) return rows || [];
  const zoneSet = new Set(zones);
  const hostSet = new Set((zoneHostIds || []).map(String));

  return (rows || []).filter((row) => {
    const visitZone = row?.zone_id != null ? String(row.zone_id) : '';
    if (visitZone && zoneSet.has(visitZone)) return true;
    const hostId = row?.host_id != null ? String(row.host_id) : '';
    if (hostId && hostSet.has(hostId)) return true;
    return false;
  });
}
