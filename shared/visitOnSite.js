import { visitHasCheckedIn } from './visitCheckout.js';

/** Visitors who have been received at the desk (including waiting / in meeting). */
export const DESK_ON_SITE_STATUSES = Object.freeze([
  'reception_check_in',
  'checked_in',
  'waiting',
  'in_meeting',
  'overdue',
]);

/** Visitors logged at the gate who have not yet reached the desk. */
export const GATE_ON_SITE_STATUSES = Object.freeze([
  'arrived_at_gate',
  'entered_premises',
]);

/** Campus presence used by security/station “currently inside” KPIs. */
export const ON_SITE_VISIT_STATUSES = Object.freeze([
  ...DESK_ON_SITE_STATUSES,
  ...GATE_ON_SITE_STATUSES,
]);

/** Hosts with a guest already at the desk or in a meeting. */
export const HOST_OCCUPIED_STATUSES = Object.freeze([
  'waiting',
  'in_meeting',
  'reception_check_in',
  'checked_in',
  'overdue',
]);

const QUEUED_ON_SITE_STATUSES = Object.freeze(['pending_approval', 'rejected']);

function sqlStringList(values) {
  return values.map((value) => `'${String(value).replace(/'/g, '')}'`).join(', ');
}

/**
 * SQL predicate for visits that are physically on campus.
 * Pre-arrival `pending_approval` bookings are excluded unless `checked_in_at` is set.
 */
export function visitOnSitePredicate(alias = 'vis', {
  includeGate = true,
  includeQueuedOnSite = true,
  hostOccupied = false,
} = {}) {
  const statuses = hostOccupied
    ? HOST_OCCUPIED_STATUSES
    : (includeGate ? ON_SITE_VISIT_STATUSES : DESK_ON_SITE_STATUSES);
  const queued = hostOccupied
    ? (includeQueuedOnSite ? ['pending_approval'] : [])
    : (includeQueuedOnSite ? QUEUED_ON_SITE_STATUSES : []);

  let sql = `${alias}.status IN (${sqlStringList(statuses)})`;
  if (queued.length) {
    sql = `(${sql} OR (${alias}.status IN (${sqlStringList(queued)}) AND ${alias}.checked_in_at IS NOT NULL))`;
  }
  return sql;
}

export function isVisitPhysicallyOnSite(visit, { includeGate = true } = {}) {
  const status = String(visit?.status || '').toLowerCase();
  const statuses = includeGate ? ON_SITE_VISIT_STATUSES : DESK_ON_SITE_STATUSES;
  if (statuses.includes(status)) return true;
  if (QUEUED_ON_SITE_STATUSES.includes(status) && visitHasCheckedIn(visit)) return true;
  return false;
}
