/**
 * Reception dashboard KPI counts must use live host_zones (visitInZoneClause),
 * not the frozen visits.zone_id / hosts.zone_id snapshot.
 *
 * A host assigned only via host_zones — with hosts.zone_id and visits.zone_id
 * empty — still belongs to the desk. Snapshot filters miss that visit; the
 * dashboard would then disagree with check-in / calendar / occupancy lists.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestPool, seedFixture, seedHost, seedVisit, FIXTURE } from './helpers/pgMemHarness.js';
import { runMigrations } from '../server/migrations/index.js';
import {
  visitInZoneClause,
  visitZoneFilterClause,
} from '../server/receptionistService.js';
import { CHECK_IN_ELIGIBLE_STATUSES } from '../shared/visitCheckIn.js';
import { VISIT_CLOSED_STATUSES } from '../shared/visitCheckout.js';
import { visitOnSitePredicate } from '../shared/visitOnSite.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

const ORG = FIXTURE.orgId;
const SITE = FIXTURE.siteId;
const CEO = [FIXTURE.zones.ceo];
const SCHEDULED_AT = 'COALESCE(a.scheduled_at, vis.expected_at, vis.created_at)';
const DESK_ON_SITE = ['reception_check_in', 'checked_in', 'waiting', 'in_meeting'];

const VISIT_FROM = `
  FROM visits vis
  LEFT JOIN hosts h ON h.id = vis.host_id
  LEFT JOIN offices ofc ON ofc.id = h.office_id
  LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
  LEFT JOIN appointments a ON a.visit_id = vis.id
`;

let pool;

async function countDashboard(extra = '', extraParams = [], zoneIds = CEO) {
  const siteSql = ' AND vis.site_id = ?';
  const inZone = visitInZoneClause(zoneIds);
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT vis.id) AS count ${VISIT_FROM}
     WHERE vis.organisation_id = ?${siteSql}${inZone.sql} ${extra}`,
    [ORG, SITE, ...inZone.params, ...extraParams],
  );
  return Number(row?.count || 0);
}

async function countSnapshot(extra = '', extraParams = [], zoneIds = CEO) {
  const siteSql = ' AND vis.site_id = ?';
  const snapshot = visitZoneFilterClause(zoneIds);
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT vis.id) AS count ${VISIT_FROM}
     WHERE vis.organisation_id = ?${siteSql}${snapshot.sql} ${extra}`,
    [ORG, SITE, ...snapshot.params, ...extraParams],
  );
  return Number(row?.count || 0);
}

before(async () => {
  pool = await createTestPool();
  await runMigrations(pool, { logger: { log() {} } });
  await seedFixture(pool);

  await seedHost(pool, {
    id: 'host-live',
    name: 'Live Zone Host',
    roleSlug: 'host',
    zoneIds: [FIXTURE.zones.ceo],
  });
  await pool.query('UPDATE hosts SET zone_id = NULL WHERE id = ?', ['host-live']);

  await seedHost(pool, {
    id: 'host-other',
    name: 'Other Zone Host',
    roleSlug: 'host',
    zoneIds: [FIXTURE.zones.dceo],
  });

  await seedVisit(pool, {
    id: 'visit-live-expected',
    hostId: 'host-live',
    zoneId: null,
    status: 'expected',
  });
  await seedVisit(pool, {
    id: 'visit-live-pending',
    hostId: 'host-live',
    zoneId: null,
    status: 'pending_approval',
  });
  await seedVisit(pool, {
    id: 'visit-live-waiting',
    hostId: 'host-live',
    zoneId: null,
    status: 'waiting',
  });
  await seedVisit(pool, {
    id: 'visit-other-expected',
    hostId: 'host-other',
    zoneId: FIXTURE.zones.dceo,
    status: 'expected',
  });
});

describe('reception dashboard KPIs — live host_zones, not snapshot zone_id', () => {
  it('counts a host_zones-only visit that the snapshot filter misses', async () => {
    const live = await countDashboard(`AND vis.status = 'pending_approval'`);
    const snapshot = await countSnapshot(`AND vis.status = 'pending_approval'`);
    assert.equal(live, 1, 'live host_zones visit must count');
    assert.equal(snapshot, 0, 'empty visits.zone_id / hosts.zone_id must not satisfy the snapshot filter');
  });

  it('excludes a different-zone visit from every headline KPI', async () => {
    assert.equal(await countDashboard(`AND vis.status = 'expected'`), 1);
    assert.equal(await countDashboard(`AND vis.status = 'pending_approval'`), 1);
    assert.equal(
      await countDashboard(
        `AND vis.status IN (${DESK_ON_SITE.map(() => '?').join(', ')})`,
        DESK_ON_SITE,
      ),
      1,
    );
    assert.equal(await countDashboard(`AND vis.status = 'waiting'`), 1);
  });

  it('check-in today matches in-zone check-in-eligible rows (all types)', async () => {
    const statusPlaceholders = CHECK_IN_ELIGIBLE_STATUSES.map(() => '?').join(', ');
    const extra = `AND vis.status IN (${statusPlaceholders})`;
    const count = await countDashboard(extra, [...CHECK_IN_ELIGIBLE_STATUSES]);
    assert.equal(count, 1, 'only the in-zone expected visit is check-in eligible');
  });

  it('the DATE(scheduled_at) = CURDATE() predicate used on the dashboard binds', async () => {
    const closedPlaceholders = VISIT_CLOSED_STATUSES.map(() => '?').join(', ');
    const count = await countDashboard(
      `AND vis.status NOT IN (${closedPlaceholders})
       AND DATE(${SCHEDULED_AT}) = CURDATE()`,
      [...VISIT_CLOSED_STATUSES],
    );
    assert.equal(typeof count, 'number');
    assert.ok(count >= 0);
  });

  it('does not count checked-out visits as expected today', async () => {
    await seedVisit(pool, {
      id: 'visit-live-checked-out',
      hostId: 'host-live',
      zoneId: null,
      status: 'checked_out',
      expectedAt: new Date().toISOString(),
    });
    const closedPlaceholders = VISIT_CLOSED_STATUSES.map(() => '?').join(', ');
    const openToday = await countDashboard(
      `AND vis.status NOT IN (${closedPlaceholders})
       AND DATE(${SCHEDULED_AT}) = CURDATE()`,
      [...VISIT_CLOSED_STATUSES],
    );
    const includingClosed = await countDashboard(
      `AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
       AND DATE(${SCHEDULED_AT}) = CURDATE()`,
    );
    assert.ok(includingClosed >= openToday);
    assert.equal(
      await countDashboard(`AND vis.id = 'visit-live-checked-out' AND vis.status NOT IN (${closedPlaceholders})`, [...VISIT_CLOSED_STATUSES]),
      0,
    );
  });

  it('does not count pre-arrival pending_approval as desk occupancy', async () => {
    assert.equal(
      await countDashboard(`AND ${visitOnSitePredicate('vis', { includeGate: false })}`),
      1,
      'only the waiting guest is at the desk',
    );

    await seedVisit(pool, {
      id: 'visit-live-queued-onsite',
      hostId: 'host-live',
      zoneId: null,
      status: 'pending_approval',
      checkedInAt: '2026-08-17T10:00:00Z',
    });

    assert.equal(
      await countDashboard(`AND ${visitOnSitePredicate('vis', { includeGate: false })}`),
      2,
      'queued-on-site pending_approval with checked_in_at counts as occupancy',
    );
  });
});

describe('visitInZoneClause parameter order', () => {
  it('binds zone-match params in WHERE before extra date predicates', async () => {
    const inZone = visitInZoneClause(CEO);
    const [rows] = await pool.query(
      `SELECT vis.id ${VISIT_FROM}
       WHERE vis.organisation_id = ? AND vis.site_id = ?${inZone.sql}
         AND vis.expected_at >= ?`,
      [ORG, SITE, ...inZone.params, '2026-01-01'],
    );
    assert.ok(rows.some((row) => row.id === 'visit-live-expected'));
    assert.equal(rows.some((row) => row.id === 'visit-other-expected'), false);
  });

  it('the WRONG order (date before zone-match params) is rejected by the engine', async () => {
    const inZone = visitInZoneClause(CEO);
    await assert.rejects(
      async () => pool.query(
        `SELECT vis.id ${VISIT_FROM}
         WHERE vis.organisation_id = ? AND vis.site_id = ?${inZone.sql}
           AND vis.expected_at >= ?`,
        [ORG, SITE, '2026-01-01', ...inZone.params],
      ),
      'a timestamp bound into the zone IN-list (or a zone id bound to expected_at) must fail',
    );
  });
});
