import { writeVisitEvent } from './auditService.js';
import { isPostgresDriver, resolveDbDriver } from './sqlDialect.js';
import { exitVisitVehicles, finalizeVisitDeparture } from './visitExit.js';
import { refreshHostAvailabilityAfterVisit } from './hostAvailability.js';

/** Open visits older than this are closed automatically. */
export const AUTO_COMPLETE_AFTER_HOURS = 12;

const QUEUED_ON_SITE = Object.freeze(['pending_approval', 'rejected']);

export const AUTO_COMPLETE_SOURCE_STATUSES = Object.freeze([
  'arrived_at_gate',
  'entered_premises',
  'reception_check_in',
  'checked_in',
  'waiting',
  'in_meeting',
  'overdue',
  'pending_approval',
  'rejected',
  'checked_out',
]);

function resolvePoolDriver(pool) {
  return pool?.driver || resolveDbDriver();
}

function olderThanHoursSql(pool) {
  if (isPostgresDriver(resolvePoolDriver(pool))) {
    return `COALESCE(vis.checked_in_at, vis.created_at)::timestamp < (NOW() - (?::text || ' hours')::interval)::timestamp`;
  }
  return `COALESCE(vis.checked_in_at, vis.created_at) < DATE_SUB(NOW(), INTERVAL ? HOUR)`;
}

/**
 * Complete visits that have been open longer than 12 hours (check-in, or
 * created_at for gate arrivals that never reached the desk).
 */
export async function autoCompleteStaleVisits(pool, {
  organisationId = null,
  siteId = null,
  maxHours = AUTO_COMPLETE_AFTER_HOURS,
} = {}) {
  const hours = Number(maxHours);
  const durationHours = Number.isFinite(hours) && hours > 0 ? hours : AUTO_COMPLETE_AFTER_HOURS;
  const params = [...AUTO_COMPLETE_SOURCE_STATUSES, ...QUEUED_ON_SITE, durationHours];
  let scopeSql = '';
  if (organisationId) {
    scopeSql += ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  if (siteId) {
    scopeSql += ' AND vis.site_id = ?';
    params.push(siteId);
  }

  const statusPlaceholders = AUTO_COMPLETE_SOURCE_STATUSES.map(() => '?').join(', ');
  const queuedPlaceholders = QUEUED_ON_SITE.map(() => '?').join(', ');

  const [candidates] = await pool.query(
    `SELECT vis.*
     FROM visits vis
     WHERE vis.status IN (${statusPlaceholders})
       AND NOT (vis.status IN (${queuedPlaceholders}) AND vis.checked_in_at IS NULL)
       AND ${olderThanHoursSql(pool)}
       ${scopeSql}`,
    params,
  );

  if (!candidates.length) return { completed: 0 };

  for (const visit of candidates) {
    if (!visit.checked_out_at) {
      await pool.query(
        `UPDATE visits SET status = 'checked_out', checked_out_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [visit.id],
      );
      await writeVisitEvent(pool, {
        visitId: visit.id,
        eventType: 'checked_out',
        reason: `Auto-completed after ${durationHours} hours`,
      });
    }

    await exitVisitVehicles(pool, { visitId: visit.id });

    if (visit.badge_number) {
      await pool.query(
        `UPDATE badges SET status = 'available', visit_id = NULL, returned_at = NOW()
         WHERE organisation_id = ? AND badge_number = ?`,
        [visit.organisation_id, visit.badge_number],
      );
    }

    await finalizeVisitDeparture(pool, { visitId: visit.id, notifyVisitor: false });
    await refreshHostAvailabilityAfterVisit(pool, visit);
  }

  return { completed: candidates.length };
}
