import { describe, it, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHostZoneIds, parseHostZoneIds, validateHostZones } from '../server/hostPortalService.js';
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

describe('parseHostZoneIds', () => {
  it('accepts a zoneIds array, dedupes and trims', () => {
    assert.deepEqual(parseHostZoneIds({ zoneIds: [' z1 ', 'z2', 'z1'] }), ['z1', 'z2']);
  });

  it('falls back to a single zoneId', () => {
    assert.deepEqual(parseHostZoneIds({ zoneId: 'z1' }), ['z1']);
  });

  it('falls back to the provided default when nothing is in the body', () => {
    assert.deepEqual(parseHostZoneIds({}, ['fallback-zone']), ['fallback-zone']);
  });
});

describe('resolveHostZoneIds — 4-tier resolution order (Logic.md fail-safe)', () => {
  it('tier 1: explicit host_zones wins over everything else, including a conflicting legacy zone_id', async () => {
    const host = { id: 'h1', organisation_id: 'org1', zone_id: 'legacy-zone', office_id: 'ofc1', user_id: 'u1' };
    const pool = smartMockPool([
      ['FROM host_zones hz', [[{ id: 'zone-multi-a' }, { id: 'zone-multi-b' }]]],
    ]);
    const result = await resolveHostZoneIds(pool, host);
    assert.deepEqual(result.sort(), ['zone-multi-a', 'zone-multi-b']);
  });

  it('tier 2: falls back to the legacy hosts.zone_id when host_zones is empty', async () => {
    const host = { id: 'h1', organisation_id: 'org1', zone_id: 'legacy-zone', office_id: null, user_id: 'u1' };
    const pool = smartMockPool([
      ['FROM host_zones hz', [[]]],
    ]);
    const result = await resolveHostZoneIds(pool, host);
    assert.deepEqual(result, ['legacy-zone']);
  });

  it('tier 3: falls back to the office zone when no explicit or legacy zone exists', async () => {
    const host = { id: 'h1', organisation_id: 'org1', zone_id: null, office_id: 'ofc1', user_id: 'u1' };
    const pool = smartMockPool([
      ['FROM host_zones hz', [[]]],
      ['FROM offices WHERE id = ?', [[{ zone_id: 'zone-from-office' }]]],
    ]);
    const result = await resolveHostZoneIds(pool, host);
    assert.deepEqual(result, ['zone-from-office']);
  });

  it('tier 4: falls back to the configurable role→zone default mapping (CEO → CEO - Reception)', async () => {
    const host = { id: 'h1', organisation_id: 'org1', zone_id: null, office_id: null, user_id: 'u1' };
    const pool = smartMockPool([
      ['FROM host_zones hz', [[]]],
      ['FROM user_admin_roles uar', [[{ slug: 'ceo' }]]],
      ['FROM host_role_zone_defaults', [[{ zone_id: 'zone-ceo-reception' }]]],
    ]);
    const result = await resolveHostZoneIds(pool, host);
    assert.deepEqual(result, ['zone-ceo-reception']);
  });

  it('genuine fail-safe: returns [] (not an error) when no tier resolves anything (scenario 6)', async () => {
    const host = { id: 'h1', organisation_id: 'org1', zone_id: null, office_id: null, user_id: null };
    const pool = smartMockPool([
      ['FROM host_zones hz', [[]]],
      ['FROM host_role_zone_defaults', [[]]],
    ]);
    const result = await resolveHostZoneIds(pool, host);
    assert.deepEqual(result, []);
  });

  it('a role-default mapping never overrides a host that already has an explicit zone', async () => {
    // Matches the confirmed live-DB reality: hosts keep per-host explicit
    // assignment even when it disagrees with their role's default.
    const host = { id: 'h1', organisation_id: 'org1', zone_id: 'reception-area', office_id: null, user_id: 'u1' };
    const pool = smartMockPool([
      ['FROM host_zones hz', [[]]],
      // If tier 4 were consulted it would return the CEO default — it must not be.
      ['FROM host_role_zone_defaults', [[{ zone_id: 'zone-ceo-reception' }]]],
    ]);
    const result = await resolveHostZoneIds(pool, host);
    assert.deepEqual(result, ['reception-area']);
  });
});

describe('validateHostZones', () => {
  it('accepts an empty zone list (host CRUD keeps its own required-zone check separately)', async () => {
    const pool = smartMockPool([]);
    const result = await validateHostZones(pool, [], 'org1', 'site1');
    assert.equal(result.ok, true);
    assert.deepEqual(result.zoneIds, []);
  });
});
