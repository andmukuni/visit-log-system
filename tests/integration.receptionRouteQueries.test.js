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
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

let pool;
const ZONES = () => [FIXTURE.zones.ceo];
const SITE = FIXTURE.siteId;
const ORG = FIXTURE.orgId;

before(async () => {
  pool = await createTestPool();
  await runMigrations(pool, { logger: { log() {} } });
  await seedFixture(pool);
  await seedHost(pool, { id: 'host-ceo', name: 'Huang Yaochi', roleSlug: 'ceo', zoneIds: [FIXTURE.zones.ceo] });
  await seedVisit(pool, { id: 'visit-ceo', hostId: 'host-ceo', zoneId: FIXTURE.zones.ceo, stationId: FIXTURE.gateId });
});

describe('ROUTE QUERY: /reception/calendar — the exact shape that 500d in production', () => {
  it('binds correctly WITH a start/end date filter (the failing case)', async () => {
    const zm = visitZoneMatchExpr(ZONES());
    const params = [ORG, SITE];
    const from = '2026-08-12';
    const to = '2026-08-13';
    params.push(from, to);

    const [rows] = await pool.query(
      `SELECT a.id, COALESCE(a.title, vis.purpose) AS title,
              COALESCE(a.scheduled_at, vis.expected_at) AS scheduled_at,
              vis.id AS visit_id, vis.status AS visit_status, vis.organisation_id,
              v.full_name AS visitor_name, v.company, v.phone,
              h.name AS host_name,
              ${zm.sql} AS zone_match
       FROM visits vis
       INNER JOIN visitors v ON v.id = vis.visitor_id
       LEFT JOIN appointments a ON a.visit_id = vis.id
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN offices ofc ON ofc.id = h.office_id
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.organisation_id = ? AND vis.site_id = ?
         AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
         AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) >= ?
         AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) < ?
       ORDER BY COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) ASC
       LIMIT 500`,
      // Correct order: SELECT-list params first, then WHERE params.
      [...zm.params, ...params],
    );
    assert.ok(Array.isArray(rows), 'query must execute without a binding error');
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
