/**
 * REAL database integration tests.
 *
 * These run actual SQL against a disposable in-memory PostgreSQL instance
 * (pg-mem) through the production Postgres dialect adapter. They therefore
 * exercise real joins, real aliases, real parameter binding and real dialect
 * translation — the things a mocked pool cannot verify.
 *
 * They never touch the live/remote database.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTestPool, seedFixture, seedHost, seedReceptionist, seedGuard, seedVisit, FIXTURE,
} from './helpers/pgMemHarness.js';
import { runMigrations, pendingMigrations } from '../server/migrations/index.js';
import {
  resolveReceptionZoneContext,
  visitZoneMatchExpr,
  resolveReceptionAudienceByZone,
  buildReceptionSearchClause,
} from '../server/receptionistService.js';
import { resolveHostZoneIds } from '../server/hostPortalService.js';
import {
  resolveSecurityScopeContext,
  visitSecurityScopeFilterClause,
} from '../server/securityGuardService.js';
import { applyVisitAccessPolicyToRows } from '../server/visitorAccessPolicy.js';
import appPool from '../server/db.js';

after(async () => {
  try { await appPool.end(); } catch { /* never opened */ }
});

let pool;

/** Runs the reception list query exactly as routes/reception.js builds it. */
async function receptionVisitList(zoneIds, { search = '' } = {}) {
  const zoneMatch = visitZoneMatchExpr(zoneIds);
  const params = [...zoneMatch.params, FIXTURE.orgId, FIXTURE.siteId];
  let filters = '';
  if (search) {
    const clause = buildReceptionSearchClause(zoneMatch, search);
    filters += clause.sql;
    params.push(...clause.params);
  }
  const [rows] = await pool.query(
    `SELECT vis.id, vis.organisation_id, vis.status, vis.expected_at, vis.pass_code, vis.invite_token,
            vis.check_in_signature, vis.purpose,
            v.full_name, v.phone, v.email, v.company, v.id_number_masked,
            vcd.id_number, vcd.confidential_notes,
            h.name AS host_name,
            ${zoneMatch.sql} AS zone_match
     FROM visits vis
     INNER JOIN visitors v ON v.id = vis.visitor_id
     LEFT JOIN visitor_contact_details vcd ON vcd.visitor_id = v.id
     LEFT JOIN hosts h ON h.id = vis.host_id
     LEFT JOIN offices ofc ON ofc.id = h.office_id
     LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
     WHERE vis.organisation_id = ? AND vis.site_id = ?${filters}
     ORDER BY vis.id`,
    params,
  );
  return rows;
}

async function securityVisitList(scopeCtx) {
  const { sql, params } = visitSecurityScopeFilterClause(scopeCtx);
  const [rows] = await pool.query(
    `SELECT vis.id, v.full_name, h.name AS host_name, vis.station_id,
            COALESCE(sec_zone.building_id, sec_ofc.building_id) AS building_id
     FROM visits vis
     INNER JOIN visitors v ON v.id = vis.visitor_id
     LEFT JOIN hosts h ON h.id = vis.host_id
     LEFT JOIN zones sec_zone ON sec_zone.id = vis.zone_id
     LEFT JOIN offices sec_ofc ON sec_ofc.id = COALESCE(vis.office_id, h.office_id)
     WHERE vis.organisation_id = ?${sql}
     ORDER BY vis.id`,
    [FIXTURE.orgId, ...params],
  );
  return rows;
}

before(async () => {
  pool = await createTestPool();

  // ---- MIGRATIONS: clean database ----
  const pendingBefore = await pendingMigrations(pool);
  assert.equal(pendingBefore.length, 1, 'expected exactly one pending migration on a clean DB');
  const first = await runMigrations(pool, { logger: { log() {} } });
  assert.deepEqual(first.applied, ['001'], 'migration 001 should apply on a clean database');

  // ---- MIGRATIONS: re-run against an already-migrated database (idempotency) ----
  const second = await runMigrations(pool, { logger: { log() {} } });
  assert.deepEqual(second.applied, [], 're-running must apply nothing');
  assert.deepEqual(second.skipped, ['001'], 're-running must record 001 as already applied');

  await seedFixture(pool);

  // Real-world role -> zone relationships from the remote database.
  await seedHost(pool, { id: 'host-ceo', name: 'Huang Yaochi', roleSlug: 'ceo', zoneIds: [FIXTURE.zones.ceo] });
  await seedHost(pool, { id: 'host-dceo', name: 'Victor Palangwa', roleSlug: 'dceo', zoneIds: [FIXTURE.zones.dceo] });
  await seedHost(pool, { id: 'host-general', name: 'Daniel Sikatali', roleSlug: 'host', zoneIds: [FIXTURE.zones.area] });
  await seedHost(pool, { id: 'host-nozone', name: 'Zoneless Host', roleSlug: 'host', zoneIds: [] });

  await seedReceptionist(pool, { id: 'rcp-ceo', name: 'Sarah Zulu', zoneIds: [FIXTURE.zones.ceo] });
  await seedReceptionist(pool, { id: 'rcp-dceo', name: 'Twaambo Hantumba', zoneIds: [FIXTURE.zones.dceo] });
  await seedReceptionist(pool, { id: 'rcp-area', name: 'Demo Reception', zoneIds: [FIXTURE.zones.area] });
  await seedReceptionist(pool, { id: 'rcp-multi', name: 'Multi Desk', zoneIds: [FIXTURE.zones.dceo, FIXTURE.zones.area] });
  await seedReceptionist(pool, {
    id: 'rcp-revoked', name: 'Revoked Desk',
    zoneIds: [FIXTURE.zones.ceo], statuses: { [FIXTURE.zones.ceo]: 'inactive' },
  });

  // Visits: one per host zone, plus a zoneless one.
  await seedVisit(pool, { id: 'visit-ceo', hostId: 'host-ceo', zoneId: FIXTURE.zones.ceo, stationId: FIXTURE.gateId });
  await seedVisit(pool, { id: 'visit-dceo', hostId: 'host-dceo', zoneId: FIXTURE.zones.dceo, stationId: FIXTURE.otherGateId });
  await seedVisit(pool, { id: 'visit-area', hostId: 'host-general', zoneId: FIXTURE.zones.area, stationId: FIXTURE.gateId });
  await seedVisit(pool, { id: 'visit-nozone', hostId: 'host-nozone', zoneId: null, stationId: FIXTURE.gateId });
});

describe('INTEGRATION: migrations against a disposable database', () => {
  it('created every zone-access table with organisation boundary + status columns', async () => {
    for (const table of ['host_zones', 'receptionist_zones', 'security_guard_stations', 'security_guard_buildings', 'host_role_zone_defaults']) {
      const [rows] = await pool.query(`SELECT * FROM ${table} LIMIT 1`);
      assert.ok(Array.isArray(rows), `${table} must exist and be queryable`);
    }
    const [hz] = await pool.query('SELECT host_id, zone_id, organisation_id, status FROM host_zones LIMIT 1');
    assert.equal(hz[0].organisation_id, FIXTURE.orgId);
    assert.equal(hz[0].status, 'active');
  });

  it('recorded the applied version in schema_migrations', async () => {
    const [rows] = await pool.query('SELECT version, name FROM schema_migrations');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].version, '001');
  });
});

describe('INTEGRATION: remote-database role -> zone resolution', () => {
  it('CEO host resolves to CEO - Reception by real zone id', async () => {
    assert.deepEqual(await resolveHostZoneIds(pool, 'host-ceo'), [FIXTURE.zones.ceo]);
  });

  it('DEPUTY CEO host resolves to DCEO - Reception', async () => {
    assert.deepEqual(await resolveHostZoneIds(pool, 'host-dceo'), [FIXTURE.zones.dceo]);
  });

  it('GENERAL EMPLOYEE host resolves to Reception Area', async () => {
    assert.deepEqual(await resolveHostZoneIds(pool, 'host-general'), [FIXTURE.zones.area]);
  });

  it('falls back to the configurable role->zone default when a host has no zone', async () => {
    await pool.query(
      `INSERT INTO host_role_zone_defaults (organisation_id, role_slug, zone_id, status) VALUES (?, 'host', ?, 'active')`,
      [FIXTURE.orgId, FIXTURE.zones.area],
    );
    assert.deepEqual(await resolveHostZoneIds(pool, 'host-nozone'), [FIXTURE.zones.area]);
    await pool.query(`DELETE FROM host_role_zone_defaults WHERE organisation_id = ? AND role_slug = 'host'`, [FIXTURE.orgId]);
  });

  it('host with no zone and no default fails safe to an empty set', async () => {
    assert.deepEqual(await resolveHostZoneIds(pool, 'host-nozone'), []);
  });

  it('a revoked (inactive) zone assignment grants nothing', async () => {
    const ctx = await resolveReceptionZoneContext(pool, 'usr-rcp-revoked');
    assert.equal(ctx.isReceptionist, true);
    assert.deepEqual(ctx.zoneIds, [], 'inactive assignment must not resurrect via legacy zone_id');
  });

  it('a multi-zone receptionist resolves every active zone', async () => {
    const ctx = await resolveReceptionZoneContext(pool, 'usr-rcp-multi');
    assert.deepEqual([...ctx.zoneIds].sort(), [FIXTURE.zones.dceo, FIXTURE.zones.area].sort());
  });

  it('a login linked to two receptionist records (one per zone, pre-multi-zone workaround) unions both zones', async () => {
    // Simulates an org that, before multi-zone assignment existed, covered a
    // second zone by creating a second `receptionists` row against the same
    // login instead of adding a second receptionist_zones row.
    await pool.query(
      `INSERT INTO receptionists (id, organisation_id, site_id, zone_id, user_id, name, email, status)
       VALUES ('rcp-ceo-dup', ?, ?, ?, 'usr-rcp-ceo', 'Sarah Zulu', 'rcp-ceo-dup@example.com', 'active')`,
      [FIXTURE.orgId, FIXTURE.siteId, FIXTURE.zones.area],
    );
    await pool.query(
      `INSERT INTO receptionist_zones (receptionist_id, zone_id, organisation_id, status)
       VALUES ('rcp-ceo-dup', ?, ?, 'active')`,
      [FIXTURE.zones.area, FIXTURE.orgId],
    );

    const ctx = await resolveReceptionZoneContext(pool, 'usr-rcp-ceo');
    assert.deepEqual(
      [...ctx.zoneIds].sort(),
      [FIXTURE.zones.ceo, FIXTURE.zones.area].sort(),
      'zones from every active receptionist record tied to this login must be combined, not just one',
    );
  });
});

describe('INTEGRATION: reception visitor list authorisation (real SQL)', () => {
  it('same-zone receptionist gets the full record for their zone', async () => {
    const rows = await receptionVisitList([FIXTURE.zones.ceo]);
    const ceoRow = rows.find((r) => r.id === 'visit-ceo');
    assert.equal(Number(ceoRow.zone_match), 1, 'CEO desk must match the CEO host visit');

    const dto = applyVisitAccessPolicyToRows([ceoRow], {
      permissions: [], isElevated: false, scope: { organisation_id: FIXTURE.orgId },
      hostContext: null, receptionContext: { receptionistId: 'rcp-ceo', zoneIds: [FIXTURE.zones.ceo] }, securityContext: null,
    }, { zoneMatchColumn: 'zone_match' })[0];

    assert.equal(dto._accessLevel, 'full');
    assert.equal(dto.full_name, 'Jane Doe');
    assert.equal(dto.company, 'Acme Holdings');
    // Even at full access these must never ship.
    assert.equal(dto.confidential_notes, undefined);
    assert.equal(dto.id_number, undefined);
    assert.equal(dto.invite_token, undefined);
    assert.equal(dto.check_in_signature, undefined);
  });

  it('different-zone receptionist gets name + time ONLY for another zone', async () => {
    const rows = await receptionVisitList([FIXTURE.zones.dceo]);
    const ceoRow = rows.find((r) => r.id === 'visit-ceo');
    assert.equal(Number(ceoRow.zone_match), 0, 'DCEO desk must not match the CEO host visit');

    const dto = applyVisitAccessPolicyToRows([ceoRow], {
      permissions: [], isElevated: false, scope: { organisation_id: FIXTURE.orgId },
      hostContext: null, receptionContext: { receptionistId: 'rcp-dceo', zoneIds: [FIXTURE.zones.dceo] }, securityContext: null,
    }, { zoneMatchColumn: 'zone_match' })[0];

    assert.deepEqual(Object.keys(dto).sort(), ['_accessLevel', '_restrictedReason', 'expected_at', 'full_name', 'id'].sort());
    for (const forbidden of ['phone', 'email', 'company', 'purpose', 'pass_code', 'host_name', 'status', 'id_number', 'confidential_notes']) {
      assert.equal(dto[forbidden], undefined, `restricted row leaked ${forbidden}`);
    }
  });

  it('a zoneless host\'s visit is restricted for EVERY receptionist (fail-safe)', async () => {
    for (const zone of [FIXTURE.zones.ceo, FIXTURE.zones.dceo, FIXTURE.zones.area]) {
      const rows = await receptionVisitList([zone]);
      const row = rows.find((r) => r.id === 'visit-nozone');
      assert.equal(Number(row.zone_match), 0, `zoneless visit must not match zone ${zone}`);
    }
  });

  it('multi-zone receptionist gets full access when ANY zone matches', async () => {
    const rows = await receptionVisitList([FIXTURE.zones.dceo, FIXTURE.zones.area]);
    assert.equal(Number(rows.find((r) => r.id === 'visit-dceo').zone_match), 1);
    assert.equal(Number(rows.find((r) => r.id === 'visit-area').zone_match), 1);
    assert.equal(Number(rows.find((r) => r.id === 'visit-ceo').zone_match), 0);
  });
});

describe('INTEGRATION: search-oracle protection (real SQL)', () => {
  it('searching a cross-zone visitor COMPANY returns no row at all', async () => {
    // The DCEO desk must not be able to confirm that the CEO-zone visitor
    // works at "Acme Holdings" by searching for it.
    const rows = await receptionVisitList([FIXTURE.zones.dceo], { search: 'Acme' });
    const crossZoneHits = rows.filter((r) => Number(r.zone_match) === 0);
    assert.equal(crossZoneHits.length, 0, 'company search leaked a cross-zone visit');
  });

  it('searching a cross-zone HOST name returns no row at all', async () => {
    const rows = await receptionVisitList([FIXTURE.zones.dceo], { search: 'Huang' });
    assert.equal(rows.filter((r) => Number(r.zone_match) === 0).length, 0, 'host-name search leaked a cross-zone visit');
  });

  it('searching a cross-zone PASS CODE returns no row at all', async () => {
    const rows = await receptionVisitList([FIXTURE.zones.dceo], { search: 'PASS42' });
    assert.equal(rows.filter((r) => Number(r.zone_match) === 0).length, 0, 'pass-code search leaked a cross-zone visit');
  });

  it('cross-zone rows ARE still findable by visitor name (the one permitted field)', async () => {
    const rows = await receptionVisitList([FIXTURE.zones.dceo], { search: 'Jane' });
    assert.ok(rows.some((r) => Number(r.zone_match) === 0), 'name search should still return the restricted row');
  });

  it('in-zone rows keep full-column search', async () => {
    const rows = await receptionVisitList([FIXTURE.zones.ceo], { search: 'Acme' });
    assert.ok(rows.some((r) => r.id === 'visit-ceo' && Number(r.zone_match) === 1));
  });
});

describe('INTEGRATION: security officer site/building/gate scoping (real SQL)', () => {
  before(async () => {
    // Put the CEO host in an office in the head-office building so a visit's
    // building resolves via office as well as via zone.
    await pool.query(
      `INSERT INTO offices (id, organisation_id, department_id, building_id, zone_id, site_id, office_number, status)
       VALUES ('ofc-head', ?, 'dept-exec', ?, ?, ?, '101', 'active')`,
      [FIXTURE.orgId, FIXTURE.buildingId, FIXTURE.zones.ceo, FIXTURE.siteId],
    );
    await seedGuard(pool, { id: 'grd-correct', name: 'Correct Gate', stationIds: [FIXTURE.gateId], buildingIds: [FIXTURE.buildingId] });
    await seedGuard(pool, { id: 'grd-wrongbuilding', name: 'Wrong Building', stationIds: [FIXTURE.gateId], buildingIds: [FIXTURE.otherBuildingId] });
    await seedGuard(pool, { id: 'grd-wronggate', name: 'Wrong Gate', stationIds: [FIXTURE.otherGateId], buildingIds: [FIXTURE.buildingId] });
    await seedGuard(pool, { id: 'grd-wrongsite', name: 'Wrong Site', stationIds: [], buildingIds: [], siteId: FIXTURE.otherSiteId });
    await seedGuard(pool, { id: 'grd-sitewide', name: 'Site Wide', stationIds: [], buildingIds: [] });
    await seedGuard(pool, {
      id: 'grd-revoked', name: 'Revoked Gate',
      stationIds: [FIXTURE.gateId], statuses: { [FIXTURE.gateId]: 'inactive' }, legacyStationId: FIXTURE.gateId,
    });
  });

  it('same site + same gate + correct building => visit visible', async () => {
    const ctx = await resolveSecurityScopeContext(pool, 'usr-grd-correct');
    const rows = await securityVisitList(ctx);
    assert.ok(rows.some((r) => r.id === 'visit-ceo'), 'correctly-assigned officer must see the visit');
  });

  it('same site + same gate + WRONG building => visit NOT visible', async () => {
    const ctx = await resolveSecurityScopeContext(pool, 'usr-grd-wrongbuilding');
    const rows = await securityVisitList(ctx);
    assert.equal(rows.some((r) => r.id === 'visit-ceo'), false, 'wrong-building officer must not see the visit');
  });

  it('correct building but WRONG gate => visit NOT visible (AND, not OR)', async () => {
    const ctx = await resolveSecurityScopeContext(pool, 'usr-grd-wronggate');
    const rows = await securityVisitList(ctx);
    assert.equal(rows.some((r) => r.id === 'visit-ceo'), false, 'wrong-gate officer must not see the visit');
  });

  it('WRONG site => nothing visible', async () => {
    const ctx = await resolveSecurityScopeContext(pool, 'usr-grd-wrongsite');
    const rows = await securityVisitList(ctx);
    assert.equal(rows.length, 0, 'officer at another site must see nothing');
  });

  it('officer with an inactive gate assignment does not fall back to the legacy column', async () => {
    const ctx = await resolveSecurityScopeContext(pool, 'usr-grd-revoked');
    assert.deepEqual(ctx.stationIds, [], 'revoked assignment must not resurrect via security_guards.station_id');
  });

  it('officer with no gate/building rows is site-scoped, not unscoped', async () => {
    const ctx = await resolveSecurityScopeContext(pool, 'usr-grd-sitewide');
    const rows = await securityVisitList(ctx);
    assert.ok(rows.length > 0, 'site-wide officer sees their site');
    assert.ok(rows.every((r) => r.id !== 'nonexistent'));
  });

  it('a visit whose building cannot be resolved is excluded from a building-scoped officer', async () => {
    const ctx = await resolveSecurityScopeContext(pool, 'usr-grd-correct');
    const rows = await securityVisitList(ctx);
    // visit-nozone has no zone and no office => building_id resolves NULL.
    assert.equal(rows.some((r) => r.id === 'visit-nozone'), false, 'unresolvable-building visit must be excluded');
  });
});

describe('INTEGRATION: cross-organisation isolation (real SQL)', () => {
  it('a visit in another organisation is never returned', async () => {
    await pool.query(
      `INSERT INTO visitors (id, organisation_id, full_name) VALUES ('vis-other', ?, 'Other Org Visitor')`,
      [FIXTURE.otherOrgId],
    );
    await pool.query(
      `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, zone_id, status)
       VALUES ('visit-other', ?, ?, 'vis-other', 'host-ceo', ?, 'expected')`,
      [FIXTURE.otherOrgId, FIXTURE.siteId, FIXTURE.zones.ceo],
    );
    const rows = await receptionVisitList([FIXTURE.zones.ceo]);
    assert.equal(rows.some((r) => r.id === 'visit-other'), false, 'cross-org visit leaked into reception list');
  });
});

describe('INTEGRATION: notification audience split (real SQL)', () => {
  it('splits reception into same-zone and different-zone by real zone rows', async () => {
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: FIXTURE.orgId, siteId: FIXTURE.siteId, hostZoneIds: [FIXTURE.zones.ceo],
    });
    const sameIds = sameZone.map((r) => r.receptionistId);
    const diffIds = differentZone.map((r) => r.receptionistId);
    assert.ok(sameIds.includes('rcp-ceo'), 'CEO desk must be same-zone');
    assert.ok(diffIds.includes('rcp-dceo'), 'DCEO desk must be different-zone');
    assert.ok(diffIds.includes('rcp-revoked'), 'revoked-zone desk must be different-zone');
  });

  it('a zoneless host puts EVERY receptionist in the different-zone bucket', async () => {
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: FIXTURE.orgId, siteId: FIXTURE.siteId, hostZoneIds: [],
    });
    assert.equal(sameZone.length, 0);
    assert.ok(differentZone.length > 0);
  });
});
