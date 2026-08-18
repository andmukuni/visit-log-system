import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestPool,
  seedFixture,
  seedHost,
  seedVisit,
  FIXTURE,
} from './helpers/pgMemHarness.js';
import { applyVisitReceptionCheckIn } from '../server/visitCheckInService.js';
import appPool from '../server/db.js';

after(async () => {
  try { await appPool.end(); } catch { /* never opened */ }
});

describe('visit reception check-in service', () => {
  let pool;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
    await seedHost(pool, {
      id: 'host-mukuni',
      name: 'Mukuni',
      roleSlug: 'host',
      zoneIds: [FIXTURE.zones.ceo],
    });
  });

  it('uses pool.query transactions on postgres-style pools without getConnection', () => {
    assert.equal(typeof pool.query, 'function');
    assert.equal(pool.getConnection, undefined);
  });

  it('checks in an arrived_at_gate visit with an empty badge on postgres', async () => {
    const { visitId, visitorId } = await seedVisit(pool, {
      id: 'visit-gate-receive',
      hostId: 'host-mukuni',
      zoneId: FIXTURE.zones.ceo,
      status: 'arrived_at_gate',
    });

    await applyVisitReceptionCheckIn(pool, {
      visit: {
        id: visitId,
        visitor_id: visitorId,
        organisation_id: FIXTURE.orgId,
        host_id: 'host-mukuni',
        zone_id: FIXTURE.zones.ceo,
        badge_number: null,
      },
      visitId,
      scope: { station_id: null },
      badgeNumber: undefined,
      receptionZone: { zoneIds: [FIXTURE.zones.ceo] },
    });

    const [[updated]] = await pool.query(
      'SELECT status, checked_in_at, badge_number FROM visits WHERE id = ?',
      [visitId],
    );

    assert.equal(updated.status, 'reception_check_in');
    assert.ok(updated.checked_in_at);
    assert.equal(updated.badge_number, null);
  });

  it('rejects duplicate active check-ins for the same visitor', async () => {
    const { visitId, visitorId } = await seedVisit(pool, {
      id: 'visit-gate-dup-active',
      hostId: 'host-mukuni',
      zoneId: FIXTURE.zones.ceo,
      status: 'waiting',
      visitor: { full_name: 'Duplicate Guest', phone: '+260972222222', email: 'dup@example.com' },
    });
    await pool.query(
      `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, zone_id, purpose, status, expected_at, pass_code, checked_in_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'arrived_at_gate', ?, ?, NULL)`,
      [
        'visit-gate-dup-arriving',
        FIXTURE.orgId,
        FIXTURE.siteId,
        visitorId,
        'host-mukuni',
        FIXTURE.zones.ceo,
        'Follow-up meeting',
        '2026-08-20T11:00:00Z',
        'PASS99',
      ],
    );

    await assert.rejects(
      () => applyVisitReceptionCheckIn(pool, {
        visit: {
          id: 'visit-gate-dup-arriving',
          visitor_id: visitorId,
          organisation_id: FIXTURE.orgId,
          host_id: 'host-mukuni',
          zone_id: FIXTURE.zones.ceo,
          badge_number: null,
        },
        visitId: 'visit-gate-dup-arriving',
        scope: { station_id: null },
        receptionZone: { zoneIds: [FIXTURE.zones.ceo] },
      }),
      (err) => err.status === 400 && /active check-in/i.test(err.message),
    );

    const [[unchanged]] = await pool.query(
      'SELECT status FROM visits WHERE id = ?',
      [visitId],
    );
    assert.equal(unchanged.status, 'waiting');
  });
});
