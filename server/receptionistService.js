import crypto from 'crypto';
import { hashPassword } from './auth.js';

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
  return row || null;
}
