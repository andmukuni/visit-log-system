import { generateId } from './visitorSchema.js';
import { writeVisitEvent } from './auditService.js';
import { sendEmail } from './adapters/emailAdapter.js';
import { sendSms } from './adapters/smsAdapter.js';
import { getAppBaseUrl, getDeliveryConfig } from './adapters/deliveryConfig.js';
import { getNotificationSettings, resolveAppName, DEFAULT_NOTIFICATIONS } from './services/adminSettingsService.js';
import { categoryKeyForEvent } from '../shared/notificationCategories.js';
import { APP_NAME } from '../shared/branding.js';
import { resolveReceptionAudienceByZone } from './receptionistService.js';
import { resolveSecurityAudienceForVisit } from './securityGuardService.js';

const RECEPTION_NEW_EXPECTED_EVENTS = new Set([
  'pending_approval',
  'expected',
  'approved',
  'pre_registered',
  'host_booking',
]);

export function isReceptionNewExpectedEvent(eventType) {
  return RECEPTION_NEW_EXPECTED_EVENTS.has(eventType);
}

/** Different-zone reception audiences only ever get {visitor_name, expected_at} (+ app branding). */
function buildRestrictedReceptionVars(vars) {
  return { app_name: vars.app_name, visitor_name: vars.visitor_name, expected_at: vars.expected_at };
}

/**
 * Stored metadata for a different-zone recipient, built as a fresh allowlist.
 *
 * `notifications.metadata` is returned verbatim by GET /api/admin/notifications
 * (SELECT *), so anything placed here is client-visible. Spreading the shared
 * metadata object leaked `eventType`, which discloses the visit's lifecycle
 * status (arrived_at_gate, entered_premises, ...) — not part of the permitted
 * name+time. Only the opaque visit id is retained, because the in-app entry
 * links to a detail view that re-authorises server-side on every request.
 */
function buildRestrictedReceptionMetadata(visitId) {
  return { visitId, audience: 'reception_different_zone' };
}

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

  const renderVars = vars.app_name === undefined
    ? { ...vars, app_name: await resolveAppName() }
    : vars;

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

    const title = renderTemplate(tpl.subject || templateKey, renderVars);
    const body = renderTemplate(tpl.body_template, renderVars);
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

function isVipClassification(classification) {
  return classification === 'vip' || classification === 'vvip';
}

/** Resolve a visit's building — via its zone, else via its office — for security audience matching. */
async function resolveVisitBuildingId(pool, visit) {
  if (visit.zone_id) {
    const [[zone]] = await pool.query('SELECT building_id FROM zones WHERE id = ? LIMIT 1', [visit.zone_id]);
    if (zone?.building_id) return zone.building_id;
  }
  if (visit.office_id) {
    const [[office]] = await pool.query('SELECT building_id FROM offices WHERE id = ? LIMIT 1', [visit.office_id]);
    if (office?.building_id) return office.building_id;
  }
  return null;
}

/** True only when the caller explicitly opted in to visitor SMS/email. */
export function parseAlertVisitorFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

/**
 * Notify hosts, visitors, and staff for a visit lifecycle event.
 */
export async function notifyVisitEvent(pool, {
  visitId,
  eventType,
  actorUserId = null,
  extra = {},
  notifyVisitor = true,
  notifyHost = true,
  orgSettings: orgSettingsOverride = null,
}) {
  const [[visit]] = await pool.query(
    `SELECT vis.*, v.full_name AS visitor_name, v.phone AS visitor_phone, v.email AS visitor_email,
            v.company AS visitor_company,
            h.name AS host_name, h.user_id AS host_user_id,
            h.email AS host_email, h.phone AS host_phone,
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

  const orgSettings = orgSettingsOverride
    || await getNotificationSettings().catch(() => ({ ...DEFAULT_NOTIFICATIONS }));
  const appName = extra.app_name || await resolveAppName().catch(() => APP_NAME);
  const inviteUrl = visit.invite_token
    ? `${getAppBaseUrl()}/visit/invite/${visit.invite_token}`
    : '';

  const vars = {
    app_name: appName,
    visitor_name: visit.visitor_name,
    host_name: visit.host_name || 'Host',
    pass_code: visit.pass_code,
    invite_url: inviteUrl,
    approval_url: extra.approval_url || '',
    approval_context: extra.approval_context || 'requires your approval',
    status: visit.status,
    expected_at: formatExpectedAt(extra.expected_at || visit.expected_at),
    site_name: visit.site_name || '',
    company: visit.visitor_company || '',
    ...extra,
  };
  // Live host zone at creation time was already resolved and stamped onto
  // visits.zone_id (host.js / reception.js, including the role-default
  // fallback) — using the frozen snapshot here is correct: it reflects the
  // zone this visit was booked into, not whatever the host's zone happens
  // to be right now. An empty array (no zone) is the fail-safe case: every
  // receptionist lands in the different-zone/restricted bucket below.
  const hostZoneIds = visit.zone_id ? [String(visit.zone_id)] : [];

  const hostUserId = visit.host_user_id || await resolveHostUserId(pool, visit.host_id);
  const vip = isVipClassification(visit.classification);
  const metadata = { visitId, eventType };
  const visitorRecipient = {
    email: visit.visitor_email || null,
    phone: visit.visitor_phone || null,
  };
  const hostRecipient = {
    email: visit.host_email || null,
    phone: visit.host_phone || null,
  };
  const requestingReceptionistId = visit.approval_requested_by || visit.created_by || null;

  // Hosts are notified when a visitor is queued for their approval, checked
  // in at reception, and on checkout. checked_in/reception_check_in fire from
  // both the gate and reception through the same code path — callers gate
  // notifyHost on whether the actor is actually reception (see notifyVisitor
  // below, which does the same for the guest side).
  const hostTemplateMap = {
    pending_approval: 'visit.pending_approval',
    checked_in: 'visit.checked_in',
    reception_check_in: 'visit.checked_in',
    checked_out: 'visit.checked_out',
    left_premises: 'visit.checked_out',
  };

  // Visitors are only ever notified on check-in and the first checkout.
  // Gate "left premises" after a reception checkout must not SMS/email again.
  const visitorTemplateMap = {
    checked_in: 'visit.visitor_checked_in',
    reception_check_in: 'visit.visitor_checked_in',
    checked_out: 'visit.visitor_checked_out',
  };

  const hostChannelsByEvent = {
    pending_approval: ['in_app', 'email', 'sms'],
    checked_in: ['in_app', 'email', 'sms'],
    reception_check_in: ['in_app', 'email', 'sms'],
    checked_out: ['in_app'],
    left_premises: ['in_app'],
  };

  // Host notifications — never include the receptionist who requested approval.
  const hostTemplateKey = hostTemplateMap[eventType];

  if (hostTemplateKey && notifyHost) {
    const channels = hostChannelsByEvent[eventType] || ['in_app'];
    if (hostUserId && hostUserId !== actorUserId) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: hostUserId,
        recipient: hostRecipient,
        templateKey: hostTemplateKey,
        categoryKey,
        channels,
        vars,
        idempotencyKey: `${eventType}:${visitId}:host:${hostUserId}`,
        metadata: { ...metadata, audience: 'host' },
        orgSettings,
      });
    } else if (
      eventType === 'pending_approval'
      && !hostUserId
      && (hostRecipient.email || hostRecipient.phone)
    ) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        recipient: hostRecipient,
        templateKey: hostTemplateKey,
        categoryKey,
        channels: ['email', 'sms'],
        vars,
        idempotencyKey: `${eventType}:${visitId}:host:contact`,
        metadata: { ...metadata, audience: 'host' },
        orgSettings,
      });
    }
  }

  // Visitor notifications (external — org toggles only). Host/executive
  // bookings can skip this when the user chooses not to alert the visitor.
  const visitorTemplateKey = visitorTemplateMap[eventType];
  if (
    notifyVisitor
    && visitorTemplateKey
    && (visitorRecipient.email || visitorRecipient.phone)
  ) {
    await notifyAudience(pool, {
      organisationId: visit.organisation_id,
      recipient: visitorRecipient,
      templateKey: visitorTemplateKey,
      categoryKey,
      channels: ['email', 'sms'],
      vars,
      idempotencyKey: eventType === 'checked_out'
        ? `checkout:${visitId}:visitor`
        : `${eventType}:${visitId}:visitor`,
      metadata: { ...metadata, audience: 'visitor' },
      orgSettings,
    });
  }

  // Host approve/reject of a reception booking — notify the receptionist who
  // created or queued the visit. Never the visitor.
  if (
    ['approved', 'waiting', 'rejected'].includes(eventType)
    && requestingReceptionistId
    && requestingReceptionistId !== actorUserId
  ) {
    const decisionTemplate = eventType === 'rejected'
      ? 'visit.reception_host_rejected'
      : 'visit.reception_host_approved';
    await notifyAudience(pool, {
      organisationId: visit.organisation_id,
      userId: requestingReceptionistId,
      templateKey: decisionTemplate,
      categoryKey,
      channels: ['in_app', 'email', 'sms'],
      vars,
      idempotencyKey: `${eventType}:${visitId}:reception_requester:${requestingReceptionistId}`,
      metadata: { visitId, eventType, audience: 'reception_requester' },
      orgSettings,
    });
  }

  // Appointment Creation Flow (Logic.md steps 3-6) — notify reception when a
  // host books/expects a visitor, split by zone match. This previously did
  // not exist at all: reception only ever heard about a visit once it
  // reached the gate.
  if (isReceptionNewExpectedEvent(eventType)) {
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
      hostZoneIds,
    });
    for (const r of sameZone) {
      if (r.userId === actorUserId) continue;
      if (
        eventType === 'approved'
        && requestingReceptionistId
        && r.userId === requestingReceptionistId
      ) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        recipient: { email: r.email || null, phone: r.phone || null },
        templateKey: 'visit.reception_new_expected',
        categoryKey,
        channels: ['in_app', 'email', 'sms'],
        vars,
        idempotencyKey: `${eventType}:${visitId}:reception_same:${r.receptionistId}`,
        metadata: { ...metadata, audience: 'reception_same_zone' },
        orgSettings,
      });
    }
    for (const r of differentZone) {
      if (r.userId === actorUserId) continue;
      if (
        eventType === 'approved'
        && requestingReceptionistId
        && r.userId === requestingReceptionistId
      ) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        recipient: { email: r.email || null, phone: r.phone || null },
        templateKey: 'visit.reception_new_expected_restricted',
        categoryKey,
        channels: ['in_app', 'email', 'sms'],
        vars: buildRestrictedReceptionVars(vars),
        idempotencyKey: `${eventType}:${visitId}:reception_diff:${r.receptionistId}`,
        metadata: buildRestrictedReceptionMetadata(visitId),
        orgSettings,
      });
    }
  }

  // Gate / reception staff — split into security (site/building/gate scope)
  // and reception (zone scope, same/different split). VIP-ness itself is
  // withheld from different-zone reception: they never learn a visit is VIP.
  if (eventType === 'arrived_at_gate' || (vip && (eventType === 'reception_check_in' || eventType === 'checked_in'))) {
    const buildingId = await resolveVisitBuildingId(pool, visit);
    const securityStaff = await resolveSecurityAudienceForVisit(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
      stationId: visit.station_id,
      buildingId,
    });
    const staffTemplate = vip ? 'visit.vip_arrival' : 'visit.arrived_at_gate';
    const staffChannels = vip ? ['in_app', 'email', 'sms'] : ['in_app'];

    for (const guard of securityStaff) {
      if (guard.user_id === actorUserId) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: guard.user_id,
        recipient: { email: guard.email || null, phone: guard.phone || null },
        templateKey: staffTemplate,
        categoryKey,
        channels: staffChannels,
        vars,
        idempotencyKey: `${eventType}:${visitId}:security:${guard.id}`,
        metadata: { ...metadata, audience: 'security' },
        orgSettings,
      });
    }

    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
      hostZoneIds,
    });
    for (const r of sameZone) {
      if (r.userId === actorUserId) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        recipient: { email: r.email || null, phone: r.phone || null },
        templateKey: staffTemplate,
        categoryKey,
        channels: staffChannels,
        vars,
        idempotencyKey: `${eventType}:${visitId}:reception_same:${r.receptionistId}`,
        metadata: { ...metadata, audience: 'reception_same_zone' },
        orgSettings,
      });
    }
    for (const r of differentZone) {
      if (r.userId === actorUserId) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        recipient: { email: r.email || null, phone: r.phone || null },
        templateKey: 'visit.arrived_at_gate_restricted',
        categoryKey,
        channels: staffChannels,
        vars: buildRestrictedReceptionVars(vars),
        idempotencyKey: `${eventType}:${visitId}:reception_diff:${r.receptionistId}`,
        metadata: buildRestrictedReceptionMetadata(visitId),
        orgSettings,
      });
    }
  }

  if (eventType === 'entered_premises') {
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
      hostZoneIds,
    });
    for (const r of sameZone) {
      if (r.userId === actorUserId) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        templateKey: 'visit.entered_premises',
        categoryKey,
        channels: ['in_app'],
        vars,
        idempotencyKey: `${eventType}:${visitId}:reception_same:${r.receptionistId}`,
        metadata: { ...metadata, audience: 'reception_same_zone' },
        orgSettings,
      });
    }
    for (const r of differentZone) {
      if (r.userId === actorUserId) continue;
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        templateKey: 'visit.entered_premises_restricted',
        categoryKey,
        channels: ['in_app'],
        vars: buildRestrictedReceptionVars(vars),
        idempotencyKey: `${eventType}:${visitId}:reception_diff:${r.receptionistId}`,
        metadata: buildRestrictedReceptionMetadata(visitId),
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
            vis.host_id, vis.zone_id, vis.office_id, vis.station_id, h.user_id AS host_user_id,
            v.full_name AS visitor_name, v.email AS visitor_email, v.phone AS visitor_phone,
            h.name AS host_name,
            s.name AS site_name,
            COALESCE(vis.expected_at, a.scheduled_at) AS arrival_at
     FROM visits vis
     INNER JOIN visitors v ON v.id = vis.visitor_id
     LEFT JOIN hosts h ON h.id = vis.host_id
     LEFT JOIN appointments a ON a.visit_id = vis.id
     LEFT JOIN sites s ON s.id = vis.site_id
     WHERE vis.status IN ('expected', 'approved', 'pre_registered')
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
  const appName = await resolveAppName();
  const categoryKey = 'visit_reminder';
  let notified = 0;

  for (const visit of visits) {
    const inviteUrl = visit.invite_token
      ? `${getAppBaseUrl()}/visit/invite/${visit.invite_token}`
      : '';

    const vars = {
      app_name: appName,
      visitor_name: visit.visitor_name,
      host_name: visit.host_name || 'Host',
      pass_code: visit.pass_code,
      expected_at: formatExpectedAt(visit.arrival_at),
      site_name: visit.site_name || '',
      invite_url: inviteUrl,
    };
    const hostZoneIds = visit.zone_id ? [String(visit.zone_id)] : [];

    // Security keeps the existing template unchanged — its body already
    // contains only visitor_name/host_name/site_name/expected_at/pass_code,
    // no contact fields, so it's already gate-appropriate.
    const buildingId = await resolveVisitBuildingId(pool, visit);
    const securityStaff = await resolveSecurityAudienceForVisit(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
      stationId: visit.station_id,
      buildingId,
    });
    for (const guard of securityStaff) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: guard.user_id,
        recipient: { email: guard.email || null, phone: guard.phone || null },
        templateKey: 'visit.pre_arrival_alert',
        categoryKey,
        channels: ['in_app', 'email', 'sms'],
        vars,
        idempotencyKey: `pre_arrival_reminder:${visit.id}:security:${guard.id}`,
        metadata: { visitId: visit.id, eventType: 'pre_arrival_reminder', audience: 'security' },
        orgSettings,
      });
    }

    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: visit.organisation_id,
      siteId: visit.site_id,
      hostZoneIds,
    });
    for (const r of sameZone) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        recipient: { email: r.email || null, phone: r.phone || null },
        templateKey: 'visit.pre_arrival_alert',
        categoryKey,
        channels: ['in_app', 'email', 'sms'],
        vars,
        idempotencyKey: `pre_arrival_reminder:${visit.id}:reception_same:${r.receptionistId}`,
        metadata: { visitId: visit.id, eventType: 'pre_arrival_reminder', audience: 'reception_same_zone' },
        orgSettings,
      });
    }
    for (const r of differentZone) {
      await notifyAudience(pool, {
        organisationId: visit.organisation_id,
        userId: r.userId,
        recipient: { email: r.email || null, phone: r.phone || null },
        templateKey: 'visit.pre_arrival_alert_restricted',
        categoryKey,
        channels: ['in_app', 'email', 'sms'],
        vars: buildRestrictedReceptionVars(vars),
        idempotencyKey: `pre_arrival_reminder:${visit.id}:reception_diff:${r.receptionistId}`,
        metadata: buildRestrictedReceptionMetadata(visit.id),
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
        staffNotified: securityStaff.length + sameZone.length + differentZone.length,
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

// Exported for tests — the restricted-payload builder is deliberately a pure,
// directly-testable function (see tests/notificationAudience.test.js).
export { buildRestrictedReceptionVars, buildRestrictedReceptionMetadata };
