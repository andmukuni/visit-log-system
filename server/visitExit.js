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

const GATE_ARRIVAL_EVENTS = Object.freeze(['arrived_at_gate', 'entered_premises']);

/** True when the visit was logged at a gate before reception checkout. */
export async function visitHadGateArrival(pool, visitId) {
  if (!visitId) return false;
  const [[event]] = await pool.query(
    `SELECT id FROM visit_events
     WHERE visit_id = ? AND event_type IN (?, ?)
     LIMIT 1`,
    [visitId, ...GATE_ARRIVAL_EVENTS],
  );
  return Boolean(event);
}

/** Reception-only visits can complete at the desk; gate arrivals wait for confirm-left. */
export async function shouldFinalizeReceptionCheckout(pool, visitId) {
  return !(await visitHadGateArrival(pool, visitId));
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
  // Fire-and-forget — the departure is already recorded.
  notifyVisitEvent(pool, {
    visitId,
    eventType: 'left_premises',
    actorUserId,
    notifyVisitor,
  }).catch((error) => console.warn('[visit.departure] notify failed:', error.message));
}
