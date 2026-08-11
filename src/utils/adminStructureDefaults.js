/**
 * Pick an organisation that already has the structure needed for admin create flows.
 * Prefers the admin org switcher selection when that org is ready.
 */
export function resolveDefaultOrganisationId({
  orgOptions = [],
  sites = [],
  zones = [],
  departments = [],
  preferredOrgId = '',
  requireZones = false,
  requireDepartments = false,
}) {
  const orgIds = orgOptions.map((option) => option.value);
  const activeSites = sites.filter((site) => site.status !== 'inactive');

  const isReady = (orgId) => {
    if (!orgId || !orgIds.includes(orgId)) return false;
    if (!activeSites.some((site) => site.organisation_id === orgId)) return false;
    if (requireZones && !zones.some((zone) => zone.organisation_id === orgId)) return false;
    if (requireDepartments && !departments.some((dept) => dept.organisation_id === orgId)) return false;
    return true;
  };

  if (preferredOrgId && isReady(preferredOrgId)) return preferredOrgId;
  return orgIds.find(isReady) || null;
}

export function hasStructurePrerequisites(options) {
  return Boolean(resolveDefaultOrganisationId(options));
}

export function activeSitesForOrg(sites = [], organisationId = '') {
  return sites.filter(
    (site) => site.status !== 'inactive' && site.organisation_id === organisationId,
  );
}

export function zonesForOrg(zones = [], organisationId = '', siteId = '') {
  return zones.filter((zone) => {
    if (organisationId && zone.organisation_id && zone.organisation_id !== organisationId) return false;
    if (siteId && zone.site_id && zone.site_id !== siteId) return false;
    return true;
  });
}
