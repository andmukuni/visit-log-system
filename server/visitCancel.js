import { writeVisitEvent, writeAuditLog } from './auditService.js';
import { canTransition } from './scopeService.js';
import { notifyVisitEvent } from './notificationService.js';
import { exitVisitVehicles } from './visitExit.js';
import { refreshHostAvailabilityAfterVisit } from './hostAvailability.js';
import { isCancelEligible } from '../shared/visitCancel.js';

export class VisitCancelError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = 'VisitCancelError';
  }
}

/** Cancel a pre-arrival visit: status, badge, vehicles, events, notifications. */
export async function applyVisitCancel(pool, { visit, actorUserId = null, reason = null } = {}) {
  if (!visit?.id) {
    throw new VisitCancelError('Visit is required.');
  }
  if (!isCancelEligible(visit) || !canTransition(visit.status, 'cancelled')) {
    throw new VisitCancelError('Visit cannot be cancelled in its current state.');
  }

  await pool.query("UPDATE visits SET status = 'cancelled', updated_at = NOW() WHERE id = ?", [visit.id]);

  if (visit.badge_number) {
    await pool.query(
      `UPDATE badges SET status = 'available', visit_id = NULL, returned_at = NOW()
       WHERE organisation_id = ? AND badge_number = ?`,
      [visit.organisation_id, visit.badge_number],
    );
  }

  await exitVisitVehicles(pool, { visitId: visit.id });
  await writeVisitEvent(pool, {
    visitId: visit.id,
    eventType: 'cancelled',
    actorUserId,
    reason: reason || null,
  });
  await writeAuditLog(pool, {
    organisationId: visit.organisation_id,
    actorUserId,
    action: 'visit.cancel',
    targetType: 'visit',
    targetId: visit.id,
  });
  notifyVisitEvent(pool, { visitId: visit.id, eventType: 'cancelled', actorUserId })
    .catch((error) => console.warn('[visit.cancel] notify failed:', error.message));
  await refreshHostAvailabilityAfterVisit(pool, visit);

  return { ok: true, message: 'Visit cancelled.' };
}
