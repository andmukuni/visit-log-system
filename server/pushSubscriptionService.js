import webpush from 'web-push';
import { generateId } from './visitorSchema.js';
import { resolveNotificationDeepLink } from '../shared/notificationDeepLinks.js';
import { getNotificationSettings } from './services/adminSettingsService.js';
import { getAppBaseUrl } from './adapters/deliveryConfig.js';
import { LOGO_PATH } from '../shared/branding.js';

export function getVapidConfig() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:noreply@visitors.local').trim();
  const configured = Boolean(publicKey && privateKey);
  return { publicKey, privateKey, subject, configured };
}

export function ensureWebPushConfigured() {
  const config = getVapidConfig();
  if (!config.configured) return config;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return config;
}

export async function ensurePushSubscriptionSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id VARCHAR(90) PRIMARY KEY,
      user_id VARCHAR(90) NOT NULL,
      endpoint VARCHAR(768) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(512) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_push_endpoint (endpoint),
      INDEX idx_push_user (user_id)
    )
  `);
}

export async function savePushSubscription(pool, {
  userId,
  endpoint,
  p256dh,
  auth,
  userAgent = null,
}) {
  await ensurePushSubscriptionSchema(pool);
  const trimmedEndpoint = String(endpoint || '').trim();
  const trimmedP256dh = String(p256dh || '').trim();
  const trimmedAuth = String(auth || '').trim();
  if (!userId || !trimmedEndpoint || !trimmedP256dh || !trimmedAuth) {
    throw new Error('Invalid push subscription payload.');
  }

  const [[existing]] = await pool.query(
    'SELECT id FROM push_subscriptions WHERE endpoint = ? LIMIT 1',
    [trimmedEndpoint],
  );

  if (existing?.id) {
    await pool.query(
      `UPDATE push_subscriptions
       SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, updated_at = NOW()
       WHERE id = ?`,
      [userId, trimmedP256dh, trimmedAuth, userAgent, existing.id],
    );
    return { id: existing.id, updated: true };
  }

  const id = generateId('psub');
  await pool.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, trimmedEndpoint, trimmedP256dh, trimmedAuth, userAgent],
  );
  return { id, updated: false };
}

export async function removePushSubscription(pool, { userId, endpoint }) {
  await ensurePushSubscriptionSchema(pool);
  const trimmedEndpoint = String(endpoint || '').trim();
  if (!trimmedEndpoint) return false;
  const [[existing]] = await pool.query(
    'SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ? LIMIT 1',
    [trimmedEndpoint, userId],
  );
  if (!existing?.id) return false;
  await pool.query(
    'DELETE FROM push_subscriptions WHERE id = ?',
    [existing.id],
  );
  return true;
}

export async function listSubscriptionsForUser(pool, userId) {
  await ensurePushSubscriptionSchema(pool);
  const [rows] = await pool.query(
    'SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC',
    [userId],
  );
  return rows;
}

async function pushAllowedForUser(pool, {
  organisationId,
  userId,
  categoryKey,
  orgSettings = null,
}) {
  const settings = orgSettings || await getNotificationSettings();
  if (settings.in_app_notifications === false) {
    return { allowed: false, reason: 'org_in_app_disabled' };
  }
  if (!userId) return { allowed: true };

  const [prefs] = await pool.query(
    `SELECT category_key, enabled FROM user_notification_preferences
     WHERE user_id = ? AND organisation_id = ? AND channel = 'in_app'
       AND category_key IN (?, '*')`,
    [userId, organisationId, categoryKey || '*'],
  );
  for (const pref of prefs) {
    if (Number(pref.enabled) === 0) {
      return {
        allowed: false,
        reason: pref.category_key === '*' ? 'user_channel_muted' : 'user_category_muted',
      };
    }
  }
  return { allowed: true };
}

export async function sendPushToUser(pool, {
  userId,
  organisationId,
  title,
  body,
  metadata = null,
  categoryKey = null,
  orgSettings = null,
}) {
  const config = ensureWebPushConfigured();
  if (!config.configured || !userId) {
    return { ok: false, skipped: true, reason: 'push_not_configured' };
  }

  if (categoryKey) {
    const gate = await pushAllowedForUser(pool, {
      organisationId,
      userId,
      categoryKey,
      orgSettings,
    });
    if (!gate.allowed) {
      return { ok: true, skipped: true, reason: gate.reason };
    }
  }

  const subscriptions = await listSubscriptionsForUser(pool, userId);
  if (!subscriptions.length) {
    return { ok: true, skipped: true, reason: 'no_subscriptions' };
  }

  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const relativeUrl = resolveNotificationDeepLink(meta);
  const baseUrl = getAppBaseUrl();
  const absoluteUrl = relativeUrl.startsWith('http')
    ? relativeUrl
    : `${baseUrl}${relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`}`;

  const payload = JSON.stringify({
    title: title || 'Visitors Log',
    body: body || '',
    url: absoluteUrl,
    notificationId: meta.notificationId || null,
    icon: `${baseUrl}${LOGO_PATH}`,
  });

  const results = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      results.push({ ok: true, endpoint: sub.endpoint });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
      }
      results.push({ ok: false, endpoint: sub.endpoint, error: error.message });
    }
  }

  const delivered = results.filter((row) => row.ok).length;
  return { ok: delivered > 0, delivered, results };
}
