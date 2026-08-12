import crypto from 'crypto';
import { hashPassword } from './auth.js';

const GATE_ROLE_SLUG = 'gate_security';

/**
 * Ensure a security guard has a login user with Station/Gate portal access and scope.
 * @returns {Promise<string|null>} user id
 */
export async function syncSecurityGuardPortalUser(pool, {
  userId = null,
  name,
  email,
  phone = null,
  organisationId,
  siteId = null,
  stationId = null,
  departmentId = null,
  password = null,
  active = true,
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  let nextUserId = userId;
  if (!nextUserId) {
    const [[existing]] = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [normalizedEmail],
    );
    nextUserId = existing?.id || null;
  }

  if (!nextUserId) {
    nextUserId = `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const initialPassword = String(password || process.env.DEV_PORTAL_PASSWORD || 'demo1234');
    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, email_verified)
       VALUES (?, ?, ?, ?, ?, 'user', 1)`,
      [nextUserId, name, normalizedEmail, phone || '', hashPassword(initialPassword)],
    );
  } else {
    const updates = ['name = ?', 'phone = ?', 'email_verified = 1'];
    const params = [name, phone || ''];
    if (password) {
      updates.push('password_hash = ?');
      params.push(hashPassword(password));
    }
    updates.push('email = ?');
    params.push(normalizedEmail);
    params.push(nextUserId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  await pool.query(
    `INSERT INTO user_scopes (user_id, organisation_id, site_id, station_id, department_id, office_id)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       site_id = VALUES(site_id),
       station_id = VALUES(station_id),
       department_id = VALUES(department_id)`,
    [nextUserId, organisationId, siteId || null, stationId || null, departmentId || null],
  );

  const [[roleRow]] = await pool.query(
    'SELECT id FROM admin_roles WHERE slug = ? LIMIT 1',
    [GATE_ROLE_SLUG],
  );
  if (roleRow?.id) {
    if (active) {
      await pool.query(
        'INSERT IGNORE INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
        [nextUserId, roleRow.id],
      );
    } else {
      await pool.query(
        'DELETE FROM user_admin_roles WHERE user_id = ? AND role_id = ?',
        [nextUserId, roleRow.id],
      );
    }
  }

  return nextUserId;
}

export function parseSecurityGuardStationIds(body = {}, fallback = []) {
  if (Array.isArray(body.stationIds)) {
    return [...new Set(body.stationIds.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  if (Array.isArray(body.station_ids)) {
    return [...new Set(body.station_ids.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  if (body.stationId != null || body.station_id != null) {
    const single = String(body.stationId || body.station_id || '').trim();
    return single ? [single] : [];
  }
  return [...new Set((fallback || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export function parseSecurityGuardBuildingIds(body = {}, fallback = []) {
  if (Array.isArray(body.buildingIds)) {
    return [...new Set(body.buildingIds.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  if (Array.isArray(body.building_ids)) {
    return [...new Set(body.building_ids.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  return [...new Set((fallback || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export async function validateSecurityGuardStations(pool, stationIds, organisationId, siteId) {
  const uniqueIds = [...new Set((stationIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return { ok: true, stationIds: [] };

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT st.id, st.site_id
     FROM stations st
     INNER JOIN sites s ON s.id = st.site_id
     WHERE st.id IN (${placeholders}) AND s.organisation_id = ?`,
    [...uniqueIds, organisationId],
  );
  if (rows.length !== uniqueIds.length) {
    return { ok: false, status: 400, message: 'One or more gates were not found in this organisation.' };
  }
  if (siteId && rows.some((row) => row.site_id !== siteId)) {
    return { ok: false, status: 400, message: 'All selected gates must belong to the chosen site.' };
  }
  return { ok: true, stationIds: uniqueIds };
}

export async function validateSecurityGuardBuildings(pool, buildingIds, organisationId, siteId) {
  const uniqueIds = [...new Set((buildingIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return { ok: true, buildingIds: [] };

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT b.id, b.site_id
     FROM buildings b
     INNER JOIN sites s ON s.id = b.site_id
     WHERE b.id IN (${placeholders}) AND s.organisation_id = ?`,
    [...uniqueIds, organisationId],
  );
  if (rows.length !== uniqueIds.length) {
    return { ok: false, status: 400, message: 'One or more buildings were not found in this organisation.' };
  }
  if (siteId && rows.some((row) => row.site_id !== siteId)) {
    return { ok: false, status: 400, message: 'All selected buildings must belong to the chosen site.' };
  }
  return { ok: true, buildingIds: uniqueIds };
}

export async function syncSecurityGuardStations(pool, guardId, stationIds = []) {
  const uniqueIds = [...new Set((stationIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  await pool.query('DELETE FROM security_guard_stations WHERE security_guard_id = ?', [guardId]);
  for (const stationId of uniqueIds) {
    await pool.query(
      'INSERT INTO security_guard_stations (security_guard_id, station_id) VALUES (?, ?)',
      [guardId, stationId],
    );
  }
  // Keep legacy primary station column aligned for older readers.
  await pool.query(
    'UPDATE security_guards SET station_id = ? WHERE id = ?',
    [uniqueIds[0] || null, guardId],
  );
  return uniqueIds;
}

export async function syncSecurityGuardBuildings(pool, guardId, buildingIds = []) {
  const uniqueIds = [...new Set((buildingIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  await pool.query('DELETE FROM security_guard_buildings WHERE security_guard_id = ?', [guardId]);
  for (const buildingId of uniqueIds) {
    await pool.query(
      'INSERT INTO security_guard_buildings (security_guard_id, building_id) VALUES (?, ?)',
      [guardId, buildingId],
    );
  }
  return uniqueIds;
}

export async function loadSecurityGuardStations(pool, guardId) {
  const [rows] = await pool.query(
    `SELECT st.id, st.name, st.site_id
     FROM security_guard_stations gs
     INNER JOIN stations st ON st.id = gs.station_id
     WHERE gs.security_guard_id = ?
     ORDER BY st.name`,
    [guardId],
  );
  return rows;
}

export async function loadSecurityGuardBuildings(pool, guardId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.site_id
     FROM security_guard_buildings gb
     INNER JOIN buildings b ON b.id = gb.building_id
     WHERE gb.security_guard_id = ?
     ORDER BY b.name`,
    [guardId],
  );
  return rows;
}

export async function attachSecurityGuardScope(pool, rows = []) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return rows;
  const placeholders = ids.map(() => '?').join(', ');

  const [stationRows] = await pool.query(
    `SELECT gs.security_guard_id, st.id, st.name
     FROM security_guard_stations gs
     INNER JOIN stations st ON st.id = gs.station_id
     WHERE gs.security_guard_id IN (${placeholders})
     ORDER BY st.name`,
    ids,
  );
  const [buildingRows] = await pool.query(
    `SELECT gb.security_guard_id, b.id, b.name
     FROM security_guard_buildings gb
     INNER JOIN buildings b ON b.id = gb.building_id
     WHERE gb.security_guard_id IN (${placeholders})
     ORDER BY b.name`,
    ids,
  );

  const stationsByGuard = new Map();
  for (const row of stationRows) {
    const list = stationsByGuard.get(row.security_guard_id) || [];
    list.push(row);
    stationsByGuard.set(row.security_guard_id, list);
  }
  const buildingsByGuard = new Map();
  for (const row of buildingRows) {
    const list = buildingsByGuard.get(row.security_guard_id) || [];
    list.push(row);
    buildingsByGuard.set(row.security_guard_id, list);
  }

  return rows.map((row) => {
    const stations = stationsByGuard.get(row.id) || [];
    const buildings = buildingsByGuard.get(row.id) || [];
    return {
      ...row,
      station_ids: stations.length ? stations.map((s) => s.id) : (row.station_id ? [row.station_id] : []),
      station_names: stations.map((s) => s.name).join(', ') || row.station_name || '',
      building_ids: buildings.map((b) => b.id),
      building_names: buildings.map((b) => b.name).join(', '),
    };
  });
}

export async function loadSecurityGuardRow(pool, id) {
  const [[row]] = await pool.query(
    `SELECT g.*,
            o.name AS organisation_name,
            s.name AS site_name,
            st.name AS station_name,
            d.name AS department_name
     FROM security_guards g
     LEFT JOIN organisations o ON o.id = g.organisation_id
     LEFT JOIN sites s ON s.id = g.site_id
     LEFT JOIN stations st ON st.id = g.station_id
     LEFT JOIN departments d ON d.id = g.department_id
     WHERE g.id = ?
     LIMIT 1`,
    [id],
  );
  if (!row) return null;
  const [withScope] = await attachSecurityGuardScope(pool, [row]);
  return withScope;
}

/**
 * Resolve the logged-in security officer's scope (site + multi-gate +
 * multi-building, legacy station_id fallback). Zero station/building rows
 * with a site set is a valid, deliberate site-wide assignment.
 */
export async function resolveSecurityScopeContext(pool, userId) {
  const uid = String(userId || '').trim();
  if (!uid) {
    return { isSecurityOfficer: false, guardId: null, organisationId: null, siteId: null, stationIds: [], buildingIds: [] };
  }

  const [[guard]] = await pool.query(
    `SELECT id, organisation_id, site_id, station_id FROM security_guards
     WHERE user_id = ? AND status = 'active'
     LIMIT 1`,
    [uid],
  );
  if (!guard) {
    return { isSecurityOfficer: false, guardId: null, organisationId: null, siteId: null, stationIds: [], buildingIds: [] };
  }

  const stations = await loadSecurityGuardStations(pool, guard.id);
  let stationIds = stations.map((s) => String(s.id));
  if (!stationIds.length && guard.station_id) {
    stationIds = [String(guard.station_id)];
  }
  const buildings = await loadSecurityGuardBuildings(pool, guard.id);
  const buildingIds = buildings.map((b) => String(b.id));

  return {
    isSecurityOfficer: true,
    guardId: guard.id,
    organisationId: guard.organisation_id,
    siteId: guard.site_id || null,
    stationIds,
    buildingIds,
  };
}

/** Security APIs require a linked, active guard profile with a site assigned. */
export async function requireSecurityScopeContext(pool, userId) {
  const ctx = await resolveSecurityScopeContext(pool, userId);
  if (!ctx.isSecurityOfficer) {
    return {
      ok: false,
      status: 403,
      message: 'Security access requires a linked security guard profile. Contact your administrator.',
    };
  }
  if (!ctx.siteId) {
    return {
      ok: false,
      status: 403,
      message: 'No site is assigned to this security officer. Contact your administrator.',
    };
  }
  return { ok: true, ...ctx };
}

/**
 * Visit visibility for a security officer's scope — hard exclusion (Logic.md:
 * "must not see the visit" for out-of-scope officers, unlike the receptionist
 * visible-but-restricted rule). Inclusive-or across gate/building: an officer
 * with no station/building assignments sees the whole site (deliberate
 * site-wide assignment). Building is resolved via the visit's zone or office
 * when buildingIds is non-empty — callers must LEFT JOIN zones/offices with
 * the given aliases in that case.
 */
export function visitSecurityScopeFilterClause(scopeCtx, {
  visitAlias = 'vis',
  zoneAlias = 'sec_zone',
  officeAlias = 'sec_ofc',
} = {}) {
  if (!scopeCtx?.siteId) {
    return { sql: ' AND 1=0', params: [] };
  }

  const stationIds = scopeCtx.stationIds || [];
  const buildingIds = scopeCtx.buildingIds || [];
  if (!stationIds.length && !buildingIds.length) {
    return { sql: ` AND ${visitAlias}.site_id = ?`, params: [scopeCtx.siteId] };
  }

  const clauses = [];
  const params = [scopeCtx.siteId];
  if (stationIds.length) {
    clauses.push(`${visitAlias}.station_id IN (${stationIds.map(() => '?').join(', ')})`);
    params.push(...stationIds);
  }
  if (buildingIds.length) {
    clauses.push(`COALESCE(${zoneAlias}.building_id, ${officeAlias}.building_id) IN (${buildingIds.map(() => '?').join(', ')})`);
    params.push(...buildingIds);
  }

  return {
    sql: ` AND ${visitAlias}.site_id = ? AND (${clauses.join(' OR ')})`,
    params,
  };
}

/** Bulk "who should be notified" lookup for a given visit's site/station/building. */
export async function resolveSecurityAudienceForVisit(pool, { organisationId, siteId, stationId = null, buildingId = null }) {
  if (!organisationId || !siteId) return [];

  const [rows] = await pool.query(
    `SELECT g.id, g.user_id, u.email, u.phone, g.name
     FROM security_guards g
     LEFT JOIN users u ON u.id = g.user_id
     WHERE g.organisation_id = ? AND g.site_id = ? AND g.status = 'active' AND g.user_id IS NOT NULL`,
    [organisationId, siteId],
  );
  if (!rows.length) return [];

  const withScope = await attachSecurityGuardScope(pool, rows);
  return withScope.filter((guard) => {
    const stationIds = guard.station_ids || [];
    const buildingIds = guard.building_ids || [];
    if (!stationIds.length && !buildingIds.length) return true; // site-wide
    if (stationId && stationIds.includes(String(stationId))) return true;
    if (buildingId && buildingIds.includes(String(buildingId))) return true;
    return false;
  });
}
