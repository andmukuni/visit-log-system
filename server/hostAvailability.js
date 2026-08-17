/** Persist and sync host available / unavailable presence for reception boards. */

import { visitOnSitePredicate } from '../shared/visitOnSite.js';

export const HOST_AVAILABILITY = {
  available: 'available',
  unavailable: 'unavailable',
};

export function normalizeHostAvailability(raw) {
  const value = String(raw || '').toLowerCase().trim();
  if (value === 'unavailable' || value === 'occupied' || value === 'not_available') {
    return HOST_AVAILABILITY.unavailable;
  }
  return HOST_AVAILABILITY.available;
}

export async function setHostAvailability(pool, hostId, availability) {
  if (!hostId) return;
  const next = normalizeHostAvailability(availability);
  await pool.query(
    'UPDATE hosts SET availability = ? WHERE id = ?',
    [next, hostId],
  );
}

/** Mark host unavailable when a visit starts with them. */
export async function markHostUnavailableForVisit(pool, visit) {
  if (!visit?.host_id) return;
  await setHostAvailability(pool, visit.host_id, HOST_AVAILABILITY.unavailable);
}

/**
 * Mark host available again when they have no remaining on-site guests
 * at the desk (including queued-on-site pending_approval).
 */
export async function refreshHostAvailabilityAfterVisit(pool, visit) {
  const hostId = visit?.host_id;
  if (!hostId) return;

  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count FROM visits vis
     WHERE vis.host_id = ?
       AND vis.organisation_id = ?
       AND ${visitOnSitePredicate('vis', { hostOccupied: true })}
       AND vis.id <> ?`,
    [hostId, visit.organisation_id, visit.id],
  );

  if (Number(row?.count || 0) === 0) {
    await setHostAvailability(pool, hostId, HOST_AVAILABILITY.available);
  }
}
