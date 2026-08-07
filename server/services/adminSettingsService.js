import pool from '../db.js';
import { writeAuditLog } from '../auditService.js';

export const SETTING_KEYS = {
  NOTIFICATIONS: 'notifications',
  SMTP: 'smtp',
  SECURITY: 'security',
  GENERAL: 'general',
  DOJAH: 'dojah',
  SMS: 'sms',
};

export const VISITOR_NOTIFICATION_KEYS = [
  'visit_registered',
  'visit_approved',
  'visit_rejected',
  'visit_checked_in',
  'visit_checked_out',
  'visit_reminder',
  'vehicle_registered',
  'emergency_roll_call',
  'incident_reported',
];

function buildDefaultNotifications() {
  const defaults = { in_app_notifications: true };
  for (const key of VISITOR_NOTIFICATION_KEYS) {
    defaults[`email_${key}`] = true;
    defaults[`sms_${key}`] = ['emergency_roll_call', 'incident_reported', 'visit_reminder'].includes(key);
  }
  return defaults;
}

export const DEFAULT_NOTIFICATIONS = buildDefaultNotifications();

export const DEFAULT_SECURITY = {
  min_password_length: 8,
  require_email_verification: true,
  session_timeout_minutes: 480,
  mfa_enabled: true,
  mfa_allow_sms: true,
  mfa_allow_email: true,
  mfa_allow_totp: true,
  mfa_require_all_users: false,
  mfa_require_admin_users: false,
};

export const DEFAULT_GENERAL = {
  app_name: 'VM360 Visitor Management',
  support_email: 'support@vm360.local',
  support_phone: '',
};

export const DEFAULT_SMTP = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  from: '',
  from_name: 'VM360 Visitor Management',
};

export const DEFAULT_DOJAH = {
  enabled: false,
  app_id: '',
  public_key: '',
  private_key: '',
  use_sandbox: false,
};

export const DEFAULT_SMS = {
  enabled: false,
  provider: 'console',
  twilio_account_sid: '',
  twilio_auth_token: '',
  twilio_from: '',
  base_url: 'https://bulksms.ontech.co.zm/smsservice',
  access_id: '',
  sender_id: '',
};

const DEFAULTS = {
  [SETTING_KEYS.NOTIFICATIONS]: DEFAULT_NOTIFICATIONS,
  [SETTING_KEYS.SMTP]: DEFAULT_SMTP,
  [SETTING_KEYS.SECURITY]: DEFAULT_SECURITY,
  [SETTING_KEYS.GENERAL]: DEFAULT_GENERAL,
  [SETTING_KEYS.DOJAH]: DEFAULT_DOJAH,
  [SETTING_KEYS.SMS]: DEFAULT_SMS,
};

function parseJson(value, fallback) {
  if (value == null || value === '') return { ...fallback };
  if (typeof value === 'object') return { ...fallback, ...value };
  try {
    return { ...fallback, ...JSON.parse(value) };
  } catch {
    return { ...fallback };
  }
}

function mapUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    role: row.role || 'user',
    email_verified: Boolean(row.email_verified),
  };
}

export async function getSetting(key) {
  const [[row]] = await pool.query(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key],
  );
  return parseJson(row?.setting_value, DEFAULTS[key] || {});
}

export async function setSetting(key, value, actorId) {
  const payload = JSON.stringify(value);
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [key, payload, actorId || null],
  );
  await writeAuditLog(pool, {
    actorUserId: actorId || null,
    action: 'settings_updated',
    targetType: 'system_settings',
    targetId: key,
    details: value,
  });
  return value;
}

function envSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  return {
    enabled: true,
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').trim() === '1',
    user: String(process.env.SMTP_USER || '').trim(),
    pass: String(process.env.SMTP_PASS || ''),
    from: String(process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@vm360.local').trim(),
    from_name: String(process.env.EMAIL_FROM_NAME || 'VM360 Visitor Management').trim(),
    source: 'env',
  };
}

export function resolveSmtpPass(config = {}) {
  return String(config.pass || process.env.SMTP_PASS || '').trim();
}

export function isSmtpConfigured(config) {
  if (!config || config.source === 'none') return false;
  if (!config.enabled) return false;
  const host = String(config.host || '').trim();
  if (!host) return false;
  const user = String(config.user || '').trim();
  if (user && !resolveSmtpPass(config)) return false;
  return true;
}

export async function getEffectiveSmtpConfig() {
  const stored = await getSetting(SETTING_KEYS.SMTP);
  if (stored.enabled && stored.host) {
    return { ...stored, source: 'database' };
  }
  const envConfig = envSmtpConfig();
  if (envConfig) return envConfig;
  return { ...DEFAULT_SMTP, source: 'none' };
}

function maskSmtpForClient(stored, effective) {
  return {
    enabled: Boolean(stored.enabled),
    host: stored.host || '',
    port: Number(stored.port || 587),
    secure: Boolean(stored.secure),
    user: stored.user || '',
    from: stored.from || DEFAULT_SMTP.from,
    from_name: stored.from_name || DEFAULT_SMTP.from_name,
    pass_set: Boolean(stored.pass),
    configured: isSmtpConfigured(effective),
    source: effective.source,
  };
}

function envDojahConfig() {
  const appId = String(process.env.DOJAH_APP_ID || '').trim();
  const privateKey = String(process.env.DOJAH_PRIVATE_KEY || process.env.DOJAH_SECRET_KEY || '').trim();
  if (!appId || !privateKey) return null;
  return {
    enabled: true,
    app_id: appId,
    public_key: String(process.env.DOJAH_PUBLIC_KEY || '').trim(),
    private_key: privateKey,
    use_sandbox: String(process.env.DOJAH_USE_SANDBOX || '').trim() === '1',
    source: 'env',
  };
}

export async function getEffectiveDojahConfig() {
  const stored = await getSetting(SETTING_KEYS.DOJAH);
  if (stored.enabled && stored.app_id && stored.private_key) {
    return { ...stored, source: 'database' };
  }
  const envConfig = envDojahConfig();
  if (envConfig) return envConfig;
  return { ...DEFAULT_DOJAH, source: 'none' };
}

function maskDojahForClient(stored, effective) {
  return {
    enabled: Boolean(stored.enabled),
    app_id: stored.app_id || '',
    public_key: stored.public_key || '',
    private_key_set: Boolean(stored.private_key),
    use_sandbox: Boolean(stored.use_sandbox),
    configured: Boolean(effective.app_id && effective.private_key),
    source: effective.source,
  };
}

function envSmsConfig() {
  const provider = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (provider === 'twilio') {
    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
    const from = String(process.env.TWILIO_FROM_NUMBER || '').trim();
    if (!accountSid || !authToken || !from) return null;
    return {
      enabled: true,
      provider: 'twilio',
      twilio_account_sid: accountSid,
      twilio_auth_token: authToken,
      twilio_from: from,
      source: 'env',
    };
  }

  const accessId = String(process.env.ONTECH_ACCESS_ID || '').trim();
  const senderId = String(process.env.ONTECH_SENDER_ID || '').trim();
  if (accessId && senderId) {
    return {
      enabled: true,
      provider: 'ontech',
      access_id: accessId,
      sender_id: senderId,
      base_url: String(process.env.ONTECH_BASE_URL || DEFAULT_SMS.base_url).trim(),
      source: 'env',
    };
  }

  if (provider === 'console') {
    return { ...DEFAULT_SMS, enabled: true, provider: 'console', source: 'env' };
  }

  return null;
}

export function isSmsConfigured(config) {
  if (!config || config.source === 'none') return false;
  if (!config.enabled) return false;
  const provider = String(config.provider || 'console').toLowerCase();
  if (provider === 'console') return true;
  if (provider === 'twilio') {
    return Boolean(config.twilio_account_sid && config.twilio_auth_token && config.twilio_from);
  }
  if (provider === 'ontech') {
    return Boolean(config.access_id && config.sender_id);
  }
  return false;
}

export async function getEffectiveSmsConfig() {
  const stored = await getSetting(SETTING_KEYS.SMS);
  if (stored.enabled) {
    return { ...stored, source: 'database' };
  }
  const envConfig = envSmsConfig();
  if (envConfig) return envConfig;
  return { ...DEFAULT_SMS, source: 'none' };
}

function maskSmsForClient(stored, effective) {
  return {
    enabled: Boolean(stored.enabled),
    provider: stored.provider || DEFAULT_SMS.provider,
    twilio_account_sid: stored.twilio_account_sid || '',
    twilio_from: stored.twilio_from || '',
    twilio_auth_token_set: Boolean(stored.twilio_auth_token),
    base_url: stored.base_url || DEFAULT_SMS.base_url,
    access_id: stored.access_id || '',
    sender_id: stored.sender_id || '',
    configured: isSmsConfigured(effective),
    source: effective.source,
  };
}

async function findUserById(userId) {
  const [[row]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  return row || null;
}

export async function getAdminSettingsContext(claims) {
  const userId = claims?.sub;
  if (!userId) {
    const err = new Error('Authentication required.');
    err.status = 401;
    throw err;
  }

  const userRow = await findUserById(userId);
  if (!userRow) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  const [notifications, security, general, smtpStored, dojahStored, smsStored] = await Promise.all([
    getSetting(SETTING_KEYS.NOTIFICATIONS),
    getSetting(SETTING_KEYS.SECURITY),
    getSetting(SETTING_KEYS.GENERAL),
    getSetting(SETTING_KEYS.SMTP),
    getSetting(SETTING_KEYS.DOJAH),
    getSetting(SETTING_KEYS.SMS),
  ]);

  const [effectiveSmtp, effectiveDojah, effectiveSms] = await Promise.all([
    getEffectiveSmtpConfig(),
    getEffectiveDojahConfig(),
    getEffectiveSmsConfig(),
  ]);

  const [[deliveryStats]] = await pool.query(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered
     FROM notification_deliveries
     WHERE channel IN ('email', 'sms')`,
  );

  return {
    user: mapUserRow(userRow),
    notifications,
    security,
    general,
    smtp: maskSmtpForClient(smtpStored, effectiveSmtp),
    dojah: maskDojahForClient(dojahStored, effectiveDojah),
    sms: maskSmsForClient(smsStored, effectiveSms),
    stats: {
      email_pending: Number(deliveryStats?.pending || 0),
      email_sent: Number(deliveryStats?.delivered || 0),
    },
    environment: {
      app_url: String(process.env.APP_URL || process.env.VITE_APP_URL || '').trim(),
      cors_origins: String(process.env.CORS_ORIGINS || '').trim(),
      db_name: String(process.env.DB_NAME || (process.env.DATABASE_URL ? 'configured' : '')).trim(),
      node_env: String(process.env.NODE_ENV || 'development').trim(),
    },
  };
}

export async function updateAdminAccount(claims, payload = {}) {
  const userId = claims?.sub;
  const existing = await findUserById(userId);
  if (!existing) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) throw new Error('Name cannot be empty.');
    await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, userId]);
  }

  if (payload.phone !== undefined) {
    await pool.query('UPDATE users SET phone = ? WHERE id = ?', [String(payload.phone || '').trim(), userId]);
  }

  const updated = await findUserById(userId);
  return mapUserRow(updated);
}

export async function updateNotificationSettings(claims, payload = {}) {
  const current = await getSetting(SETTING_KEYS.NOTIFICATIONS);
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_NOTIFICATIONS)) {
    if (payload[key] !== undefined) next[key] = Boolean(payload[key]);
  }
  await setSetting(SETTING_KEYS.NOTIFICATIONS, next, claims?.sub);
  return next;
}

export async function updateSecuritySettings(claims, payload = {}) {
  const current = await getSetting(SETTING_KEYS.SECURITY);
  const next = { ...current };

  if (payload.min_password_length !== undefined) {
    const min = Number(payload.min_password_length);
    if (!Number.isFinite(min) || min < 6 || min > 128) {
      throw new Error('Minimum password length must be between 6 and 128.');
    }
    next.min_password_length = min;
  }

  if (payload.require_email_verification !== undefined) {
    next.require_email_verification = Boolean(payload.require_email_verification);
  }

  if (payload.session_timeout_minutes !== undefined) {
    const timeout = Number(payload.session_timeout_minutes);
    if (!Number.isFinite(timeout) || timeout < 15 || timeout > 10080) {
      throw new Error('Session timeout must be between 15 and 10080 minutes.');
    }
    next.session_timeout_minutes = timeout;
  }

  for (const key of [
    'mfa_enabled',
    'mfa_allow_sms',
    'mfa_allow_email',
    'mfa_allow_totp',
    'mfa_require_all_users',
    'mfa_require_admin_users',
  ]) {
    if (payload[key] !== undefined) next[key] = Boolean(payload[key]);
  }

  await setSetting(SETTING_KEYS.SECURITY, next, claims?.sub);
  return next;
}

export async function updateGeneralSettings(claims, payload = {}) {
  const current = await getSetting(SETTING_KEYS.GENERAL);
  const next = { ...current };

  if (payload.app_name !== undefined) {
    const appName = String(payload.app_name).trim();
    if (!appName) throw new Error('Application name cannot be empty.');
    next.app_name = appName;
  }

  if (payload.support_email !== undefined) {
    next.support_email = String(payload.support_email || '').trim();
  }

  if (payload.support_phone !== undefined) {
    next.support_phone = String(payload.support_phone || '').trim();
  }

  await setSetting(SETTING_KEYS.GENERAL, next, claims?.sub);
  return next;
}

export async function updateSmsSettings(claims, payload = {}) {
  const current = await getSetting(SETTING_KEYS.SMS);
  const next = { ...current };

  if (payload.enabled !== undefined) next.enabled = Boolean(payload.enabled);
  if (payload.provider !== undefined) {
    const provider = String(payload.provider || 'console').toLowerCase();
    if (!['console', 'twilio', 'ontech'].includes(provider)) {
      throw new Error('SMS provider must be console, twilio, or ontech.');
    }
    next.provider = provider;
  }
  if (payload.twilio_account_sid !== undefined) next.twilio_account_sid = String(payload.twilio_account_sid || '').trim();
  if (payload.twilio_from !== undefined) next.twilio_from = String(payload.twilio_from || '').trim();
  if (payload.twilio_auth_token !== undefined && String(payload.twilio_auth_token).trim() !== '') {
    next.twilio_auth_token = String(payload.twilio_auth_token);
  }
  if (payload.access_id !== undefined) next.access_id = String(payload.access_id || '').trim();
  if (payload.sender_id !== undefined) next.sender_id = String(payload.sender_id || '').trim();
  if (payload.base_url !== undefined) {
    const baseUrl = String(payload.base_url || DEFAULT_SMS.base_url).trim().replace(/\/$/, '');
    if (baseUrl && !/^https?:\/\/.+/i.test(baseUrl)) {
      throw new Error('SMS API base URL must start with http:// or https://.');
    }
    next.base_url = baseUrl;
  }

  if (next.enabled) {
    const provider = String(next.provider || 'console').toLowerCase();
    if (provider === 'twilio' && (!next.twilio_account_sid || !next.twilio_from || !next.twilio_auth_token)) {
      throw new Error('Twilio Account SID, Auth Token, and From number are required when SMS is enabled.');
    }
    if (provider === 'ontech' && (!next.access_id || !next.sender_id)) {
      throw new Error('Ontech Access ID and Sender ID are required when SMS is enabled.');
    }
  }

  await setSetting(SETTING_KEYS.SMS, next, claims?.sub);
  const effective = await getEffectiveSmsConfig();
  return maskSmsForClient(next, effective);
}

export async function updateDojahSettings(claims, payload = {}) {
  const current = await getSetting(SETTING_KEYS.DOJAH);
  const next = { ...current };

  if (payload.enabled !== undefined) next.enabled = Boolean(payload.enabled);
  if (payload.app_id !== undefined) next.app_id = String(payload.app_id || '').trim();
  if (payload.public_key !== undefined) next.public_key = String(payload.public_key || '').trim();
  if (payload.use_sandbox !== undefined) next.use_sandbox = Boolean(payload.use_sandbox);
  if (payload.private_key !== undefined && String(payload.private_key).trim() !== '') {
    next.private_key = String(payload.private_key);
  }

  if (next.enabled && (!next.app_id || !next.private_key)) {
    throw new Error('Dojah App ID and private key are required when integration is enabled.');
  }

  await setSetting(SETTING_KEYS.DOJAH, next, claims?.sub);
  const effective = await getEffectiveDojahConfig();
  return maskDojahForClient(next, effective);
}

export async function updateSmtpSettings(claims, payload = {}) {
  const current = await getSetting(SETTING_KEYS.SMTP);
  const next = { ...current };

  if (payload.enabled !== undefined) next.enabled = Boolean(payload.enabled);
  if (payload.host !== undefined) next.host = String(payload.host || '').trim();
  if (payload.port !== undefined) next.port = Number(payload.port || 587);
  if (payload.secure !== undefined) next.secure = Boolean(payload.secure);
  if (payload.user !== undefined) next.user = String(payload.user || '').trim();
  if (payload.from !== undefined) next.from = String(payload.from || '').trim();
  if (payload.from_name !== undefined) next.from_name = String(payload.from_name || '').trim();
  if (payload.pass !== undefined && String(payload.pass).trim() !== '') {
    next.pass = String(payload.pass);
  }

  if (next.enabled && !next.host) {
    throw new Error('SMTP host is required when SMTP is enabled.');
  }

  if (next.enabled && next.user && !next.pass && !current.pass && !resolveSmtpPass()) {
    throw new Error('SMTP password is required when a username is set.');
  }

  await setSetting(SETTING_KEYS.SMTP, next, claims?.sub);
  const effective = await getEffectiveSmtpConfig();
  return maskSmtpForClient(next, effective);
}

export async function seedSystemSettings() {
  for (const [key, defaults] of Object.entries(DEFAULTS)) {
    const [[existing]] = await pool.query(
      'SELECT setting_key FROM system_settings WHERE setting_key = ? LIMIT 1',
      [key],
    );
    if (existing) continue;
    await pool.query(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
      [key, JSON.stringify(defaults)],
    );
  }
}

export async function getNotificationSettings() {
  return getSetting(SETTING_KEYS.NOTIFICATIONS);
}

export async function getSecuritySettings() {
  return getSetting(SETTING_KEYS.SECURITY);
}

export async function getGeneralSettings() {
  return getSetting(SETTING_KEYS.GENERAL);
}
