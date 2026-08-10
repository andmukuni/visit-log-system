/**
 * Relational integrity for organisation structure creates/updates.
 * Mirrors shared/orgHierarchy.js rules.
 */

export async function loadOrganisation(pool, orgId) {
  if (!orgId) return null;
  const [[row]] = await pool.query(
    `SELECT id, name, status FROM organisations WHERE id = ? LIMIT 1`,
    [orgId],
  );
  return row || null;
}

export async function loadSiteInOrg(pool, siteId, orgId) {
  if (!siteId || !orgId) return null;
  const [[row]] = await pool.query(
    `SELECT id, organisation_id, name, status FROM sites WHERE id = ? AND organisation_id = ? LIMIT 1`,
    [siteId, orgId],
  );
  return row || null;
}

export async function loadBuildingInOrg(pool, buildingId, orgId) {
  if (!buildingId || !orgId) return null;
  const [[row]] = await pool.query(
    `SELECT b.id, b.site_id, b.name, s.organisation_id, s.name AS site_name
     FROM buildings b
     INNER JOIN sites s ON s.id = b.site_id
     WHERE b.id = ? AND s.organisation_id = ?
     LIMIT 1`,
    [buildingId, orgId],
  );
  return row || null;
}

export async function loadDepartmentInOrg(pool, departmentId, orgId) {
  if (!departmentId || !orgId) return null;
  const [[row]] = await pool.query(
    `SELECT id, organisation_id, name, code FROM departments WHERE id = ? AND organisation_id = ? LIMIT 1`,
    [departmentId, orgId],
  );
  return row || null;
}

export async function loadOfficeInOrg(pool, officeId, orgId) {
  if (!officeId || !orgId) return null;
  const [[row]] = await pool.query(
    `SELECT id, organisation_id, department_id, building_id, site_id, office_number, name, status
     FROM offices
     WHERE id = ? AND organisation_id = ?
     LIMIT 1`,
    [officeId, orgId],
  );
  return row || null;
}

/** Office = organisation + department + building; site inherited from building. */
export async function assertOfficePlacement(pool, { organisationId, departmentId, buildingId }) {
  const org = await loadOrganisation(pool, organisationId);
  if (!org) {
    return { ok: false, status: 403, message: 'Organisation is required before an office can exist.' };
  }
  if (org.status !== 'active') {
    return { ok: false, status: 403, message: 'Organisation is not active.' };
  }

  const department = await loadDepartmentInOrg(pool, departmentId, organisationId);
  if (!department) {
    return { ok: false, status: 400, message: 'Department must belong to the same organisation.' };
  }

  const building = await loadBuildingInOrg(pool, buildingId, organisationId);
  if (!building) {
    return { ok: false, status: 400, message: 'Building must belong to a site in the same organisation.' };
  }

  return {
    ok: true,
    organisationId,
    departmentId,
    buildingId,
    siteId: building.site_id,
    department,
    building,
  };
}

/** Station / gate belongs to a site (not department). */
export async function assertStationPlacement(pool, { organisationId, siteId }) {
  const org = await loadOrganisation(pool, organisationId);
  if (!org) {
    return { ok: false, status: 403, message: 'Organisation is required before a station can exist.' };
  }
  if (org.status !== 'active') {
    return { ok: false, status: 403, message: 'Organisation is not active.' };
  }

  const site = await loadSiteInOrg(pool, siteId, organisationId);
  if (!site) {
    return { ok: false, status: 400, message: 'Station must belong to a site in this organisation.' };
  }

  return { ok: true, organisationId, siteId, site };
}

/**
 * Employee = organisation + department + site (+ optional office).
 * If office is set, it must match department and sit on the same site.
 */
export async function assertEmployeePlacement(pool, {
  organisationId,
  departmentId,
  siteId,
  officeId = null,
}) {
  const org = await loadOrganisation(pool, organisationId);
  if (!org) {
    return { ok: false, status: 403, message: 'Organisation is required before an employee can exist.' };
  }
  if (org.status !== 'active') {
    return { ok: false, status: 403, message: 'Organisation is not active.' };
  }

  const department = await loadDepartmentInOrg(pool, departmentId, organisationId);
  if (!department) {
    return { ok: false, status: 400, message: 'Employee must belong to a department in this organisation.' };
  }

  const site = await loadSiteInOrg(pool, siteId, organisationId);
  if (!site) {
    return { ok: false, status: 400, message: 'Employee must be assigned to a site/branch in this organisation.' };
  }

  let office = null;
  if (officeId) {
    office = await loadOfficeInOrg(pool, officeId, organisationId);
    if (!office) {
      return { ok: false, status: 400, message: 'Office not found in this organisation.' };
    }
    if (office.department_id !== departmentId) {
      return { ok: false, status: 400, message: 'Office must belong to the selected department.' };
    }
    if (office.site_id && office.site_id !== siteId) {
      return { ok: false, status: 400, message: 'Office must be on the selected site/branch.' };
    }
  }

  return {
    ok: true,
    organisationId,
    departmentId,
    siteId,
    officeId: office?.id || null,
    department,
    site,
    office,
  };
}
