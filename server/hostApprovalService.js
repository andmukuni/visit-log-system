import crypto from 'crypto';
import { generateId } from './visitorSchema.js';
import { writeAuditLog, writeVisitEvent } from './auditService.js';
import { canTransition } from './scopeService.js';
import { createAppointmentForVisit } from './accessSchema.js';
import { resolveHostZoneId } from './receptionistService.js';
import { notifyVisitEvent } from './notificationService.js';
import { markHostUnavailableForVisit, refreshHostAvailabilityAfterVisit } from './hostAvailability.js';
import { getAppBaseUrl } from './adapters/deliveryConfig.js';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DECIDED_STATUSES = new Set([
  'approved',
  'expected',
  'waiting',
  'rejected',
  'cancelled',
  'denied',
]);

export function generateHostApprovalToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashHostApprovalToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function httpError(status, message, data = undefined) {
  const error = new Error(message);
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

export async function ensureHostApprovalSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS visit_host_approval_tokens (
      id VARCHAR(90) PRIMARY KEY,
      visit_id VARCHAR(90) NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_vhat_token_hash (token_hash),
      INDEX idx_vhat_visit (visit_id)
    )
  `);

  try {
    const [[exists]] = await db.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visits' AND COLUMN_NAME = 'approval_requested_by'`,
    );
    if (!Number(exists?.count)) {
      await db.query('ALTER TABLE visits ADD COLUMN approval_requested_by VARCHAR(90) NULL');
    }
  } catch {
    try {
      await db.query('ALTER TABLE visits ADD COLUMN approval_requested_by VARCHAR(90) NULL');
    } catch {
      // Column already exists, or visits is not yet created in this database.
    }
  }
}

function toSqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function isReceptionQueueVisit(visit) {
  if (!visit) return false;
  return Boolean(visit.checked_in_at)
    || ['reception_check_in', 'checked_in'].includes(String(visit.status || ''));
}

export function isHostApprovalDecidedStatus(status) {
  return DECIDED_STATUSES.has(String(status || ''));
}

export function visitApprovalKind(visit) {
  return isReceptionQueueVisit(visit) ? 'guest' : 'appointment';
}

export function approvalContextForVisit(visit) {
  return visitApprovalKind(visit) === 'guest'
    ? 'is waiting at reception and needs your approval'
    : 'has been booked to see you and needs your approval';
}

function decisionFromStatus(status) {
  const value = String(status || '');
  if (['approved', 'expected', 'waiting'].includes(value)) return 'approved';
  if (value === 'rejected') return 'rejected';
  if (value === 'cancelled' || value === 'denied') return value;
  return null;
}

export function toPublicHostApprovalPayload(row, { expired = false } = {}) {
  const status = String(row?.status || '');
  const alreadyDecided = isHostApprovalDecidedStatus(status);
  return {
    visitor_name: row?.visitor_name || row?.full_name || '',
    company: row?.company || null,
    purpose: row?.purpose || null,
    expected_at: row?.expected_at || null,
    site_name: row?.site_name || null,
    host_name: row?.host_name || null,
    kind: visitApprovalKind(row),
    status,
    already_decided: alreadyDecided,
    decision: decisionFromStatus(status),
    expired: Boolean(expired) && !alreadyDecided,
    active: status === 'pending_approval' && !expired && !alreadyDecided,
  };
}

export async function invalidateHostApprovalTokens(pool, visitId) {
  if (!visitId) return;
  await pool.query(
    `UPDATE visit_host_approval_tokens
     SET used_at = NOW()
     WHERE visit_id = ? AND used_at IS NULL`,
    [visitId],
  );
}

export async function invalidateOtherHostApprovalTokens(pool, visitId, keepTokenId) {
  if (!visitId || !keepTokenId) return;
  await pool.query(
    `UPDATE visit_host_approval_tokens
     SET used_at = NOW()
     WHERE visit_id = ? AND used_at IS NULL AND id != ?`,
    [visitId, keepTokenId],
  );
}

export async function issueHostApprovalToken(pool, visitId, { invalidateExisting = true } = {}) {
  await ensureHostApprovalSchema(pool);
  if (invalidateExisting) {
    await invalidateHostApprovalTokens(pool, visitId);
  }

  const rawToken = generateHostApprovalToken();
  const tokenHash = hashHostApprovalToken(rawToken);
  const id = generateId('hat');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await pool.query(
    `INSERT INTO visit_host_approval_tokens (id, visit_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [id, visitId, tokenHash, toSqlDateTime(expiresAt)],
  );

  return {
    id,
    token: rawToken,
    expiresAt,
    approvalUrl: `${getAppBaseUrl()}/visit/host-approval/${rawToken}`,
  };
}

export async function hostHasDeliveryContact(pool, hostId) {
  if (!hostId) return false;
  const [[host]] = await pool.query(
    `SELECT h.email AS host_email, h.phone AS host_phone,
            u.email AS user_email, u.phone AS user_phone
     FROM hosts h
     LEFT JOIN users u ON u.id = h.user_id
     WHERE h.id = ?
     LIMIT 1`,
    [hostId],
  );
  return Boolean(
    String(host?.host_email || '').trim()
    || String(host?.host_phone || '').trim()
    || String(host?.user_email || '').trim()
    || String(host?.user_phone || '').trim(),
  );
}

export async function setApprovalRequestedBy(pool, visitId, userId) {
  if (!visitId || !userId) return;
  await ensureHostApprovalSchema(pool);
  await pool.query(
    `UPDATE visits SET approval_requested_by = ?, updated_at = NOW() WHERE id = ?`,
    [userId, visitId],
  );
}

/**
 * Stamp the requesting receptionist, issue a hashed token, and notify the host.
 * Reminders (`resend: true`) keep the previous link live until the new message
 * is actually queued, then rotate — and use a unique idempotency key so the
 * new URL is not silently dropped.
 */
export async function requestHostApproval(pool, {
  visitId,
  requestedByUserId = null,
  resend = false,
  notify = true,
}) {
  await setApprovalRequestedBy(pool, visitId, requestedByUserId);
  const issued = await issueHostApprovalToken(pool, visitId, {
    invalidateExisting: !resend,
  });

  const [[visit]] = await pool.query(
    `SELECT vis.host_id, vis.status, vis.checked_in_at
     FROM visits vis WHERE vis.id = ? LIMIT 1`,
    [visitId],
  );
  if (visit?.status === 'pre_registered') {
    await pool.query(
      `UPDATE visits SET status = 'pending_approval', updated_at = NOW() WHERE id = ?`,
      [visitId],
    );
    visit.status = 'pending_approval';
  }
  const hostContactDeliverable = await hostHasDeliveryContact(pool, visit?.host_id);

  let notified = false;
  try {
    if (notify) {
      await notifyVisitEvent(pool, {
        visitId,
        eventType: 'pending_approval',
        actorUserId: requestedByUserId,
        extra: {
          approval_url: issued.approvalUrl,
          approval_context: approvalContextForVisit(visit),
          request_kind: visitApprovalKind(visit),
        },
        notifyVisitor: false,
        skipReceptionExpected: resend || isReceptionQueueVisit(visit),
        notificationKeySuffix: resend ? `nudge:${crypto.randomBytes(4).toString('hex')}` : null,
      });
    }
    notified = true;
    if (resend) {
      await invalidateOtherHostApprovalTokens(pool, visitId, issued.id);
    }
  } catch (error) {
    console.warn('[host.approval.request] notify failed:', error.message);
    if (resend) {
      await pool.query(
        `UPDATE visit_host_approval_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL`,
        [issued.id],
      );
    }
  }

  return {
    approvalUrl: issued.approvalUrl,
    hostContactDeliverable,
    notified: notify ? notified : false,
  };
}

function tokenIsExpired(expiresAt) {
  if (!expiresAt) return true;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return true;
  return ms <= Date.now();
}

export async function loadHostApprovalByToken(pool, rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;

  await ensureHostApprovalSchema(pool);
  const tokenHash = hashHostApprovalToken(token);
  const [[row]] = await pool.query(
    `SELECT vis.id, vis.status, vis.purpose, vis.expected_at, vis.checked_in_at,
            vis.host_id, vis.organisation_id, vis.visitor_id, vis.site_id,
            vis.created_by, vis.approval_requested_by, vis.pass_code,
            v.full_name AS visitor_name, v.company,
            h.id AS host_row_id, h.name AS host_name, h.user_id AS host_user_id,
            s.name AS site_name,
            t.id AS token_id, t.used_at, t.expires_at, t.visit_id
     FROM visit_host_approval_tokens t
     INNER JOIN visits vis ON vis.id = t.visit_id
     INNER JOIN visitors v ON v.id = vis.visitor_id
     LEFT JOIN hosts h ON h.id = vis.host_id
     LEFT JOIN sites s ON s.id = vis.site_id
     WHERE t.token_hash = ?
     LIMIT 1`,
    [tokenHash],
  );
  if (!row) return null;

  const expired = tokenIsExpired(row.expires_at) || Boolean(row.used_at);
  return {
    visit: row,
    tokenId: row.token_id,
    expired: expired && !isHostApprovalDecidedStatus(row.status),
    payload: toPublicHostApprovalPayload(row, {
      expired: expired && row.status === 'pending_approval',
    }),
  };
}

export async function loadPublicHostApproval(pool, rawToken) {
  const loaded = await loadHostApprovalByToken(pool, rawToken);
  if (!loaded) return null;
  return loaded;
}

async function loadHostRow(pool, hostId) {
  if (!hostId) return null;
  const [[host]] = await pool.query('SELECT * FROM hosts WHERE id = ? LIMIT 1', [hostId]);
  return host || null;
}

export async function applyHostApproval(pool, {
  visit,
  host,
  actorUserId = null,
  reason = null,
  source = 'host_approval',
  notify = true,
}) {
  if (!visit) throw httpError(404, 'Visit not found.');
  const hostRow = host || await loadHostRow(pool, visit.host_id);
  if (!hostRow) throw httpError(400, 'This visit has no host assigned.');

  const isReceptionQueue = isReceptionQueueVisit(visit);
  const nextStatus = isReceptionQueue
    ? 'in_meeting'
    : (visit.expected_at ? 'expected' : 'approved');

  if (!canTransition(visit.status, nextStatus) && !canTransition(visit.status, 'approved')) {
    if (isHostApprovalDecidedStatus(visit.status)) {
      throw httpError(409, 'This visit has already been decided.', {
        already_decided: true,
        decision: decisionFromStatus(visit.status),
        payload: toPublicHostApprovalPayload(visit),
      });
    }
    throw httpError(400, 'Visit is not pending approval.');
  }

  const [[visitorRow]] = await pool.query(
    'SELECT full_name FROM visitors WHERE id = ? LIMIT 1',
    [visit.visitor_id],
  );

  const approveZoneId = await resolveHostZoneId(pool, hostRow.id);
  if (!approveZoneId) {
    await writeAuditLog(pool, {
      organisationId: visit.organisation_id,
      actorUserId,
      action: 'host.zone_missing',
      targetType: 'host',
      targetId: hostRow.id,
      result: 'warning',
      details: { visitId: visit.id, hostId: hostRow.id },
    });
  }

  await pool.query(
    `UPDATE visits
     SET status = ?,
         host_id = COALESCE(?, host_id),
         zone_id = ?,
         approved_at = NOW(),
         updated_at = NOW()
     WHERE id = ?`,
    [nextStatus, hostRow.id, approveZoneId, visit.id],
  );

  await pool.query(
    `INSERT INTO visit_approvals (id, visit_id, approver_user_id, decision, reason)
     VALUES (?, ?, ?, 'approved', ?)`,
    [generateId('appr'), visit.id, actorUserId, reason || null],
  );

  const [[existingAppt]] = await pool.query(
    'SELECT id, scheduled_at FROM appointments WHERE visit_id = ? LIMIT 1',
    [visit.id],
  );
  const scheduledAt = visit.expected_at || new Date();
  const visitorName = visitorRow?.full_name || 'visitor';
  const meetingTitle = visit.purpose || `Meeting with ${visitorName}`;
  if (!existingAppt) {
    await createAppointmentForVisit(pool, {
      organisationId: visit.organisation_id,
      visitId: visit.id,
      hostId: hostRow.id,
      scheduledAt,
      title: meetingTitle,
      createdBy: actorUserId,
    });
  } else {
    await pool.query(
      `UPDATE appointments
       SET host_id = COALESCE(host_id, ?),
           scheduled_at = COALESCE(scheduled_at, ?),
           title = COALESCE(NULLIF(title, ''), ?),
           status = 'scheduled'
       WHERE id = ?`,
      [hostRow.id, scheduledAt, meetingTitle, existingAppt.id],
    );
  }

  const eventType = isReceptionQueue ? 'in_meeting' : 'approved';
  await writeVisitEvent(pool, {
    visitId: visit.id,
    eventType,
    actorUserId,
    reason: reason || null,
    details: {
      approverRole: 'host',
      source,
      nextStatus,
    },
  });

  await writeAuditLog(pool, {
    organisationId: visit.organisation_id,
    actorUserId,
    action: 'host.approve',
    targetType: 'visit',
    targetId: visit.id,
    details: { source },
  });

  await invalidateHostApprovalTokens(pool, visit.id);

  if (isReceptionQueue || nextStatus === 'waiting' || nextStatus === 'in_meeting') {
    await markHostUnavailableForVisit(pool, { ...visit, host_id: hostRow.id, status: nextStatus });
  }

  if (notify) {
    try {
      await notifyVisitEvent(pool, {
        visitId: visit.id,
        eventType,
        actorUserId,
        notifyVisitor: false,
      });
    } catch (error) {
      console.warn('[host.approve] notify failed:', error.message);
    }
  }

  return {
    nextStatus,
    isReceptionQueue,
    eventType,
    message: isReceptionQueue
      ? 'Visitor accepted and marked as with you.'
      : 'Visit approved.',
  };
}

export async function applyHostRejection(pool, {
  visit,
  host,
  actorUserId = null,
  reason,
  source = 'host_approval',
  notify = true,
}) {
  if (!visit) throw httpError(404, 'Visit not found.');
  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) {
    throw httpError(400, 'Rejection reason is required.');
  }

  if (!canTransition(visit.status, 'rejected')) {
    if (isHostApprovalDecidedStatus(visit.status)) {
      throw httpError(409, 'This visit has already been decided.', {
        already_decided: true,
        decision: decisionFromStatus(visit.status),
        payload: toPublicHostApprovalPayload(visit),
      });
    }
    throw httpError(400, 'Visit cannot be rejected in its current status.');
  }

  const hostRow = host || await loadHostRow(pool, visit.host_id);

  await pool.query(
    `UPDATE visits SET status = 'rejected', updated_at = NOW() WHERE id = ?`,
    [visit.id],
  );
  await pool.query(
    `INSERT INTO visit_approvals (id, visit_id, approver_user_id, decision, reason)
     VALUES (?, ?, ?, 'rejected', ?)`,
    [generateId('appr'), visit.id, actorUserId, trimmedReason],
  );
  await writeVisitEvent(pool, {
    visitId: visit.id,
    eventType: 'rejected',
    actorUserId,
    reason: trimmedReason,
    details: { approverRole: 'host', source, hostId: hostRow?.id || visit.host_id },
  });
  await writeAuditLog(pool, {
    organisationId: visit.organisation_id,
    actorUserId,
    action: 'host.reject',
    targetType: 'visit',
    targetId: visit.id,
    details: { source },
  });

  await invalidateHostApprovalTokens(pool, visit.id);
  await refreshHostAvailabilityAfterVisit(pool, visit);

  if (notify) {
    try {
      await notifyVisitEvent(pool, {
        visitId: visit.id,
        eventType: 'rejected',
        actorUserId,
        notifyVisitor: false,
      });
    } catch (error) {
      console.warn('[host.reject] notify failed:', error.message);
    }
  }

  return { nextStatus: 'rejected', eventType: 'rejected', message: 'Visit rejected.' };
}

export async function decidePublicHostApproval(pool, {
  token,
  decision,
  reason = null,
  notify = true,
}) {
  const loaded = await loadHostApprovalByToken(pool, token);
  if (!loaded) throw httpError(404, 'Approval link not found or expired.');

  const { visit, expired, payload } = loaded;
  if (payload.already_decided) {
    throw httpError(409, 'This visit has already been decided.', {
      already_decided: true,
      decision: payload.decision,
      payload,
    });
  }
  const isOnSiteApproval = isReceptionQueueVisit(visit);
  const statusAllowed = isOnSiteApproval
    ? ['waiting', 'pending_approval'].includes(String(visit.status || ''))
    : visit.status === 'pending_approval';
  if (expired || !statusAllowed) {
    throw httpError(410, 'This approval link has expired.');
  }

  const host = await loadHostRow(pool, visit.host_id);
  if (!host) throw httpError(400, 'This visit has no host assigned.');

  const actorUserId = host.user_id || null;
  const source = 'host_approval_token';

  if (decision === 'rejected') {
    const result = await applyHostRejection(pool, {
      visit,
      host,
      actorUserId,
      reason,
      source,
      notify,
    });
    return {
      ...result,
      payload: toPublicHostApprovalPayload({ ...visit, status: 'rejected' }),
    };
  }

  const result = await applyHostApproval(pool, {
    visit,
    host,
    actorUserId,
    reason,
    source,
    notify,
  });
  return {
    ...result,
    payload: toPublicHostApprovalPayload({ ...visit, status: result.nextStatus }),
  };
}
