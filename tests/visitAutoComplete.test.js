import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, seedFixture, seedHost, seedVisit, FIXTURE } from './helpers/pgMemHarness.js';
import { runMigrations } from '../server/migrations/index.js';
import { autoCompleteStaleVisits, AUTO_COMPLETE_AFTER_HOURS } from '../server/visitAutoComplete.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

let pool;

before(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  await seedFixture(pool);
  await seedHost(pool, { id: 'host-auto', userId: 'user-auto', zoneId: FIXTURE.zones.ceo });
});

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60_000).toISOString();
}

describe('autoCompleteStaleVisits', () => {
  it('completes an on-site visit older than 12 hours', async () => {
    await seedVisit(pool, {
      id: 'visit-stale-waiting',
      hostId: 'host-auto',
      zoneId: FIXTURE.zones.ceo,
      status: 'waiting',
      checkedInAt: hoursAgo(AUTO_COMPLETE_AFTER_HOURS + 1),
    });

    const result = await autoCompleteStaleVisits(pool, { organisationId: FIXTURE.orgId });
    assert.ok(result.completed >= 1);

    const [[row]] = await pool.query('SELECT status, checked_out_at FROM visits WHERE id = ?', ['visit-stale-waiting']);
    assert.equal(row.status, 'completed');
    assert.ok(row.checked_out_at);
  });

  it('leaves a recent on-site visit open', async () => {
    await seedVisit(pool, {
      id: 'visit-fresh-waiting',
      hostId: 'host-auto',
      zoneId: FIXTURE.zones.ceo,
      status: 'waiting',
      checkedInAt: hoursAgo(1),
    });

    await autoCompleteStaleVisits(pool, { organisationId: FIXTURE.orgId });
    const [[row]] = await pool.query('SELECT status FROM visits WHERE id = ?', ['visit-fresh-waiting']);
    assert.equal(row.status, 'waiting');
  });

  it('does not complete a pre-arrival booking without check-in', async () => {
    await seedVisit(pool, {
      id: 'visit-prearrival-old',
      hostId: 'host-auto',
      zoneId: FIXTURE.zones.ceo,
      status: 'pending_approval',
    });
    await pool.query('UPDATE visits SET created_at = ? WHERE id = ?', [hoursAgo(AUTO_COMPLETE_AFTER_HOURS + 2), 'visit-prearrival-old']);

    await autoCompleteStaleVisits(pool, { organisationId: FIXTURE.orgId });
    const [[row]] = await pool.query('SELECT status FROM visits WHERE id = ?', ['visit-prearrival-old']);
    assert.equal(row.status, 'pending_approval');
  });
});
