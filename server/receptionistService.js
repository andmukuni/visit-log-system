import crypto from 'crypto';
import { hashPassword } from './auth.js';
import { loadZoneInOrg } from './orgStructureService.js';
import { resolveHostPrimaryZoneId } from './hostPortalService.js';

const RECEPTION_ROLE_SLUG = 'main_reception';

/**
 * Ensure a receptionist has a login user with Reception portal access and scope.
 * @returns {Promise<string|null>} user id
 */
export async function syncReceptionistPortalUser(pool, {
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
    const [[conflict]] = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = ? AND id != ? LIMIT 1',
      [normalizedEmail, nextUserId],
    );
    if (conflict?.id) {
      const err = new Error('Another login account already uses this email.');
      err.status = 409;
      throw err;
    }

    const updates = ['name = ?', 'phone = ?', 'email = ?', 'email_verified = 1'];
    const params = [name, phone || '', normalizedEmail];
    if (password) {
      updates.push('password_hash = ?');
      params.push(hashPassword(password));
    }
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
    [RECEPTION_ROLE_SLUG],
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

export function parseReceptionistZoneIds(body = {}, fallback = []) {
  if (Array.isArray(body.zoneIds)) {
    return [...new Set(body.zoneIds.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  if (Array.isArray(body.zone_ids)) {
    return [...new Set(body.zone_ids.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  if (body.zoneId != null || body.zone_id != null) {
    const single = String(body.zoneId || body.zone_id || '').trim();
    return single ? [single] : [];
  }
  return [...new Set((fallback || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export async function validateReceptionistZones(pool, zoneIds, organisationId, siteId) {
  const uniqueIds = [...new Set(zoneIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    return { ok: false, status: 400, message: 'At least one zone is required.' };
  }

  const resolved = [];
  for (const zoneId of uniqueIds) {
    const zone = await loadZoneInOrg(pool, zoneId, organisationId);
    if (!zone) {
      return { ok: false, status: 400, message: 'One or more zones were not found in this organisation.' };
    }
    if (zone.site_id && siteId && zone.site_id !== siteId) {
      return { ok: false, status: 400, message: 'All selected zones must belong to the chosen site.' };
    }
    resolved.push(zone);
  }

  return { ok: true, zones: resolved, zoneIds: uniqueIds };
}

export async function syncReceptionistZones(pool, receptionistId, zoneIds = []) {
  const uniqueIds = [...new Set(zoneIds.map((id) => String(id || '').trim()).filter(Boolean))];
  await pool.query('DELETE FROM receptionist_zones WHERE receptionist_id = ?', [receptionistId]);
  for (const zoneId of uniqueIds) {
    await pool.query(
      'INSERT INTO receptionist_zones (receptionist_id, zone_id) VALUES (?, ?)',
      [receptionistId, zoneId],
    );
  }
  // Keep legacy primary zone column aligned for older readers without touching other columns.
  await pool.query(
    'UPDATE receptionists SET zone_id = ? WHERE id = ?',
    [uniqueIds[0] || null, receptionistId],
  );
  return uniqueIds;
}

export async function loadReceptionistZones(pool, receptionistId) {
  const [rows] = await pool.query(
    `SELECT z.id, z.name, b.site_id, s.organisation_id, b.name AS building_name
     FROM receptionist_zones rz
     INNER JOIN zones z ON z.id = rz.zone_id
     LEFT JOIN buildings b ON b.id = z.building_id
     LEFT JOIN sites s ON s.id = b.site_id
     WHERE rz.receptionist_id = ?
       AND COALESCE(rz.status, 'active') = 'active'
     ORDER BY z.name`,
    [receptionistId],
  );
  return rows;
}

/**
 * Resolve zone IDs for the logged-in receptionist (multi-zone + legacy zone_id).
 * @returns {{ isReceptionist: boolean, receptionistId: string|null, zoneIds: string[] }}
 */
export async function resolveReceptionZoneContext(pool, userId) {
  const uid = String(userId || '').trim();
  if (!uid) {
    return { isReceptionist: false, receptionistId: null, zoneIds: [] };
  }

  const [[receptionist]] = await pool.query(
    `SELECT id, zone_id FROM receptionists
     WHERE user_id = ? AND status = 'active'
     LIMIT 1`,
    [uid],
  );
  if (!receptionist) {
    return { isReceptionist: false, receptionistId: null, zoneIds: [] };
  }

  const assigned = await loadReceptionistZones(pool, receptionist.id);
  let zoneIds = assigned.map((zone) => String(zone.id));
  if (!zoneIds.length) {
    // Only fall back to the legacy single-zone column when the join table has
    // never been populated for this receptionist. If rows exist but are all
    // revoked/inactive, the correct answer is "no zones", not the old one.
    const [[rows]] = await pool.query(
      'SELECT COUNT(*) AS count FROM receptionist_zones WHERE receptionist_id = ?',
      [receptionist.id],
    );
    if (!Number(rows?.count || 0) && receptionist.zone_id) {
      zoneIds = [String(receptionist.zone_id)];
    }
  }

  return {
    isReceptionist: true,
    receptionistId: receptionist.id,
    zoneIds,
  };
}

/** Reception APIs require a linked receptionist with at least one zone. */
export async function requireReceptionZoneContext(pool, userId) {
  const ctx = await resolveReceptionZoneContext(pool, userId);
  if (!ctx.isReceptionist) {
    return {
      ok: false,
      status: 403,
      message: 'Reception access requires a linked receptionist profile. Contact your administrator.',
    };
  }
  if (!ctx.zoneIds.length) {
    return {
      ok: false,
      status: 403,
      message: 'No zones are assigned to this receptionist. Contact your administrator.',
    };
  }
  return { ok: true, ...ctx };
}

/**
 * Resolve a host's primary zone. Delegates to hostPortalService's 4-tier
 * resolution (host_zones → hosts.zone_id → office.zone_id → role default)
 * so every existing caller of this function/module path automatically gains
 * multi-zone + role-default-mapping support with zero import changes.
 */
export async function resolveHostZoneId(pool, hostId) {
  const id = String(hostId || '').trim();
  if (!id) return null;
  return resolveHostPrimaryZoneId(pool, id);
}

/**
 * Visit visibility for a receptionist zone set — strict isolation.
 * Uses one resolved zone: visit.zone_id → host.zone_id → host office → visit office.
 * Params: [...zoneIds] once.
 */
export function visitZoneFilterClause(zoneIds, {
  hostOfficeAlias = 'ofc',
  visitOfficeAlias = 'vis_ofc',
  visitAlias = 'vis',
  hostAlias = 'h',
} = {}) {
  if (!Array.isArray(zoneIds) || !zoneIds.length) {
    return { sql: ' AND 1=0', params: [] };
  }

  const placeholders = zoneIds.map(() => '?').join(', ');
  return {
    sql: ` AND COALESCE(
      NULLIF(${visitAlias}.zone_id, ''),
      NULLIF(${hostAlias}.zone_id, ''),
      ${hostOfficeAlias}.zone_id,
      ${visitOfficeAlias}.zone_id
    ) IN (${placeholders})`,
    params: [...zoneIds],
  };
}

/** Host list filter — resolved host zone (host.zone_id, else office zone). */
export function hostZoneFilterClause(zoneIds, officeAlias = 'ofc', hostAlias = 'h') {
  if (!Array.isArray(zoneIds) || !zoneIds.length) {
    return { sql: ' AND 1=0', params: [] };
  }
  const placeholders = zoneIds.map(() => '?').join(', ');
  return {
    sql: ` AND COALESCE(NULLIF(${hostAlias}.zone_id, ''), ${officeAlias}.zone_id) IN (${placeholders})`,
    params: [...zoneIds],
  };
}

/** Office list filter by zone. */
export function officeZoneFilterClause(zoneIds, alias = 'ofc') {
  if (!Array.isArray(zoneIds) || !zoneIds.length) {
    return { sql: ' AND 1=0', params: [] };
  }
  const placeholders = zoneIds.map(() => '?').join(', ');
  return {
    sql: ` AND ${alias}.zone_id IN (${placeholders})`,
    params: [...zoneIds],
  };
}

/**
 * Boolean SQL expression (no leading AND) — TRUE if a visit's live host-zone
 * set intersects zoneIds. This is the literal
 * intersection(host.zoneIds, receptionist.zoneIds).length > 0 from Logic.md,
 * evaluated against live host_zones data on every read (not the frozen
 * visits.zone_id snapshot) — so revoked/reassigned zones take effect
 * immediately. Multi-zone aware: host_zones wins over legacy hosts.zone_id
 * only when host_zones has no rows for that host, mirroring
 * resolveReceptionZoneContext's fallback convention. Callers use this in a
 * SELECT list (not a WHERE filter) — visitZoneFilterClause is unchanged and
 * still the right tool for hard-excluding queries.
 */
export function visitZoneMatchExpr(zoneIds, {
  visitAlias = 'vis',
  hostAlias = 'h',
  hostOfficeAlias = 'ofc',
  visitOfficeAlias = 'vis_ofc',
} = {}) {
  const ids = Array.isArray(zoneIds) ? zoneIds.filter(Boolean) : [];
  if (!ids.length) {
    return { sql: '0', params: [] };
  }

  // Set-based (non-correlated) rather than a correlated EXISTS: identical
  // semantics, evaluated once instead of per row, and independent of whether
  // `hosts` is joined. NULL host_id yields NULL from IN, falling through to
  // ELSE 0 — fail-safe.
  const placeholders = ids.map(() => '?').join(', ');
  const sql = `(CASE
    WHEN ${visitAlias}.host_id IN (
      SELECT hz.host_id FROM host_zones hz
      WHERE COALESCE(hz.status, 'active') = 'active' AND hz.zone_id IN (${placeholders})
    ) THEN 1
    WHEN ${visitAlias}.host_id NOT IN (
      SELECT hz2.host_id FROM host_zones hz2 WHERE COALESCE(hz2.status, 'active') = 'active'
    ) AND COALESCE(
        NULLIF(${hostAlias}.zone_id, ''),
        ${hostOfficeAlias}.zone_id,
        ${visitOfficeAlias}.zone_id,
        NULLIF(${visitAlias}.zone_id, '')
      ) IN (${placeholders})
    THEN 1
    ELSE 0 END)`;

  return { sql, params: [...ids, ...ids] };
}

/**
 * Search predicate for reception visit lists that now include cross-zone rows.
 *
 * Without this split, search is an inference oracle: a receptionist could type
 * a company name, host name, or pass code and learn — from the mere presence of
 * a restricted result row — a protected field of a visit outside their zone.
 * In-zone rows keep the full-column search; cross-zone rows are matchable only
 * on visitor name, which the restricted DTO already exposes anyway.
 *
 * The zone-match expression must be inlined (not referenced by its SELECT
 * alias) because neither MySQL nor Postgres allows a SELECT alias in WHERE.
 * Returned params are already in emission order.
 */
export function buildReceptionSearchClause(zoneMatch, term = '') {
  const like = `%${term}%`;
  const expr = zoneMatch?.sql ?? '0';
  const exprParams = zoneMatch?.params ?? [];
  return {
    sql: ` AND (
      (${expr} = 1 AND (
        v.full_name LIKE ?
        OR vis.pass_code LIKE ?
        OR h.name LIKE ?
        OR v.company LIKE ?
      ))
      OR (${expr} = 0 AND v.full_name LIKE ?)
    )`,
    params: [...exprParams, like, like, like, like, ...exprParams, like],
  };
}

export async function assertTargetInReceptionZones(pool, {
  hostId = null,
  officeId = null,
  organisationId,
  zoneIds,
}) {
  if (!Array.isArray(zoneIds) || !zoneIds.length) {
    return { ok: false, status: 403, message: 'No zones are assigned to this receptionist.' };
  }

  const zoneSet = new Set(zoneIds.map(String));

  if (officeId) {
    const [[office]] = await pool.query(
      `SELECT id, zone_id FROM offices
       WHERE id = ? AND organisation_id = ? AND status = 'active'
       LIMIT 1`,
      [officeId, organisationId],
    );
    if (!office) {
      return { ok: false, status: 400, message: 'Selected office was not found.' };
    }
    if (!office.zone_id || !zoneSet.has(String(office.zone_id))) {
      return {
        ok: false,
        status: 403,
        message: 'You can only queue visitors to offices in your zone.',
      };
    }
  }

  if (hostId) {
    const [[host]] = await pool.query(
      `SELECT h.id, COALESCE(NULLIF(h.zone_id, ''), ofc.zone_id) AS zone_id
       FROM hosts h
       LEFT JOIN offices ofc ON ofc.id = h.office_id
       WHERE h.id = ? AND h.organisation_id = ? AND h.status = 'active'
       LIMIT 1`,
      [hostId, organisationId],
    );
    if (!host) {
      return { ok: false, status: 400, message: 'Selected host was not found.' };
    }
    if (!host.zone_id || !zoneSet.has(String(host.zone_id))) {
      return {
        ok: false,
        status: 403,
        message: 'You can only queue visitors to hosts in your zone.',
      };
    }
  }

  return { ok: true };
}

export async function attachReceptionistZones(pool, rows = []) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  const placeholders = ids.map(() => '?').join(', ');
  const [zoneRows] = await pool.query(
    `SELECT rz.receptionist_id, z.id, z.name, b.name AS building_name
     FROM receptionist_zones rz
     INNER JOIN zones z ON z.id = rz.zone_id
     LEFT JOIN buildings b ON b.id = z.building_id
     WHERE rz.receptionist_id IN (${placeholders})
       AND COALESCE(rz.status, 'active') = 'active'
     ORDER BY z.name`,
    ids,
  );

  const byReceptionist = new Map();
  for (const row of zoneRows) {
    const list = byReceptionist.get(row.receptionist_id) || [];
    list.push(row);
    byReceptionist.set(row.receptionist_id, list);
  }

  return rows.map((row) => {
    const assigned = byReceptionist.get(row.id) || [];
    const zoneIds = assigned.map((zone) => zone.id);
    const zoneNames = assigned.map((zone) => (
      zone.building_name ? `${zone.name} · ${zone.building_name}` : zone.name
    ));
    const fallbackName = row.zone_name || '';
    return {
      ...row,
      zone_ids: zoneIds.length ? zoneIds : (row.zone_id ? [row.zone_id] : []),
      zone_names: zoneNames.length ? zoneNames.join(', ') : fallbackName,
      zones: assigned,
      zone_id: zoneIds[0] || row.zone_id || null,
      zone_name: zoneNames.length ? zoneNames.join(', ') : fallbackName,
    };
  });
}

/**
 * Split active receptionists at a site into same-zone / different-zone
 * buckets against a host's resolved zone set, for notification audience
 * resolution. The empty-hostZoneIds fail-safe (Logic.md scenario 6) falls
 * out for free here: every receptionist lands in differentZone when
 * hostZoneIds is empty, with no special-casing needed.
 */
export async function resolveReceptionAudienceByZone(pool, { organisationId, siteId = null, hostZoneIds = [] }) {
  if (!organisationId) return { sameZone: [], differentZone: [] };

  const params = [organisationId];
  let siteClause = '';
  if (siteId) {
    siteClause = ' AND (r.site_id IS NULL OR r.site_id = ?)';
    params.push(siteId);
  }

  const [rows] = await pool.query(
    `SELECT r.id, r.user_id, r.name, u.email, u.phone
     FROM receptionists r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.organisation_id = ? AND r.status = 'active' AND r.user_id IS NOT NULL${siteClause}`,
    params,
  );
  if (!rows.length) return { sameZone: [], differentZone: [] };

  const withZones = await attachReceptionistZones(pool, rows);
  const hostZoneSet = new Set((hostZoneIds || []).map(String));

  const sameZone = [];
  const differentZone = [];
  for (const receptionist of withZones) {
    const zoneIds = receptionist.zone_ids || [];
    const matches = hostZoneSet.size > 0 && zoneIds.some((id) => hostZoneSet.has(String(id)));
    const bucket = { receptionistId: receptionist.id, userId: receptionist.user_id, email: receptionist.email, phone: receptionist.phone, name: receptionist.name };
    (matches ? sameZone : differentZone).push(bucket);
  }

  return { sameZone, differentZone };
}

export async function loadReceptionistRow(pool, id) {
  const [[row]] = await pool.query(
    `SELECT r.*,
            o.name AS organisation_name,
            s.name AS site_name,
            z.name AS zone_name,
            b.name AS building_name,
            d.name AS department_name
     FROM receptionists r
     LEFT JOIN organisations o ON o.id = r.organisation_id
     LEFT JOIN sites s ON s.id = r.site_id
     LEFT JOIN zones z ON z.id = r.zone_id
     LEFT JOIN buildings b ON b.id = z.building_id
     LEFT JOIN departments d ON d.id = r.department_id
     WHERE r.id = ?
     LIMIT 1`,
    [id],
  );
  if (!row) return null;

  const assignedZones = await loadReceptionistZones(pool, id);
  const zoneIds = assignedZones.map((zone) => zone.id);
  const zoneNames = assignedZones.map((zone) => (
    zone.building_name ? `${zone.name} · ${zone.building_name}` : zone.name
  ));

  return {
    ...row,
    zones: assignedZones,
    zone_ids: zoneIds.length ? zoneIds : (row.zone_id ? [row.zone_id] : []),
    zone_names: zoneNames.length ? zoneNames.join(', ') : (row.zone_name || ''),
    zone_id: zoneIds[0] || row.zone_id || null,
    zone_name: zoneNames.length ? zoneNames.join(', ') : (row.zone_name || ''),
  };
}
