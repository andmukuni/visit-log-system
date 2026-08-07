import pool from './db.js';
import { generateId } from './visitorSchema.js';
import { writeAuditLog } from './auditService.js';

export const ROLL_CALL_ENTRY_STATUSES = [
  'not_yet_accounted_for',
  'accounted_for',
  'left_site',
  'unknown',
];

function siteFilter(scope, elevated, alias = 'vis') {
  if (elevated || !scope?.site_id) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.site_id = ?`, params: [scope.site_id] };
}

export async function listRollCalls(pool, scope, { elevated = false, limit = 20 } = {}) {
  const params = [scope.organisation_id];
  let siteSql = '';
  if (!elevated && scope.site_id) {
    siteSql = ' AND site_id = ?';
    params.push(scope.site_id);
  }
  const [rows] = await pool.query(
    `SELECT rc.*, u.name AS started_by_name
     FROM emergency_roll_calls rc
     LEFT JOIN users u ON u.id = rc.started_by
     WHERE rc.organisation_id = ?${siteSql}
     ORDER BY rc.started_at DESC
     LIMIT ?`,
    [...params, limit],
  );
  return rows;
}

export async function getActiveRollCall(pool, scope, { elevated = false } = {}) {
  const params = [scope.organisation_id];
  let siteSql = '';
  if (!elevated && scope.site_id) {
    siteSql = ' AND site_id = ?';
    params.push(scope.site_id);
  }
  const [[row]] = await pool.query(
    `SELECT * FROM emergency_roll_calls
     WHERE organisation_id = ? AND status = 'active'${siteSql}
     ORDER BY started_at DESC
     LIMIT 1`,
    params,
  );
  return row || null;
}

export async function getRollCallWithEntries(pool, rollCallId) {
  const [[rollCall]] = await pool.query(
    `SELECT rc.*, u.name AS started_by_name, s.name AS site_name
     FROM emergency_roll_calls rc
     LEFT JOIN users u ON u.id = rc.started_by
     LEFT JOIN sites s ON s.id = rc.site_id
     WHERE rc.id = ?`,
    [rollCallId],
  );
  if (!rollCall) return null;

  const [entries] = await pool.query(
    `SELECT rce.*, v.full_name, v.phone, v.company, vis.badge_number, vis.checked_in_at, h.name AS host_name
     FROM roll_call_entries rce
     INNER JOIN visitors v ON v.id = rce.visitor_id
     INNER JOIN visits vis ON vis.id = rce.visit_id
     LEFT JOIN hosts h ON h.id = vis.host_id
     WHERE rce.roll_call_id = ?
     ORDER BY rce.status ASC, v.full_name ASC`,
    [rollCallId],
  );

  const summary = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {});

  return { ...rollCall, entries, summary, total: entries.length };
}

export async function startRollCall(pool, {
  scope,
  elevated,
  userId,
  reason = '',
  siteId = null,
  ipAddress = null,
}) {
  const orgId = scope.organisation_id;
  const targetSiteId = siteId || scope.site_id || null;

  const existing = await getActiveRollCall(pool, scope, { elevated });
  if (existing) {
    return { ok: false, status: 409, message: 'An active roll call already exists for this scope.', rollCallId: existing.id };
  }

  const rollCallId = generateId('rc');
  await pool.query(
    `INSERT INTO emergency_roll_calls (id, organisation_id, site_id, status, reason, started_by)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [rollCallId, orgId, targetSiteId, reason || 'Emergency evacuation', userId],
  );

  const visitParams = [orgId];
  const { sql: siteSql, params: siteParams } = siteFilter(
    targetSiteId ? { site_id: targetSiteId } : scope,
    elevated && !targetSiteId,
  );
  visitParams.push(...siteParams);

  const [checkedIn] = await pool.query(
    `SELECT vis.id AS visit_id, vis.visitor_id
     FROM visits vis
     WHERE vis.organisation_id = ? AND vis.status = 'checked_in'${siteSql}`,
    visitParams,
  );

  for (const row of checkedIn) {
    await pool.query(
      `INSERT INTO roll_call_entries (id, roll_call_id, visit_id, visitor_id, status)
       VALUES (?, ?, ?, ?, 'not_yet_accounted_for')`,
      [generateId('rce'), rollCallId, row.visit_id, row.visitor_id],
    );
  }

  await writeAuditLog(pool, {
    organisationId: orgId,
    actorUserId: userId,
    action: 'roll_call.started',
    targetType: 'emergency_roll_call',
    targetId: rollCallId,
    details: { siteId: targetSiteId, visitorCount: checkedIn.length, reason },
    ipAddress,
  });

  return { ok: true, rollCallId, visitorCount: checkedIn.length };
}

export async function markRollCallEntry(pool, {
  rollCallId,
  entryId,
  status,
  userId,
  notes = '',
  ipAddress = null,
}) {
  if (!ROLL_CALL_ENTRY_STATUSES.includes(status)) {
    return { ok: false, status: 400, message: 'Invalid roll call status.' };
  }

  const [[rollCall]] = await pool.query(
    'SELECT * FROM emergency_roll_calls WHERE id = ?',
    [rollCallId],
  );
  if (!rollCall) return { ok: false, status: 404, message: 'Roll call not found.' };
  if (rollCall.status !== 'active') {
    return { ok: false, status: 400, message: 'This roll call is closed.' };
  }

  const [[entry]] = await pool.query(
    'SELECT * FROM roll_call_entries WHERE id = ? AND roll_call_id = ?',
    [entryId, rollCallId],
  );
  if (!entry) return { ok: false, status: 404, message: 'Roll call entry not found.' };

  await pool.query(
    `UPDATE roll_call_entries SET status = ?, marked_by = ?, marked_at = NOW(), notes = ?
     WHERE id = ?`,
    [status, userId, notes || null, entryId],
  );

  await writeAuditLog(pool, {
    organisationId: rollCall.organisation_id,
    actorUserId: userId,
    action: 'roll_call.marked',
    targetType: 'roll_call_entry',
    targetId: entryId,
    details: { rollCallId, visitId: entry.visit_id, status, notes },
    ipAddress,
  });

  return { ok: true };
}

export async function closeRollCall(pool, {
  rollCallId,
  userId,
  notes = '',
  ipAddress = null,
}) {
  const [[rollCall]] = await pool.query(
    'SELECT * FROM emergency_roll_calls WHERE id = ?',
    [rollCallId],
  );
  if (!rollCall) return { ok: false, status: 404, message: 'Roll call not found.' };
  if (rollCall.status !== 'active') {
    return { ok: false, status: 400, message: 'Roll call is already closed.' };
  }

  await pool.query(
    `UPDATE emergency_roll_calls SET status = 'closed', closed_by = ?, closed_at = NOW(), notes = ?
     WHERE id = ?`,
    [userId, notes || null, rollCallId],
  );

  await writeAuditLog(pool, {
    organisationId: rollCall.organisation_id,
    actorUserId: userId,
    action: 'roll_call.closed',
    targetType: 'emergency_roll_call',
    targetId: rollCallId,
    details: { notes },
    ipAddress,
  });

  return { ok: true };
}
