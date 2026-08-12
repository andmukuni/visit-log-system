import { describe, it, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  visitSecurityScopeFilterClause,
  resolveSecurityScopeContext,
  requireSecurityScopeContext,
} from '../server/securityGuardService.js';
import pool from '../server/db.js';

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore if pool was never opened
  }
});

/** Dispatches by a distinctive substring in the query text — robust to internal call-order changes. */
function smartMockPool(handlers) {
  return {
    query: mock.fn(async (sql) => {
      for (const [pattern, response] of handlers) {
        if (sql.includes(pattern)) return response;
      }
      return [[]];
    }),
  };
}

describe('visitSecurityScopeFilterClause — hard exclusion, unlike reception (scenarios 8, 9, 13)', () => {
  it('denies all rows when no site is assigned (deny by default)', () => {
    const { sql, params } = visitSecurityScopeFilterClause({ siteId: null, stationIds: [], buildingIds: [] });
    assert.match(sql, /1=0/);
    assert.deepEqual(params, []);
  });

  it('site-only scope (no gate/building assignment) is a valid site-wide filter', () => {
    const { sql, params } = visitSecurityScopeFilterClause({ siteId: 'site1', stationIds: [], buildingIds: [] });
    assert.match(sql, /vis\.site_id = \?/);
    assert.deepEqual(params, ['site1']);
    assert.doesNotMatch(sql, /station_id/);
  });

  it('requires site AND building AND gate to all match when all are configured (scenario 8)', () => {
    // AND, not OR: a gate has no building_id of its own and serves every
    // building on its site, so OR would let a gate assignment expose visits
    // destined for buildings this officer does not cover.
    const { sql, params } = visitSecurityScopeFilterClause({
      siteId: 'site1', stationIds: ['gate-a'], buildingIds: ['bld-1'],
    });
    assert.match(sql, /vis\.station_id IN/);
    assert.match(sql, /building_id\) IN/);
    assert.doesNotMatch(sql, / OR /);
    assert.deepEqual(params, ['site1', 'bld-1', 'gate-a']);
  });

  it('a visit whose building cannot be resolved is excluded, not admitted', () => {
    // COALESCE(zone.building_id, office.building_id) is NULL for such a visit,
    // and `NULL IN (...)` is never true — fail-closed by construction.
    const { sql } = visitSecurityScopeFilterClause({
      siteId: 'site1', stationIds: [], buildingIds: ['bld-1'],
    });
    assert.match(sql, /COALESCE\(sec_zone\.building_id, sec_ofc\.building_id\) IN/);
  });

  it('gate-only assignment does not reference buildings', () => {
    const { sql } = visitSecurityScopeFilterClause({ siteId: 'site1', stationIds: ['gate-a'], buildingIds: [] });
    assert.match(sql, /vis\.station_id IN/);
    assert.doesNotMatch(sql, /building_id/);
  });
});

describe('resolveSecurityScopeContext / requireSecurityScopeContext', () => {
  it('is not a security officer when no active guard row exists', async () => {
    const pool = smartMockPool([]);
    const ctx = await resolveSecurityScopeContext(pool, 'user-1');
    assert.equal(ctx.isSecurityOfficer, false);
  });

  it('falls back to legacy station_id when the multi-gate join table is empty', async () => {
    const pool = smartMockPool([
      ['FROM security_guards', [[{ id: 'g1', organisation_id: 'org1', site_id: 'site1', station_id: 'legacy-gate' }]]],
      ['FROM security_guard_stations', [[]]],
      ['FROM security_guard_buildings', [[]]],
    ]);
    const ctx = await resolveSecurityScopeContext(pool, 'user-1');
    assert.equal(ctx.isSecurityOfficer, true);
    assert.deepEqual(ctx.stationIds, ['legacy-gate']);
  });

  it('prefers multi-gate assignment over the legacy column when present', async () => {
    const pool = smartMockPool([
      ['FROM security_guards', [[{ id: 'g1', organisation_id: 'org1', site_id: 'site1', station_id: 'legacy-gate' }]]],
      ['FROM security_guard_stations', [[{ id: 'gate-a', name: 'Gate A', site_id: 'site1' }, { id: 'gate-b', name: 'Gate B', site_id: 'site1' }]]],
      ['FROM security_guard_buildings', [[]]],
    ]);
    const ctx = await resolveSecurityScopeContext(pool, 'user-1');
    assert.deepEqual(ctx.stationIds.sort(), ['gate-a', 'gate-b']);
  });

  it('requireSecurityScopeContext denies (403) a user with no guard profile', async () => {
    const pool = smartMockPool([]);
    const result = await requireSecurityScopeContext(pool, 'user-1');
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });

  it('requireSecurityScopeContext denies (403) a guard with no site assigned', async () => {
    const pool = smartMockPool([
      ['FROM security_guards', [[{ id: 'g1', organisation_id: 'org1', site_id: null, station_id: null }]]],
      ['FROM security_guard_stations', [[]]],
      ['FROM security_guard_buildings', [[]]],
    ]);
    const result = await requireSecurityScopeContext(pool, 'user-1');
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });

  it('never returns a scope for a different organisation than the guard row itself belongs to (scenario 13)', async () => {
    const pool = smartMockPool([
      ['FROM security_guards', [[{ id: 'g1', organisation_id: 'org-a', site_id: 'site1', station_id: null }]]],
      ['FROM security_guard_stations', [[]]],
      ['FROM security_guard_buildings', [[]]],
    ]);
    const ctx = await resolveSecurityScopeContext(pool, 'user-1');
    assert.equal(ctx.organisationId, 'org-a');
  });
});
