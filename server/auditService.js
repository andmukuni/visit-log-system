import { generateId } from './visitorSchema.js';
import { getUserScope } from './scopeService.js';

export { getUserScope };

export async function writeAuditLog(pool, {
  organisationId = null,
  actorUserId = null,
  action,
  targetType = null,
  targetId = null,
  result = 'success',
  details = null,
  ipAddress = null,
}) {
  const id = generateId('audit');
  await pool.query(
    `INSERT INTO audit_logs (id, organisation_id, actor_user_id, action, target_type, target_id, result, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      organisationId,
      actorUserId,
      action,
      targetType,
      targetId,
      result,
      details ? JSON.stringify(details) : null,
      ipAddress,
    ],
  );
  return id;
}

export async function writeVisitEvent(pool, {
  visitId,
  eventType,
  actorUserId = null,
  stationId = null,
  details = null,
  reason = null,
}) {
  const id = generateId('evt');
  await pool.query(
    `INSERT INTO visit_events (id, visit_id, event_type, actor_user_id, station_id, details, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      visitId,
      eventType,
      actorUserId,
      stationId,
      details ? JSON.stringify(details) : null,
      reason,
    ],
  );
  return id;
}

export function generatePassCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function maskPhone(phone = '') {
  const p = String(phone).replace(/\s/g, '');
  if (p.length <= 4) return p;
  return `${p.slice(0, 3)}****${p.slice(-2)}`;
}
