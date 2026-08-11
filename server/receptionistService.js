import crypto from 'crypto';
import { hashPassword } from './auth.js';
import { loadZoneInOrg } from './orgStructureService.js';

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
    const updates = ['name = ?', 'phone = ?', 'email_verified = 1'];
    const params = [name, phone || ''];
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
     ORDER BY z.name`,
    [receptionistId],
  );
  return rows;
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
