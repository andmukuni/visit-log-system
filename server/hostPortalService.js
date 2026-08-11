import crypto from 'crypto';
import { hashPassword } from './auth.js';
import { sendEmail } from './adapters/emailAdapter.js';
import { getAppBaseUrl } from './adapters/deliveryConfig.js';
import { APP_NAME } from '../shared/branding.js';

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
     ORDER BY FIELD(ar.slug, 'ceo', 'dceo', 'host')
     LIMIT 1`,
    [userId, ...HOST_PORTAL_ROLE_SLUGS],
  );
  return normalizeHostPortalRole(row?.slug || 'host');
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
