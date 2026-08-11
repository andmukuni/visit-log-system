import { generateId } from './visitorSchema.js';
import { writeVisitEvent } from './auditService.js';
import { sendEmail } from './adapters/emailAdapter.js';
import { sendSms } from './adapters/smsAdapter.js';
import { getAppBaseUrl, getDeliveryConfig } from './adapters/deliveryConfig.js';

const GATE_RECEPTION_ROLE_SLUGS = [
  'gate_security',
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
  const isExternal = channel === 'email' || channel === 'sms';
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

export async function sendFromTemplate(pool, {
  organisationId,
  userId = null,
  recipient = null,
  templateKey,
  vars = {},
  idempotencyKey,
  metadata = null,
  channels = null,
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

async function resolveHostUserId(pool, hostId) {
  if (!hostId) return null;
  const [[host]] = await pool.query('SELECT user_id FROM hosts WHERE id = ? LIMIT 1', [hostId]);
  return host?.user_id || null;
}

const VISITOR_TEMPLATE_EVENTS = new Set([
  'pre_registered',
  'approved',
  'host_booking',
  'rejected',
]);

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

  const inviteUrl = visit.invite_token
    ? `${getAppBaseUrl()}/visit/invite/${visit.invite_token}`
    : '';

  const vars = {
    visitor_name: visit.visitor_name,
    host_name: visit.host_name || 'Host',
    pass_code: visit.pass_code,
    invite_url: inviteUrl,
    status: visit.status,
    expected_at: formatExpectedAt(visit.expected_at),
    site_name: visit.site_name || '',
    ...extra,
  };

  const hostUserId = visit.host_user_id || await resolveHostUserId(pool, visit.host_id);
  const idempotencyKey = `${eventType}:${visitId}:${visit.status}`;

  const templateMap = {
    pending_approval: 'visit.pending_approval',
    approved: 'visit.approved',
    host_booking: 'visit.host_booking',
    rejected: 'visit.rejected',
    checked_in: 'visit.checked_in',
    reception_check_in: 'visit.checked_in',
    waiting: 'visit.waiting_at_reception',
    in_meeting: 'visit.waiting_at_reception',
    checked_out: 'visit.checked_out',
    pre_registered: 'visit.invite_sent',
    arrived_at_gate: 'visit.arrived_at_gate',
    cancelled: 'visit.cancelled',
    rescheduled: 'visit.rescheduled',
    left_premises: 'visit.checked_out',
  };

  let templateKey = templateMap[eventType] || templateMap[visit.status];
  if ((visit.classification === 'vip' || visit.classification === 'vvip')
    && (eventType === 'arrived_at_gate' || eventType === 'reception_check_in' || eventType === 'checked_in')) {
    templateKey = 'visit.vip_arrival';
  }
  if (!templateKey) return;

  const metadata = { visitId, eventType };
  const visitorRecipient = {
    email: visit.visitor_email || null,
    phone: visit.visitor_phone || null,
  };

  const hostTargets = new Set();
  if (hostUserId) hostTargets.add(hostUserId);
  if (eventType === 'pending_approval' && visit.created_by) hostTargets.add(visit.created_by);

  for (const userId of hostTargets) {
    if (userId === actorUserId && eventType !== 'checked_in') continue;
    await sendFromTemplate(pool, {
      organisationId: visit.organisation_id,
      userId,
      templateKey,
      vars,
      idempotencyKey: `${idempotencyKey}:host:${userId}`,
      metadata,
    });
  }

  if (VISITOR_TEMPLATE_EVENTS.has(eventType) && (visitorRecipient.email || visitorRecipient.phone)) {
    await sendFromTemplate(pool, {
      organisationId: visit.organisation_id,
      recipient: visitorRecipient,
      templateKey,
      vars,
      idempotencyKey: `${idempotencyKey}:visitor`,
      metadata: { ...metadata, audience: 'visitor' },
      channels: ['email', 'sms'],
    });
  }
}

async function resolveGateAndReceptionUsers(pool, { organisationId, siteId = null }) {
  const rolePlaceholders = GATE_RECEPTION_ROLE_SLUGS.map(() => '?').join(', ');
  const params = [...GATE_RECEPTION_ROLE_SLUGS, organisationId];
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
    `SELECT vis.id, vis.organisation_id, vis.site_id, vis.pass_code,
            v.full_name AS visitor_name,
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

  let notified = 0;
  for (const visit of visits) {
    const staff = await resolveGateAndReceptionUsers(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
    });

    const vars = {
      visitor_name: visit.visitor_name,
      host_name: visit.host_name || 'Host',
      pass_code: visit.pass_code,
      expected_at: formatExpectedAt(visit.arrival_at),
      site_name: visit.site_name || '',
    };

    for (const user of staff) {
      await sendFromTemplate(pool, {
        organisationId: visit.organisation_id,
        userId: user.id,
        recipient: {
          email: user.email || null,
          phone: user.phone || null,
        },
        templateKey: 'visit.pre_arrival_alert',
        vars,
        idempotencyKey: `pre_arrival_reminder:${visit.id}:staff:${user.id}`,
        metadata: {
          visitId: visit.id,
          eventType: 'pre_arrival_reminder',
          audience: 'gate_reception',
        },
        channels: ['in_app', 'email', 'sms'],
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
