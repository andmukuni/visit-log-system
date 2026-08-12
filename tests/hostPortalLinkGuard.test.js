import { describe, it, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { syncHostPortalUser } from '../server/hostPortalService.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

function mockPool(handlers) {
  const calls = [];
  return {
    calls,
    query: mock.fn(async (sql, params = []) => {
      calls.push({ sql, params });
      for (const [pattern, response] of handlers) if (sql.includes(pattern)) return response;
      return [[]];
    }),
  };
}

describe('host portal link guard — a host row may not hijack someone else\'s login', () => {
  it('refuses to sync when the linked account belongs to a different email', async () => {
    // Reproduces the live defect: host "Demo" <demo@demo.com> was linked to the
    // reception@demo.com login, so every admin save re-granted the host role
    // (and would have rewritten the login email).
    const pool = mockPool([
      ['SELECT id, email FROM users WHERE id = ?', [[{ id: 'usr-reception', email: 'reception@demo.com' }]]],
    ]);
    const result = await syncHostPortalUser(pool, {
      userId: 'usr-reception',
      name: 'Demo',
      email: 'demo@demo.com',
      organisationId: 'org-1',
    });

    assert.equal(result, null, 'must refuse rather than link');
    const mutating = pool.calls.filter(({ sql }) => /UPDATE users|INSERT INTO user_admin_roles|INSERT INTO users/i.test(sql));
    assert.deepEqual(mutating, [], 'must not touch the account it refused to sync');
  });

  it('still syncs normally when the emails match', async () => {
    const pool = mockPool([
      ['SELECT id, email FROM users WHERE id = ?', [[{ id: 'usr-sarah', email: 'sarahz@wg.com' }]]],
      ['SELECT id, slug FROM admin_roles', [[{ id: 'role-host', slug: 'host' }]]],
    ]);
    const result = await syncHostPortalUser(pool, {
      userId: 'usr-sarah',
      name: 'Sarah Zulu',
      email: 'sarahz@wg.com',
      organisationId: 'org-1',
    });
    assert.equal(result, 'usr-sarah');
    assert.ok(pool.calls.some(({ sql }) => sql.includes('UPDATE users')), 'matching account should still sync');
  });

  it('is case- and whitespace-insensitive so a formatting difference is not treated as a hijack', async () => {
    const pool = mockPool([
      ['SELECT id, email FROM users WHERE id = ?', [[{ id: 'usr-1', email: 'Sarah@WG.com' }]]],
      ['SELECT id, slug FROM admin_roles', [[{ id: 'role-host', slug: 'host' }]]],
    ]);
    const result = await syncHostPortalUser(pool, {
      userId: 'usr-1', name: 'Sarah', email: '  sarah@wg.com  ', organisationId: 'org-1',
    });
    assert.equal(result, 'usr-1');
  });
});
