import { writeVisitEvent } from './auditService.js';
import { isPostgresDriver, resolveDbDriver } from './sqlDialect.js';

export const DEFAULT_VISIT_DURATION_MINUTES = 120;

/** Statuses that can flip to overdue once checked_in_at exceeds category duration. */
function resolvePoolDriver(pool) {
  return pool?.driver || resolveDbDriver();
}

function overdueThresholdSql(pool) {
  if (isPostgresDriver(resolvePoolDriver(pool))) {
    return `vis.checked_in_at < (NOW() - (COALESCE(vc.default_duration_minutes, ?)::text || ' minutes')::interval)::timestamp`;
  }
  return `vis.checked_in_at < DATE_SUB(NOW(), INTERVAL COALESCE(vc.default_duration_minutes, ?) MINUTE)`;
}

export const OVERDUE_SOURCE_STATUSES = Object.freeze([
  'reception_check_in',
  'checked_in',
  'waiting',
  'in_meeting',
  'pending_approval',
]);

/**
 * Mark on-site visits that have exceeded their authorised duration as overdue.
 * Duration comes from visitor_categories.default_duration_minutes (fallback 120).
 */
export async function markOverdueVisits(pool, { organisationId = null, siteId = null } = {}) {
  const params = [...OVERDUE_SOURCE_STATUSES, DEFAULT_VISIT_DURATION_MINUTES];
  let scopeSql = '';
  if (organisationId) {
    scopeSql += ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  if (siteId) {
    scopeSql += ' AND vis.site_id = ?';
    params.push(siteId);
  }

  const statusPlaceholders = OVERDUE_SOURCE_STATUSES.map(() => '?').join(', ');
  const [candidates] = await pool.query(
    `SELECT vis.id
     FROM visits vis
     LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
     WHERE vis.status IN (${statusPlaceholders})
       AND vis.checked_in_at IS NOT NULL
       AND ${overdueThresholdSql(pool)}
       ${scopeSql}`,
    params,
  );

  if (!candidates.length) return { marked: 0 };

  const ids = candidates.map((row) => row.id);
  const idPlaceholders = ids.map(() => '?').join(', ');
  await pool.query(
    `UPDATE visits SET status = 'overdue', updated_at = NOW() WHERE id IN (${idPlaceholders})`,
    ids,
  );

  for (const row of candidates) {
    await writeVisitEvent(pool, { visitId: row.id, eventType: 'overdue' });
  }

  return { marked: candidates.length };
}
