import { generateId } from './visitorSchema.js';
import { writeVisitEvent } from './auditService.js';
import { sendEmail } from './adapters/emailAdapter.js';
import { sendSms } from './adapters/smsAdapter.js';
import { getAppBaseUrl, getDeliveryConfig } from './adapters/deliveryConfig.js';
import { getNotificationSettings } from './services/adminSettingsService.js';
import { categoryKeyForEvent } from '../shared/notificationCategories.js';

const GATE_RECEPTION_ROLE_SLUGS = [
  'gate_security',
  'main_reception',
  'executive_reception',
  'receptionist',
];

const GATE_ROLE_SLUGS = ['gate_security'];
const RECEPTION_ROLE_SLUGS = [
  'main_reception',
  'executive_reception',
  'receptionist',
];

function formatExpectedAt(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderTemplate(template = '', vars = {}) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function findExistingNotification(pool, idempotencyKey) {
  if (!idempotencyKey) return null;
  const [[existing]] = await pool.query(
    'SELECT id FROM notifications WHERE idempotency_key = ? LIMIT 1',
    [idempotencyKey],
  );
  return existing || null;
}

async function attemptDelivery(pool, deliveryId, channel, { to, subject, body }) {
  const config = getDeliveryConfig();

  try {
    let result;
    if (channel === 'email') {
      result = await sendEmail({ to, subject, body });
    } else if (channel === 'sms') {
      result = await sendSms({ to, body });
    } else {
      throw new Error(`Unsupported external channel: ${channel}`);
    }

    await pool.query(
      `UPDATE notification_deliveries
       SET status = 'delivered', delivered_at = NOW(), error_message = NULL, provider_message_id = ?
       WHERE id = ?`,
      [result.messageId || null, deliveryId],
    );
    return { ok: true, ...result };
  } catch (error) {
    await pool.query(
      `UPDATE notification_deliveries
       SET status = 'failed', error_message = ?, attempt_count = attempt_count + 1, attempted_at = NOW()
       WHERE id = ?`,
      [error.message, deliveryId],
    );
    return { ok: false, error: error.message };
  }
}

/**
 * Send notification with idempotency — duplicate keys are silently skipped.
 */
export async function sendNotification(pool, {
  organisationId,
  userId = null,
  notificationType,
  title,
  body = '',
  channel = 'in_app',
  idempotencyKey = null,
  metadata = null,
  recipient = null,
}) {
  if (idempotencyKey) {
    const existing = await findExistingNotification(pool, idempotencyKey);
    if (existing) return { ok: true, skipped: true, id: existing.id };
  }

  const id = generateId('ntf');
  const notificationStatus = channel === 'in_app' ? 'delivered' : 'pending';

  await pool.query(
    `INSERT INTO notifications
     (id, organisation_id, user_id, channel, notification_type, title, body, status, metadata, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      organisationId,
      userId,
      channel,
      notificationType,
      title,
      body,
      notificationStatus,
      metadata ? JSON.stringify(metadata) : null,
      idempotencyKey,
    ],
  );

  const deliveryId = generateId('ndlv');
  const deliveryStatus = channel === 'in_app' ? 'delivered' : 'pending';

  await pool.query(
    `INSERT INTO notification_deliveries
     (id, notification_id, channel, status, recipient, attempt_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [deliveryId, id, channel, deliveryStatus, recipient, channel === 'in_app' ? 1 : 0],
  );

  if (channel === 'in_app') {
    return { ok: true, id, skipped: false, channel };
  }

  if (!recipient) {
    await pool.query(
      `UPDATE notification_deliveries SET status = 'failed', error_message = ?, attempt_count = 1 WHERE id = ?`,
      ['Missing recipient address', deliveryId],
    );
    await pool.query(`UPDATE notifications SET status = 'failed' WHERE id = ?`, [id]);
    return { ok: false, id, error: 'Missing recipient address' };
  }

  const delivery = await attemptDelivery(pool, deliveryId, channel, {
    to: recipient,
    subject: title,
    body,
  });

  await pool.query(
    `UPDATE notifications SET status = ? WHERE id = ?`,
    [delivery.ok ? 'delivered' : 'failed', id],
  );

  return { ok: delivery.ok, id, skipped: false, channel, ...delivery };
}

/**
 * Resolve whether a channel may send for org defaults + optional user mutes.
 * Resolution: org category off → skip; user mute (category or *) → skip; else allow.
 */
export async function resolveChannelAllowed(pool, {
  organisationId,
  userId = null,
  channel,
  categoryKey,
  orgSettings = null,
}) {
  const settings = orgSettings || await getNotificationSettings();

  if (channel === 'in_app' && settings.in_app_notifications === false) {
    return { allowed: false, reason: 'org_in_app_disabled' };
  }

  if (categoryKey && (channel === 'email' || channel === 'sms')) {
    const flag = settings[`${channel}_${categoryKey}`];
    if (flag === false) {
      return { allowed: false, reason: `org_${channel}_disabled` };
    }
  }

  if (!userId) {
    return { allowed: true };
  }

  const [prefs] = await pool.query(
    `SELECT channel, category_key, enabled
     FROM user_notification_preferences
     WHERE user_id = ? AND organisation_id = ?
       AND channel = ?
       AND category_key IN (?, '*')`,
    [userId, organisationId, channel, categoryKey || '*'],
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

export async function sendFromTemplate(pool, {
  organisationId,
  userId = null,
  recipient = null,
  templateKey,
  vars = {},
  idempotencyKey,
  metadata = null,
  channels = null,
  categoryKey = null,
  orgSettings = null,
  skipPreferenceCheck = false,
}) {
  let sql = `SELECT * FROM notification_templates
             WHERE organisation_id = ? AND template_key = ? AND enabled = 1`;
  const params = [organisationId, templateKey];
  if (channels?.length) {
    sql += ` AND channel IN (${channels.map(() => '?').join(',')})`;
    params.push(...channels);
  }

  const [templates] = await pool.query(sql, params);
  if (!templates.length) {
    return [{ ok: false, error: `No templates for ${templateKey}` }];
  }

  const results = [];
  for (const tpl of templates) {
    if (!skipPreferenceCheck && categoryKey) {
      const gate = await resolveChannelAllowed(pool, {
        organisationId,
        userId,
        channel: tpl.channel,
        categoryKey,
        orgSettings,
      });
      if (!gate.allowed) {
        results.push({ ok: true, skipped: true, channel: tpl.channel, reason: gate.reason });
        continue;
      }
    }

    const title = tpl.subject || templateKey;
    const body = renderTemplate(tpl.body_template, vars);
    const channelKey = idempotencyKey ? `${idempotencyKey}:${tpl.channel}` : null;

    let channelRecipient = null;
    if (tpl.channel === 'email') {
      channelRecipient = recipient?.email || null;
      if (!channelRecipient && userId) {
        const [[user]] = await pool.query('SELECT email FROM users WHERE id = ? LIMIT 1', [userId]);
        channelRecipient = user?.email || null;
      }
      if (!channelRecipient) {
        results.push({ ok: false, skipped: true, channel: tpl.channel, reason: 'no_email' });
        continue;
      }
    } else if (tpl.channel === 'sms') {
      channelRecipient = recipient?.phone || null;
      if (!channelRecipient && userId) {
        const [[user]] = await pool.query('SELECT phone FROM users WHERE id = ? LIMIT 1', [userId]);
        channelRecipient = user?.phone || null;
      }
      if (!channelRecipient) {
        results.push({ ok: false, skipped: true, channel: tpl.channel, reason: 'no_phone' });
        continue;
      }
    } else if (tpl.channel === 'in_app' && !userId) {
      results.push({ ok: false, skipped: true, channel: tpl.channel, reason: 'no_user' });
      continue;
    }

    results.push(await sendNotification(pool, {
      organisationId,
      userId: tpl.channel === 'in_app' ? userId : null,
      notificationType: templateKey,
      title,
      body,
      channel: tpl.channel,
      idempotencyKey: channelKey,
      metadata,
      recipient: channelRecipient,
    }));
  }

  return results;
}

/**
 * Preference-aware send for a single audience member.
 */
export async function notifyAudience(pool, {
  organisationId,
  userId = null,
  recipient = null,
  templateKey,
  categoryKey,
  channels = null,
  vars = {},
  idempotencyKey,
  metadata = null,
  orgSettings = null,
}) {
  return sendFromTemplate(pool, {
    organisationId,
    userId,
    recipient,
    templateKey,
    categoryKey,
    channels,
    vars,
    idempotencyKey,
    metadata,
    orgSettings,
  });
}

async function resolveHostUserId(pool, hostId) {
  if (!hostId) return null;
  const [[host]] = await pool.query('SELECT user_id FROM hosts WHERE id = ? LIMIT 1', [hostId]);
  return host?.user_id || null;
}

async function resolveStaffUsers(pool, { organisationId, siteId = null, roleSlugs = GATE_RECEPTION_ROLE_SLUGS }) {
  const rolePlaceholders = roleSlugs.map(() => '?').join(', ');
  const params = [...roleSlugs, organisationId];
  let siteClause = '';
  if (siteId) {
    siteClause = ' AND (us.site_id IS NULL OR us.site_id = ?)';
    params.push(siteId);
  }

  const [rows] = await pool.query(
    `SELECT DISTINCT u.id, u.email, u.phone, u.name
     FROM users u
     INNER JOIN user_admin_roles uar ON uar.user_id = u.id
     INNER JOIN admin_roles ar ON ar.id = uar.role_id
     INNER JOIN user_scopes us ON us.user_id = u.id
     WHERE ar.slug IN (${rolePlaceholders})
       AND us.organisation_id = ?
       ${siteClause}`,
    params,
  );
  return rows;
}

async function resolveGateAndReceptionUsers(pool, { organisationId, siteId = null }) {
  return resolveStaffUsers(pool, {
    organisationId,
    siteId,
    roleSlugs: GATE_RECEPTION_ROLE_SLUGS,
  });
}

function isVipClassification(classification) {
  return classification === 'vip' || classification === 'vvip';
}

/**
 * Notify hosts, visitors, and staff for a visit lifecycle event.
 */
export async function notifyVisitEvent(pool, {
  visitId,
  eventType,
  actorUserId = null,
  extra = {},
}) {
  const [[visit]] = await pool.query(
    `SELECT vis.*, v.full_name AS visitor_name, v.phone AS visitor_phone, v.email AS visitor_email,
            h.name AS host_name, h.user_id AS host_user_id,
            s.name AS site_name,
            COALESCE(vc.classification, 'standard') AS classification
     FROM visits vis
     INNER JOIN visitors v ON v.id = vis.visitor_id
     LEFT JOIN hosts h ON h.id = vis.host_id
     LEFT JOIN sites s ON s.id = vis.site_id
     LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
     WHERE vis.id = ?`,
    [visitId],
  );
  if (!visit) return;

  const categoryKey = categoryKeyForEvent(eventType);
  if (!categoryKey) return;

  const orgSettings = await getNotificationSettings();
  const inviteUrl = visit.invite_token
    ? `${getAppBaseUrl()}/visit/invite/${visit.invite_token}`
    : '';

  const vars = {
    visitor_name: visit.visitor_name,
    host_name: visit.host_name || 'Host',
    pass_code: visit.pass_code,
    invite_url: inviteUrl,
    status: visit.status,
    expected_at: formatExpectedAt(extra.expected_at || visit.expected_at),
    site_name: visit.site_name || '',
    ...extra,
  };

  const hostUserId = visit.host_user_id || await resolveHostUserId(pool, visit.host_id);
  const vip = isVipClassification(visit.classification);
  const metadata = { visitId, eventType };
  const visitorRecipient = {
    email: visit.visitor_email || null,
    phone: visit.visitor_phone || null,
  };

  const hostTargets = new Set();
  if (hostUserId) hostTargets.add(hostUserId);
  if (eventType === 'pending_approval' && visit.created_by) hostTargets.add(visit.created_by);

  const hostTemplateMap = {
    pending_approval: 'visit.pending_approval',
    approved: 'visit.host_approved',
    rejected: 'visit.host_rejected',
    checked_in: 'visit.checked_in',
    reception_check_in: 'visit.checked_in',
    waiting: 'visit.waiting_at_reception',
    in_meeting: 'visit.in_meeting',
    checked_out: 'visit.checked_out',
    left_premises: 'visit.checked_out',
    pre_registered: 'visit.invite_sent',
    arrived_at_gate: 'visit.arrived_at_gate',
    entered_premises: 'visit.entered_premises',
    cancelled: 'visit.cancelled',
    rescheduled: 'visit.rescheduled',
    host_booking: null,
  };

  const visitorTemplateMap = {
    pre_registered: 'visit.invite_sent',
    host_booking: 'visit.host_booking',
    approved: 'visit.approved',
    rejected: 'visit.rejected',
    cancelled: 'visit.visitor_cancelled',
    rescheduled: 'visit.visitor_rescheduled',
    checked_in: 'visit.visitor_checked_in',
    reception_check_in: 'visit.visitor_checked_in',
    checked_out: 'visit.visitor_checked_out',
    left_premises: 'visit.visitor_checked_out',
  };

  const hostChannelsByEvent = {
    pending_approval: ['in_app', 'email', 'sms'],
    approved: ['in_app'],
    rejected: ['in_app'],
    cancelled: ['in_app', 'email'],
    rescheduled: ['in_app', 'email'],
    arrived_at_gate: ['in_app', 'email', 'sms'],
    entered_premises: ['in_app'],
    checked_in: ['in_app', 'email', 'sms'],
    reception_check_in: ['in_app', 'email', 'sms'],
    waiting: ['in_app', 'email', 'sms'],
    in_meeting: ['in_app', 'email', 'sms'],
    checked_out: ['in_app'],
    left_premises: ['in_app'],
    pre_registered: ['in_app'],
  };

  // Host notifications
  let hostTemplateKey = hostTemplateMap[eventType];
  if (vip && (eventType === 'arrived_at_gate' || eventType === 'reception_check_in' || eventType === 'checked_in')) {
    hostTemplateKey = 'visit.vip_arrival';
  }

  if (hostTemplateKey) {
    const channels = hostChannelsByEvent[eventType] || ['in_app'];
    for (const userId of hostTargets) {
      if (userId === actorUserId && !['checked_in', 'reception_check_in', 'arrived_at_gate', 'waiting', 'in_meeting'].includes(eventType)) {
        continue;
      }
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId,
        templateKey: hostTemplateKey,
        categoryKey,
        channels,
        vars,
        idempotencyKey: `${eventType}:${visitId}:host:${userId}`,
        metadata: { ...metadata, audience: 'host' },
        orgSettings,
      });
    }
  }

  // Visitor notifications (external — org toggles only)
  const visitorTemplateKey = visitorTemplateMap[eventType];
  if (visitorTemplateKey && (visitorRecipient.email || visitorRecipient.phone)) {
    await notifyAudience(pool, {
      organisationId: visit.organisation_id,
      recipient: visitorRecipient,
      templateKey: visitorTemplateKey,
      categoryKey,
      channels: ['email', 'sms'],
      vars,
      idempotencyKey: `${eventType}:${visitId}:visitor`,
      metadata: { ...metadata, audience: 'visitor' },
      orgSettings,
    });
  }

  // Gate / reception staff
  if (eventType === 'arrived_at_gate' || (vip && (eventType === 'reception_check_in' || eventType === 'checked_in'))) {
    const staff = await resolveGateAndReceptionUsers(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
    });
    const staffTemplate = vip ? 'visit.vip_arrival' : 'visit.arrived_at_gate';
    const staffChannels = vip ? ['in_app', 'email', 'sms'] : ['in_app'];

    for (const user of staff) {
      if (user.id === actorUserId) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: user.id,
        recipient: { email: user.email || null, phone: user.phone || null },
        templateKey: staffTemplate,
        categoryKey,
        channels: staffChannels,
        vars,
        idempotencyKey: `${eventType}:${visitId}:staff:${user.id}`,
        metadata: { ...metadata, audience: 'gate_reception' },
        orgSettings,
      });
    }
  }

  if (eventType === 'entered_premises') {
    const reception = await resolveStaffUsers(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
      roleSlugs: RECEPTION_ROLE_SLUGS,
    });
    for (const user of reception) {
      if (user.id === actorUserId) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: user.id,
        templateKey: 'visit.entered_premises',
        categoryKey,
        channels: ['in_app'],
        vars,
        idempotencyKey: `${eventType}:${visitId}:reception:${user.id}`,
        metadata: { ...metadata, audience: 'reception' },
        orgSettings,
      });
    }
  }
}

/**
 * Notify gate + reception staff about visits arriving within the lead window
 * (default 1 hour). Idempotent per visit via visit_events.pre_arrival_reminder.
 */
export async function notifyPreArrivalReminders(pool, { limit = 50 } = {}) {
  const leadMinutes = Math.max(
    5,
    Number(process.env.PRE_ARRIVAL_LEAD_MINUTES || 60) || 60,
  );

  const [visits] = await pool.query(
    `SELECT vis.id, vis.organisation_id, vis.site_id, vis.pass_code, vis.invite_token,
            vis.host_id, h.user_id AS host_user_id,
            v.full_name AS visitor_name, v.email AS visitor_email, v.phone AS visitor_phone,
            h.name AS host_name,
            s.name AS site_name,
            COALESCE(vis.expected_at, a.scheduled_at) AS arrival_at
     FROM visits vis
     INNER JOIN visitors v ON v.id = vis.visitor_id
     LEFT JOIN hosts h ON h.id = vis.host_id
     LEFT JOIN appointments a ON a.visit_id = vis.id
     LEFT JOIN sites s ON s.id = vis.site_id
     WHERE vis.status IN ('expected', 'approved')
       AND COALESCE(vis.expected_at, a.scheduled_at) IS NOT NULL
       AND COALESCE(vis.expected_at, a.scheduled_at) > NOW()
       AND COALESCE(vis.expected_at, a.scheduled_at) <= DATE_ADD(NOW(), INTERVAL ? MINUTE)
       AND NOT EXISTS (
         SELECT 1 FROM visit_events ve
         WHERE ve.visit_id = vis.id AND ve.event_type = 'pre_arrival_reminder'
       )
     ORDER BY COALESCE(vis.expected_at, a.scheduled_at) ASC
     LIMIT ?`,
    [leadMinutes, limit],
  );

  const orgSettings = await getNotificationSettings();
  const categoryKey = 'visit_reminder';
  let notified = 0;

  for (const visit of visits) {
    const staff = await resolveGateAndReceptionUsers(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
    });

    const inviteUrl = visit.invite_token
      ? `${getAppBaseUrl()}/visit/invite/${visit.invite_token}`
      : '';

    const vars = {
      visitor_name: visit.visitor_name,
      host_name: visit.host_name || 'Host',
      pass_code: visit.pass_code,
      expected_at: formatExpectedAt(visit.arrival_at),
      site_name: visit.site_name || '',
      invite_url: inviteUrl,
    };

    for (const user of staff) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: user.id,
        recipient: {
          email: user.email || null,
          phone: user.phone || null,
        },
        templateKey: 'visit.pre_arrival_alert',
        categoryKey,
        channels: ['in_app', 'email', 'sms'],
        vars,
        idempotencyKey: `pre_arrival_reminder:${visit.id}:staff:${user.id}`,
        metadata: {
          visitId: visit.id,
          eventType: 'pre_arrival_reminder',
          audience: 'gate_reception',
        },
        orgSettings,
      });
    }

    const hostUserId = visit.host_user_id || await resolveHostUserId(pool, visit.host_id);
    if (hostUserId) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: hostUserId,
        templateKey: 'visit.pre_arrival_alert',
        categoryKey,
        channels: ['in_app'],
        vars,
        idempotencyKey: `pre_arrival_reminder:${visit.id}:host:${hostUserId}`,
        metadata: {
          visitId: visit.id,
          eventType: 'pre_arrival_reminder',
          audience: 'host',
        },
        orgSettings,
      });
    }

    // Optional visitor reminder when org enables visit_reminder email/SMS
    if (visit.visitor_email || visit.visitor_phone) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        recipient: {
          email: visit.visitor_email || null,
          phone: visit.visitor_phone || null,
        },
        templateKey: 'visit.visitor_reminder',
        categoryKey,
        channels: ['email', 'sms'],
        vars,
        idempotencyKey: `pre_arrival_reminder:${visit.id}:visitor`,
        metadata: {
          visitId: visit.id,
          eventType: 'pre_arrival_reminder',
          audience: 'visitor',
        },
        orgSettings,
      });
    }

    await writeVisitEvent(pool, {
      visitId: visit.id,
      eventType: 'pre_arrival_reminder',
      details: {
        arrivalAt: visit.arrival_at,
        staffNotified: staff.length,
      },
    });
    notified += 1;
  }

  return { scanned: visits.length, notified };
}

export async function retryFailedDeliveries(pool, { limit = 25 } = {}) {
  const config = getDeliveryConfig();
  const [rows] = await pool.query(
    `SELECT nd.id AS delivery_id, nd.channel, nd.recipient, nd.attempt_count,
            n.id AS notification_id, n.title, n.body
     FROM notification_deliveries nd
     INNER JOIN notifications n ON n.id = nd.notification_id
     WHERE nd.status IN ('failed', 'pending')
       AND nd.channel IN ('email', 'sms')
       AND nd.attempt_count < ?
     ORDER BY nd.attempted_at ASC
     LIMIT ?`,
    [config.maxAttempts, limit],
  );

  let retried = 0;
  let delivered = 0;

  for (const row of rows) {
    retried += 1;
    const result = await attemptDelivery(pool, row.delivery_id, row.channel, {
      to: row.recipient,
      subject: row.title,
      body: row.body,
    });
    if (result.ok) {
      delivered += 1;
      await pool.query(`UPDATE notifications SET status = 'delivered' WHERE id = ?`, [row.notification_id]);
    } else if (row.attempt_count + 1 >= config.maxAttempts) {
      await pool.query(`UPDATE notifications SET status = 'failed' WHERE id = ?`, [row.notification_id]);
    }
  }

  return { retried, delivered };
}

export async function listUserNotifications(pool, userId, { limit = 50, unreadOnly = false } = {}) {
  let sql = `SELECT * FROM notifications WHERE user_id = ? AND channel = 'in_app'`;
  const params = [userId];
  if (unreadOnly) sql += ' AND read_at IS NULL';
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function markNotificationRead(pool, notificationId, userId) {
  const [result] = await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL`,
    [notificationId, userId],
  );
  return result.affectedRows > 0;
}

export async function markAllNotificationsRead(pool, userId) {
  await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
}

export async function getDeliveryStats(pool) {
  const [[pending]] = await pool.query(
    `SELECT COUNT(*) AS count FROM notification_deliveries WHERE status = 'pending'`,
  );
  const [[failed]] = await pool.query(
    `SELECT COUNT(*) AS count FROM notification_deliveries WHERE status = 'failed'`,
  );
  const [[delivered]] = await pool.query(
    `SELECT COUNT(*) AS count FROM notification_deliveries WHERE status = 'delivered' AND channel IN ('email', 'sms')`,
  );
  return {
    pending: Number(pending?.count || 0),
    failed: Number(failed?.count || 0),
    deliveredExternal: Number(delivered?.count || 0),
  };
}

export async function getUserNotificationPreferences(pool, userId, organisationId) {
  const [rows] = await pool.query(
    `SELECT channel, category_key, enabled
     FROM user_notification_preferences
     WHERE user_id = ? AND organisation_id = ?`,
    [userId, organisationId],
  );
  return rows.map((row) => ({
    channel: row.channel,
    category_key: row.category_key,
    enabled: Boolean(Number(row.enabled)),
  }));
}

export async function upsertUserNotificationPreferences(pool, {
  userId,
  organisationId,
  preferences = [],
}) {
  const allowedChannels = new Set(['in_app', 'email', 'sms']);
  for (const pref of preferences) {
    const channel = String(pref.channel || '').trim();
    const categoryKey = String(pref.category_key || '').trim();
    if (!allowedChannels.has(channel) || !categoryKey) continue;

    const enabled = pref.enabled === false || pref.enabled === 0 ? 0 : 1;
    const [[existing]] = await pool.query(
      `SELECT id FROM user_notification_preferences
       WHERE user_id = ? AND organisation_id = ? AND channel = ? AND category_key = ?
       LIMIT 1`,
      [userId, organisationId, channel, categoryKey],
    );

    if (existing) {
      await pool.query(
        `UPDATE user_notification_preferences SET enabled = ?, updated_at = NOW() WHERE id = ?`,
        [enabled, existing.id],
      );
    } else {
      await pool.query(
        `INSERT INTO user_notification_preferences
         (id, user_id, organisation_id, channel, category_key, enabled)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [generateId('unp'), userId, organisationId, channel, categoryKey, enabled],
      );
    }
  }

  return getUserNotificationPreferences(pool, userId, organisationId);
}

// Re-export for tests / callers that need role helpers
export { GATE_ROLE_SLUGS, RECEPTION_ROLE_SLUGS };
