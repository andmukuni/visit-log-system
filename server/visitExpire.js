import { writeVisitEvent } from './auditService.js';
import { isPostgresDriver, resolveDbDriver } from './sqlDialect.js';

export const EXPIRE_SOURCE_STATUSES = Object.freeze(['approved', 'expected']);

function resolvePoolDriver(pool) {
  return pool?.driver || resolveDbDriver();
}

function windowPassedSql(pool) {
  if (isPostgresDriver(resolvePoolDriver(pool))) {
    return 'COALESCE(vis.expected_at, a.scheduled_at)::timestamp < NOW()::timestamp';
  }
  return 'COALESCE(vis.expected_at, a.scheduled_at) < NOW()';
}

/**
 * Mark pre-arrival approved/expected visits whose appointment window has passed.
 * Visits without expected_at or appointment.scheduled_at are left alone.
 */
export async function markExpiredVisits(pool, { organisationId = null, siteId = null } = {}) {
  const params = [...EXPIRE_SOURCE_STATUSES];
  let scopeSql = '';
  if (organisationId) {
    scopeSql += ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  if (siteId) {
    scopeSql += ' AND vis.site_id = ?';
    params.push(siteId);
  }

  const statusPlaceholders = EXPIRE_SOURCE_STATUSES.map(() => '?').join(', ');
  const [candidates] = await pool.query(
    `SELECT vis.id
     FROM visits vis
     LEFT JOIN appointments a ON a.visit_id = vis.id
     WHERE vis.status IN (${statusPlaceholders})
       AND vis.checked_in_at IS NULL
       AND ${windowPassedSql(pool)}
       ${scopeSql}`,
    params,
  );

  if (!candidates.length) return { expired: 0 };

  const ids = candidates.map((row) => row.id);
  const idPlaceholders = ids.map(() => '?').join(', ');
  await pool.query(
    `UPDATE visits SET status = 'expired', updated_at = NOW() WHERE id IN (${idPlaceholders})`,
    ids,
  );

  for (const row of candidates) {
    await writeVisitEvent(pool, { visitId: row.id, eventType: 'expired' });
  }

  return { expired: candidates.length };
}
