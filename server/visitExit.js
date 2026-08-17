import { writeVisitEvent } from './auditService.js';
import { notifyVisitEvent } from './notificationService.js';

/** Mark on-site / gate vehicles as exited when the visit checks out. */
export async function exitVisitVehicles(pool, { visitId, stationId = null } = {}) {
  if (!visitId) return;
  await pool.query(
    `UPDATE vehicles SET status = 'exited', exited_at = NOW(), exit_station_id = ?
     WHERE visit_id = ? AND status IN ('on_site', 'arrived_at_gate', 'entry_approved')`,
    [stationId || null, visitId],
  );
}

/** Gate-confirm the visitor has left: left_premises, then completed. */
export async function finalizeVisitDeparture(pool, {
  visitId,
  actorUserId = null,
  notifyVisitor = false,
} = {}) {
  if (!visitId) return;
  await pool.query(
    "UPDATE visits SET status = 'left_premises', updated_at = NOW() WHERE id = ?",
    [visitId],
  );
  await writeVisitEvent(pool, { visitId, eventType: 'left_premises', actorUserId });
  await pool.query(
    "UPDATE visits SET status = 'completed', updated_at = NOW() WHERE id = ?",
    [visitId],
  );
  await notifyVisitEvent(pool, {
    visitId,
    eventType: 'left_premises',
    actorUserId,
    notifyVisitor,
  });
}
