import { visitOnSitePredicate } from '../shared/visitOnSite.js';
import { resolveHostZoneId } from './receptionistService.js';

/**
 * Mark a visit as received at reception inside a transaction.
 * Uses pool.query BEGIN/COMMIT so this works on both MySQL and the Postgres
 * pool wrapper (which does not expose getConnection()).
 */
export async function applyVisitReceptionCheckIn(pool, {
  visit,
  visitId,
  scope = null,
  badgeNumber = null,
  receptionZone = { zoneIds: [] },
}) {
  let assignedBadge = badgeNumber?.trim() || null;
  let transactionOpen = false;

  try {
    await pool.query('BEGIN');
    transactionOpen = true;

    const [[activeDuplicate]] = await pool.query(
      `SELECT id FROM visits vis
       WHERE vis.visitor_id = ? AND vis.id != ? AND ${visitOnSitePredicate('vis')}
       LIMIT 1 FOR UPDATE`,
      [visit.visitor_id, visitId],
    );
    if (activeDuplicate) {
      const error = new Error('Visitor already has an active check-in.');
      error.status = 400;
      throw error;
    }

    if (assignedBadge) {
      const [[badge]] = await pool.query(
        `SELECT * FROM badges WHERE organisation_id = ? AND badge_number = ? AND status = 'available' LIMIT 1 FOR UPDATE`,
        [visit.organisation_id, assignedBadge],
      );
      if (!badge) {
        const error = new Error('Badge not available.');
        error.status = 400;
        throw error;
      }
      await pool.query(
        `UPDATE badges SET status = 'issued', visit_id = ?, issued_at = NOW() WHERE id = ?`,
        [visitId, badge.id],
      );
    }

    const stampedZoneId = visit.zone_id
      || await resolveHostZoneId(pool, visit.host_id)
      || receptionZone.zoneIds?.[0]
      || null;
    const nextBadgeNumber = assignedBadge || visit.badge_number || null;

    await pool.query(
      `UPDATE visits
       SET status = 'reception_check_in',
           checked_in_at = NOW(),
           badge_number = ?,
           station_id = COALESCE(?, station_id),
           zone_id = COALESCE(zone_id, ?),
           updated_at = NOW()
       WHERE id = ?`,
      [nextBadgeNumber, scope?.station_id ?? null, stampedZoneId, visitId],
    );

    await pool.query('COMMIT');
    transactionOpen = false;

    return {
      assignedBadge,
      nextBadgeNumber,
      stampedZoneId,
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await pool.query('ROLLBACK');
      } catch {
        // ignore rollback failures
      }
    }
    throw error;
  }
}
