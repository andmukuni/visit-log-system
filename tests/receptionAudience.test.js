import { describe, it, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReceptionAudienceByZone, visitZoneMatchExpr } from '../server/receptionistService.js';
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

describe('visitZoneMatchExpr — boolean SELECT expression, not a filter (contrast with visitZoneFilterClause)', () => {
  it('is a plain "0" (never matches) when zoneIds is empty, no params, no leading AND', () => {
    const { sql, params } = visitZoneMatchExpr([]);
    assert.equal(sql, '0');
    assert.deepEqual(params, []);
  });

  it('checks live host_zones before falling back to the frozen visit/host zone snapshot', () => {
    const { sql, params } = visitZoneMatchExpr(['zone-a', 'zone-b']);
    assert.match(sql, /EXISTS \(\s*SELECT 1 FROM host_zones hz/);
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM host_zones hz2/);
    assert.deepEqual(params, ['zone-a', 'zone-b', 'zone-a', 'zone-b']);
  });
});

describe('resolveReceptionAudienceByZone — same/different-zone split (scenarios 1-7)', () => {
  it('same-zone receptionist lands in sameZone (scenario 1)', async () => {
    const pool = smartMockPool([
      ['FROM receptionists r', [[{ id: 'r1', user_id: 'u1', name: 'Sarah', email: 's@x.com', phone: '123' }]]],
      ['FROM receptionist_zones rz', [[{ receptionist_id: 'r1', id: 'zone-ceo', name: 'CEO - Reception' }]]],
    ]);
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: 'org1', siteId: 'site1', hostZoneIds: ['zone-ceo'],
    });
    assert.equal(sameZone.length, 1);
    assert.equal(sameZone[0].receptionistId, 'r1');
    assert.equal(differentZone.length, 0);
  });

  it('different-zone receptionist lands in differentZone (scenario 2)', async () => {
    const pool = smartMockPool([
      ['FROM receptionists r', [[{ id: 'r2', user_id: 'u2', name: 'Twaambo', email: 't@x.com', phone: '456' }]]],
      ['FROM receptionist_zones rz', [[{ receptionist_id: 'r2', id: 'zone-dceo', name: 'DCEO - Reception' }]]],
    ]);
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: 'org1', siteId: 'site1', hostZoneIds: ['zone-ceo'],
    });
    assert.equal(sameZone.length, 0);
    assert.equal(differentZone.length, 1);
    assert.equal(differentZone[0].receptionistId, 'r2');
  });

  it('zone-id equality drives the split, not role/title strings (scenario 3, 4)', async () => {
    // A "DEPUTY CEO" host and a "DCEO - Reception" receptionist share a zone id
    // regardless of what either is named — the split must be purely zone-id based.
    const pool = smartMockPool([
      ['FROM receptionists r', [[{ id: 'r-dceo', user_id: 'u3', name: 'Reception Desk', email: null, phone: null }]]],
      ['FROM receptionist_zones rz', [[{ receptionist_id: 'r-dceo', id: 'zone-dceo-real-id', name: 'Whatever Label' }]]],
    ]);
    const { sameZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: 'org1', siteId: 'site1', hostZoneIds: ['zone-dceo-real-id'],
    });
    assert.equal(sameZone.length, 1);
  });

  it('a receptionist with multiple zones lands in sameZone when ANY zone matches (scenario 5)', async () => {
    const pool = smartMockPool([
      ['FROM receptionists r', [[{ id: 'r-multi', user_id: 'u4', name: 'Multi', email: null, phone: null }]]],
      ['FROM receptionist_zones rz', [[
        { receptionist_id: 'r-multi', id: 'zone-a', name: 'A' },
        { receptionist_id: 'r-multi', id: 'zone-b', name: 'B' },
      ]]],
    ]);
    const { sameZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: 'org1', siteId: 'site1', hostZoneIds: ['zone-b'],
    });
    assert.equal(sameZone.length, 1);
  });

  it('empty hostZoneIds puts every receptionist in differentZone — the fail-safe falls out for free (scenario 6)', async () => {
    const pool = smartMockPool([
      ['FROM receptionists r', [[
        { id: 'r1', user_id: 'u1', name: 'A', email: null, phone: null },
        { id: 'r2', user_id: 'u2', name: 'B', email: null, phone: null },
      ]]],
      ['FROM receptionist_zones rz', [[
        { receptionist_id: 'r1', id: 'zone-a', name: 'A' },
        { receptionist_id: 'r2', id: 'zone-b', name: 'B' },
      ]]],
    ]);
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {
      organisationId: 'org1', siteId: 'site1', hostZoneIds: [],
    });
    assert.equal(sameZone.length, 0);
    assert.equal(differentZone.length, 2);
  });

  it('a receptionist whose zone was removed falls out of sameZone on the very next call (scenario 7 — no caching)', async () => {
    // Same receptionist, first call has the zone, second call (after admin
    // revocation) returns none — proves the split is computed fresh per call.
    const before = smartMockPool([
      ['FROM receptionists r', [[{ id: 'r1', user_id: 'u1', name: 'A', email: null, phone: null }]]],
      ['FROM receptionist_zones rz', [[{ receptionist_id: 'r1', id: 'zone-ceo', name: 'CEO' }]]],
    ]);
    const afterRevocation = smartMockPool([
      ['FROM receptionists r', [[{ id: 'r1', user_id: 'u1', name: 'A', email: null, phone: null }]]],
      ['FROM receptionist_zones rz', [[]]],
    ]);
    const result1 = await resolveReceptionAudienceByZone(before, { organisationId: 'org1', siteId: 'site1', hostZoneIds: ['zone-ceo'] });
    assert.equal(result1.sameZone.length, 1);

    const result2 = await resolveReceptionAudienceByZone(afterRevocation, { organisationId: 'org1', siteId: 'site1', hostZoneIds: ['zone-ceo'] });
    assert.equal(result2.sameZone.length, 0);
    assert.equal(result2.differentZone.length, 1);
  });

  it('returns nothing when no organisationId is given', async () => {
    const pool = smartMockPool([]);
    const { sameZone, differentZone } = await resolveReceptionAudienceByZone(pool, {});
    assert.deepEqual(sameZone, []);
    assert.deepEqual(differentZone, []);
  });
});
