import crypto from 'crypto';
import { hashPassword } from './auth.js';
import { sendEmail } from './adapters/emailAdapter.js';
import { getAppBaseUrl } from './adapters/deliveryConfig.js';
import { APP_NAME } from '../shared/branding.js';
import { loadZoneInOrg } from './orgStructureService.js';

const HOST_ROLE_SLUG = 'host';
const HOST_PORTAL_ROLE_SLUGS = ['host', 'ceo', 'dceo'];
const RESET_TTL_HOURS = 24;

export function normalizeHostPortalRole(value) {
  const slug = String(value || '').trim().toLowerCase().replace(/[.\s_-]+/g, '');
  if (slug === 'ceo') return 'ceo';
  if (slug === 'dceo' || slug === 'deputyceo' || slug === 'deputychiefexecutiveofficer') return 'dceo';
  if (slug === 'host' || slug === 'generalemployee' || slug === 'employee' || slug === 'general') return 'host';
  return 'host';
}

export function hostPortalRoleLabel(slug) {
  const normalized = normalizeHostPortalRole(slug);
  if (normalized === 'ceo') return 'CEO';
  if (normalized === 'dceo') return 'Deputy CEO';
  return 'General Employee';
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function ensurePasswordResetSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(90) PRIMARY KEY,
      user_id VARCHAR(90) NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_by VARCHAR(90),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_prt_token_hash (token_hash),
      INDEX idx_prt_user (user_id)
    )
  `);
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Ensure a host has a login user with Host portal access and org scope.
 * @returns {Promise<string|null>} user id
 */
/**
 * Assign exactly one host-portal role (host | ceo | dceo) for the linked user.
 * CEO / DCEO replace General Employee so calendar titles stay in sync.
 */
export async function syncHostPortalRole(pool, userId, portalRole = HOST_ROLE_SLUG, active = true) {
  if (!userId) return null;
  const targetSlug = normalizeHostPortalRole(portalRole);
  const placeholders = HOST_PORTAL_ROLE_SLUGS.map(() => '?').join(', ');
  const [roleRows] = await pool.query(
    `SELECT id, slug FROM admin_roles WHERE slug IN (${placeholders})`,
    HOST_PORTAL_ROLE_SLUGS,
  );
  const bySlug = new Map(roleRows.map((row) => [row.slug, row.id]));

  for (const slug of HOST_PORTAL_ROLE_SLUGS) {
    const roleId = bySlug.get(slug);
    if (!roleId) continue;
    if (active && slug === targetSlug) {
      await pool.query(
        'INSERT IGNORE INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
        [userId, roleId],
      );
    } else {
      await pool.query(
        'DELETE FROM user_admin_roles WHERE user_id = ? AND role_id = ?',
        [userId, roleId],
      );
    }
  }

  return targetSlug;
}

export async function resolveHostPortalRole(pool, userId) {
  if (!userId) return 'host';
  const placeholders = HOST_PORTAL_ROLE_SLUGS.map(() => '?').join(', ');
  const [[row]] = await pool.query(
    `SELECT ar.slug
     FROM user_admin_roles uar
     INNER JOIN admin_roles ar ON ar.id = uar.role_id
     WHERE uar.user_id = ? AND ar.slug IN (${placeholders})
     ORDER BY CASE ar.slug
       WHEN 'ceo' THEN 1
       WHEN 'dceo' THEN 2
       WHEN 'host' THEN 3
       ELSE 4
     END
     LIMIT 1`,
    [userId, ...HOST_PORTAL_ROLE_SLUGS],
  );
  return normalizeHostPortalRole(row?.slug || 'host');
}

export function parseHostZoneIds(body = {}, fallback = []) {
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

export async function validateHostZones(pool, zoneIds, organisationId, siteId) {
  const uniqueIds = [...new Set((zoneIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    return { ok: true, zones: [], zoneIds: [] };
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

export async function syncHostZones(pool, hostId, zoneIds = []) {
  const uniqueIds = [...new Set((zoneIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  await pool.query('DELETE FROM host_zones WHERE host_id = ?', [hostId]);
  for (const zoneId of uniqueIds) {
    await pool.query(
      'INSERT INTO host_zones (host_id, zone_id) VALUES (?, ?)',
      [hostId, zoneId],
    );
  }
  // Keep legacy primary zone column aligned for older readers without touching other columns.
  await pool.query(
    'UPDATE hosts SET zone_id = ? WHERE id = ?',
    [uniqueIds[0] || null, hostId],
  );
  return uniqueIds;
}

export async function loadHostZones(pool, hostId) {
  const [rows] = await pool.query(
    `SELECT z.id, z.name, b.site_id, s.organisation_id, b.name AS building_name
     FROM host_zones hz
     INNER JOIN zones z ON z.id = hz.zone_id
     LEFT JOIN buildings b ON b.id = z.building_id
     LEFT JOIN sites s ON s.id = b.site_id
     WHERE hz.host_id = ?
       AND COALESCE(hz.status, 'active') = 'active'
     ORDER BY z.name`,
    [hostId],
  );
  return rows;
}

export async function attachHostZones(pool, rows = []) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return rows;
  const placeholders = ids.map(() => '?').join(', ');
  const [zoneRows] = await pool.query(
    `SELECT hz.host_id, z.id, z.name, b.name AS building_name
     FROM host_zones hz
     INNER JOIN zones z ON z.id = hz.zone_id
     LEFT JOIN buildings b ON b.id = z.building_id
     WHERE hz.host_id IN (${placeholders})
       AND COALESCE(hz.status, 'active') = 'active'
     ORDER BY z.name`,
    ids,
  );

  const byHost = new Map();
  for (const row of zoneRows) {
    const list = byHost.get(row.host_id) || [];
    list.push(row);
    byHost.set(row.host_id, list);
  }

  return rows.map((row) => {
    const assigned = byHost.get(row.id) || [];
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
 * Resolve a host's zone assignment for portal-lock/access-policy purposes.
 * Resolution order (deny-by-default — an empty array is a legitimate terminal
 * state, never an error): host_zones (multi-zone, explicit) → legacy
 * hosts.zone_id → offices.zone_id (via the host's office) → configurable
 * role→zone default mapping (host_role_zone_defaults) → [].
 * Accepts either a host id string or an already-loaded host row (avoids a
 * redundant query when the caller already has one).
 */
export async function resolveHostZoneIds(pool, hostIdOrHost) {
  let host = hostIdOrHost;
  if (typeof hostIdOrHost === 'string' || typeof hostIdOrHost === 'number') {
    const [[row]] = await pool.query(
      `SELECT id, organisation_id, zone_id, office_id, user_id
       FROM hosts WHERE id = ? LIMIT 1`,
      [String(hostIdOrHost)],
    );
    host = row;
  }
  if (!host?.id) return [];

  const explicit = await loadHostZones(pool, host.id);
  if (explicit.length) {
    return explicit.map((zone) => String(zone.id));
  }

  if (host.zone_id) {
    return [String(host.zone_id)];
  }

  if (host.office_id) {
    const [[office]] = await pool.query(
      'SELECT zone_id FROM offices WHERE id = ? LIMIT 1',
      [host.office_id],
    );
    if (office?.zone_id) {
      return [String(office.zone_id)];
    }
  }

  const roleSlug = await resolveHostPortalRole(pool, host.user_id || null);
  if (roleSlug && host.organisation_id) {
    const [[mapping]] = await pool.query(
      `SELECT zone_id FROM host_role_zone_defaults
       WHERE organisation_id = ? AND role_slug = ? LIMIT 1`,
      [host.organisation_id, roleSlug],
    );
    if (mapping?.zone_id) {
      return [String(mapping.zone_id)];
    }
  }

  return [];
}

export async function resolveHostPrimaryZoneId(pool, hostIdOrHost) {
  const zoneIds = await resolveHostZoneIds(pool, hostIdOrHost);
  return zoneIds[0] || null;
}

export async function syncHostPortalUser(pool, {
  userId = null,
  name,
  email,
  phone = null,
  organisationId,
  siteId = null,
  departmentId = null,
  officeId = null,
  password = null,
  active = true,
  portalRole = HOST_ROLE_SLUG,
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
    const initialPassword = String(
      password || crypto.randomBytes(18).toString('base64url'),
    );
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
    // Keep login email in sync with host email when the account is linked.
    updates.push('email = ?');
    params.push(normalizedEmail);
    params.push(nextUserId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  await pool.query(
    `INSERT INTO user_scopes (user_id, organisation_id, site_id, station_id, department_id, office_id)
     VALUES (?, ?, ?, NULL, ?, ?)
     ON DUPLICATE KEY UPDATE
       site_id = VALUES(site_id),
       department_id = VALUES(department_id),
       office_id = VALUES(office_id)`,
    [nextUserId, organisationId, siteId || null, departmentId || null, officeId || null],
  );

  await syncHostPortalRole(pool, nextUserId, portalRole, active);

  return nextUserId;
}

export async function createPasswordResetToken(pool, {
  userId,
  createdBy = null,
  ttlHours = RESET_TTL_HOURS,
}) {
  await ensurePasswordResetSchema(pool);

  // Invalidate outstanding unused tokens for this user.
  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = ? AND used_at IS NULL`,
    [userId],
  );

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const id = generateId('prt');
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, tokenHash, expiresAt.toISOString().slice(0, 19).replace('T', ' '), createdBy],
  );

  return { token: rawToken, expiresAt, id };
}

export async function sendHostPasswordResetEmail(pool, {
  host,
  createdBy = null,
}) {
  const email = String(host.email || '').trim().toLowerCase();
  if (!email) {
    const err = new Error('Host email is required to send a password reset.');
    err.status = 400;
    throw err;
  }

  const existingPortalRole = await resolveHostPortalRole(pool, host.user_id || null);
  const linkedUserId = await syncHostPortalUser(pool, {
    userId: host.user_id || null,
    name: host.name,
    email,
    phone: host.phone,
    organisationId: host.organisation_id,
    siteId: host.site_id,
    departmentId: host.department_id,
    officeId: host.office_id,
    active: host.status !== 'inactive',
    portalRole: existingPortalRole,
  });

  if (!linkedUserId) {
    const err = new Error('Could not create a portal login for this host.');
    err.status = 500;
    throw err;
  }

  if (!host.user_id || host.user_id !== linkedUserId) {
    await pool.query('UPDATE hosts SET user_id = ? WHERE id = ?', [linkedUserId, host.id]);
  }

  const { token, expiresAt } = await createPasswordResetToken(pool, {
    userId: linkedUserId,
    createdBy,
  });

  const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = `${APP_NAME} — Reset your password`;
  const body = [
    `Hello ${host.name || 'there'},`,
    '',
    `An administrator requested a password reset for your ${APP_NAME} host account.`,
    '',
    'Use this link to choose a new password:',
    resetUrl,
    '',
    `This link expires at ${expiresAt.toUTCString()}.`,
    '',
    'If you did not expect this email, you can ignore it.',
    '',
    `— ${APP_NAME}`,
  ].join('\n');

  const delivery = await sendEmail({ to: email, subject, body });
  return {
    userId: linkedUserId,
    email,
    expiresAt,
    delivery,
  };
}

export async function consumePasswordResetToken(pool, rawToken, newPassword) {
  await ensurePasswordResetSchema(pool);
  const tokenHash = hashResetToken(rawToken);
  const [[row]] = await pool.query(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = ?
     LIMIT 1`,
    [tokenHash],
  );

  if (!row) {
    const err = new Error('Invalid or expired password reset link.');
    err.status = 400;
    throw err;
  }
  if (row.used_at) {
    const err = new Error('This password reset link has already been used.');
    err.status = 400;
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const err = new Error('This password reset link has expired.');
    err.status = 400;
    throw err;
  }

  await pool.query(
    'UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?',
    [hashPassword(newPassword), row.user_id],
  );
  await pool.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?',
    [row.id],
  );

  return { userId: row.user_id };
}

export async function peekPasswordResetToken(pool, rawToken) {
  await ensurePasswordResetSchema(pool);
  const tokenHash = hashResetToken(rawToken);
  const [[row]] = await pool.query(
    `SELECT t.id, t.expires_at, t.used_at, u.email, u.name
     FROM password_reset_tokens t
     INNER JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ?
     LIMIT 1`,
    [tokenHash],
  );
  if (!row) return { valid: false, reason: 'invalid' };
  if (row.used_at) return { valid: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: 'expired' };
  return {
    valid: true,
    email: row.email,
    name: row.name,
    expiresAt: row.expires_at,
  };
}
