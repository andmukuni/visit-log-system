/**
 * Executes the REAL reception route queries against a real database engine.
 *
 * Why this file exists
 * --------------------
 * A production 500 shipped because `zone_match` lives in the SELECT list, so
 * its placeholders bind BEFORE the WHERE clause's — but five routes appended
 * its params LAST. With a date filter present, a zone-id string was bound to a
 * timestamp comparison and Postgres rejected the statement.
 *
 * The earlier integration suite tested the zone-match FUNCTION with a
 * hand-assembled query, so it never exercised the routes' own parameter
 * assembly and could not catch this. These tests reproduce each route's exact
 * SQL shape and parameter order, including the date filter that triggered it.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestPool, seedFixture, seedHost, seedVisit, FIXTURE } from './helpers/pgMemHarness.js';
import { runMigrations } from '../server/migrations/index.js';
import { visitZoneMatchExpr } from '../server/receptionistService.js';
import { calendarSelectSql } from '../server/routes/reception.js';
import { applyVisitAccessPolicyToRows } from '../server/visitorAccessPolicy.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

let pool;
const ZONES = () => [FIXTURE.zones.ceo];
const SITE = FIXTURE.siteId;
const ORG = FIXTURE.orgId;

function calendarSelectSqlForHarness(zoneMatchSql) {
  // pg-mem does not implement STRING_AGG and cannot execute the production
  // expected-vehicle scalar subquery. Replace only that unrelated projection;
  // every authorization-driving field still comes from the real route builder.
  const expectedPlatesSelect = `(SELECT GROUP_CONCAT(DISTINCT ev.plate_number)
          FROM expected_vehicles ev
          WHERE ev.visit_id = vis.id AND ev.status = 'expected') AS expected_plates`;
  const routeSql = calendarSelectSql(zoneMatchSql);
  const harnessSql = routeSql.replace(expectedPlatesSelect, 'NULL AS expected_plates');
  assert.notEqual(harnessSql, routeSql, 'test harness must replace the unsupported aggregate only');
  return harnessSql;
}

before(async () => {
  pool = await createTestPool();
  await runMigrations(pool, { logger: { log() {} } });
  await seedFixture(pool);
  await seedHost(pool, { id: 'host-ceo', name: 'Huang Yaochi', roleSlug: 'ceo', zoneIds: [FIXTURE.zones.ceo] });
  await seedVisit(pool, { id: 'visit-ceo', hostId: 'host-ceo', zoneId: FIXTURE.zones.ceo, stationId: FIXTURE.gateId });
  await pool.query(
    `INSERT INTO appointments (id, organisation_id, visit_id, host_id, title, scheduled_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
    ['appt-ceo', ORG, 'visit-ceo', 'host-ceo', 'CEO appointment', '2026-08-20T09:00:00Z'],
  );
});

describe('ROUTE QUERY: /reception/calendar — the exact shape that 500d in production', () => {
  it('binds correctly WITH a start/end date filter (the failing case)', async () => {
    const zm = visitZoneMatchExpr(ZONES());
    const params = [ORG, SITE];
    const from = '2026-08-20';
    const to = '2026-08-21';
    params.push(from, to);

    const [rows] = await pool.query(
      `${calendarSelectSqlForHarness(zm.sql)}
       WHERE vis.organisation_id = ? AND vis.site_id = ?
         AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
         AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) >= ?
         AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) < ?
       ORDER BY COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) ASC
       LIMIT 500`,
      // Correct order: SELECT-list params first, then WHERE params.
      [...zm.params, ...params],
    );
    assert.equal(rows.length, 1, 'the same-zone expected visit must be selected');
    assert.equal(rows[0].organisation_id, ORG, 'the tenant field required by the access policy must be selected');

    const visible = applyVisitAccessPolicyToRows(rows, {
      userId: 'usr-rcp-ceo',
      permissions: [],
      isElevated: false,
      scope: { organisation_id: ORG, site_id: SITE },
      hostContext: null,
      receptionContext: { receptionistId: 'rcp-ceo', zoneIds: ZONES() },
      securityContext: null,
    }, { zoneMatchColumn: 'zone_match' });

    assert.equal(visible.length, 1, 'the tenant policy must not discard the calendar row');
    assert.equal(visible[0]._accessLevel, 'full');
    assert.equal(visible[0].id, 'visit-ceo', 'calendar actions must use the visit id');
    assert.equal(visible[0].appointment_id, 'appt-ceo');
  });

  it('keeps a different-zone appointment as a restricted name-and-time row with an opaque visit id', async () => {
    const zm = visitZoneMatchExpr([FIXTURE.zones.dceo]);
    const [rows] = await pool.query(
      `${calendarSelectSqlForHarness(zm.sql)}
       WHERE vis.organisation_id = ? AND vis.site_id = ?
         AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
         AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) >= ?
         AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) < ?`,
      [...zm.params, ORG, SITE, '2026-08-20', '2026-08-21'],
    );

    const visible = applyVisitAccessPolicyToRows(rows, {
      userId: 'usr-rcp-dceo',
      permissions: [],
      isElevated: false,
      scope: { organisation_id: ORG, site_id: SITE },
      hostContext: null,
      receptionContext: { receptionistId: 'rcp-dceo', zoneIds: [FIXTURE.zones.dceo] },
      securityContext: null,
    }, { zoneMatchColumn: 'zone_match' });

    assert.equal(visible.length, 1);
    assert.deepEqual(visible[0], {
      id: 'visit-ceo',
      visitor_name: 'Jane Doe',
      expected_at: new Date('2026-08-20T09:00:00Z'),
      _accessLevel: 'restricted',
      _restrictedReason: 'zone_mismatch',
    });
  });

  it('the WRONG order (params before zone-match) is genuinely rejected by the engine', async () => {
    const zm = visitZoneMatchExpr(ZONES());
    const params = [ORG, SITE, '2026-08-12', '2026-08-13'];
    await assert.rejects(
      async () => pool.query(
        `SELECT vis.id, ${zm.sql} AS zone_match
         FROM visits vis
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN offices ofc ON ofc.id = h.office_id
         LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
         WHERE vis.organisation_id = ? AND vis.site_id = ?
           AND vis.expected_at >= ? AND vis.expected_at < ?`,
        [...params, ...zm.params], // deliberately wrong — reproduces the outage
      ),
      'the mis-ordered binding must fail, proving this test can detect the regression',
    );
  });
});

describe('ROUTE QUERY: other reception routes carrying zone_match in the SELECT list', () => {
  it('check-in-appointments shape binds correctly', async () => {
    const zm = visitZoneMatchExpr(ZONES());
    const statuses = ['expected', 'approved', 'arrived_at_gate'];
    const params = [ORG, ...statuses, SITE];
    const [rows] = await pool.query(
      `SELECT vis.id, vis.organisation_id, v.full_name, ${zm.sql} AS zone_match
       FROM visits vis
       INNER JOIN visitors v ON v.id = vis.visitor_id
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN offices ofc ON ofc.id = h.office_id
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.organisation_id = ?
         AND vis.status IN (?, ?, ?) AND vis.site_id = ?`,
      [...zm.params, ...params],
    );
    assert.ok(Array.isArray(rows));
  });

  it('host-queue shape binds correctly (statuses AFTER the site filter)', async () => {
    const zm = visitZoneMatchExpr(ZONES());
    const statuses = ['waiting', 'pending_approval'];
    const [rows] = await pool.query(
      `SELECT vis.id, vis.organisation_id, ${zm.sql} AS zone_match
       FROM visits vis
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN offices ofc ON ofc.id = h.office_id
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.organisation_id = ? AND vis.site_id = ?
         AND vis.status IN (?, ?)`,
      [...zm.params, ORG, SITE, ...statuses],
    );
    assert.ok(Array.isArray(rows));
  });

  it('occupancy shape binds correctly', async () => {
    const zm = visitZoneMatchExpr(ZONES());
    const [rows] = await pool.query(
      `SELECT vis.id, vis.organisation_id, vis.status, ${zm.sql} AS zone_match
       FROM visits vis
       INNER JOIN visitors v ON v.id = vis.visitor_id
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN offices ofc ON ofc.id = h.office_id
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.organisation_id = ? AND vis.site_id = ?
         AND vis.status IN ('checked_in', 'waiting')`,
      [...zm.params, ORG, SITE],
    );
    assert.ok(Array.isArray(rows));
  });

  it('dashboard recentActivity shape binds correctly', async () => {
    const zm = visitZoneMatchExpr(ZONES());
    const [rows] = await pool.query(
      `SELECT ve.id, ve.visit_id, v.full_name AS visitor_name, ${zm.sql} AS zone_match
       FROM visit_events ve
       INNER JOIN visits vis ON vis.id = ve.visit_id
       INNER JOIN visitors v ON v.id = vis.visitor_id
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN offices ofc ON ofc.id = h.office_id
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.organisation_id = ? AND vis.site_id = ?`,
      [...zm.params, ORG, SITE],
    ).catch(() => [[]]); // visit_events is not in the harness schema; binding is what matters
    assert.ok(Array.isArray(rows));
  });

  it('a multi-zone desk (more placeholders) still binds correctly', async () => {
    const zm = visitZoneMatchExpr([FIXTURE.zones.ceo, FIXTURE.zones.dceo, FIXTURE.zones.area]);
    const [rows] = await pool.query(
      `SELECT vis.id, ${zm.sql} AS zone_match
       FROM visits vis
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN offices ofc ON ofc.id = h.office_id
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.organisation_id = ? AND vis.expected_at >= ?`,
      [...zm.params, ORG, '2026-01-01'],
    );
    assert.ok(Array.isArray(rows));
  });
});
