import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, seedFixture, seedHost, seedVisit, FIXTURE } from './helpers/pgMemHarness.js';
import { runMigrations } from '../server/migrations/index.js';
import { markOverdueVisits, DEFAULT_VISIT_DURATION_MINUTES } from '../server/visitOverdue.js';
import { canTransition } from '../server/scopeService.js';
import { isCheckoutEligible } from '../shared/visitCheckout.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

let pool;

before(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  await seedFixture(pool);
  await seedHost(pool, { id: 'host-overdue', userId: 'user-overdue', zoneId: FIXTURE.zones.ceo });
});

describe('markOverdueVisits', () => {
  it('marks a checked-in guest overdue after category duration elapses', async () => {
    const past = new Date(Date.now() - (DEFAULT_VISIT_DURATION_MINUTES + 5) * 60_000).toISOString();
    await seedVisit(pool, {
      id: 'visit-overdue-waiting',
      hostId: 'host-overdue',
      zoneId: FIXTURE.zones.ceo,
      status: 'waiting',
      checkedInAt: past,
    });

    const result = await markOverdueVisits(pool, { organisationId: FIXTURE.orgId });
    assert.equal(result.marked, 1);

    const [[row]] = await pool.query('SELECT status FROM visits WHERE id = ?', ['visit-overdue-waiting']);
    assert.equal(row.status, 'overdue');
  });

  it('does not mark pre-arrival pending_approval without checked_in_at', async () => {
    await seedVisit(pool, {
      id: 'visit-pending-booking',
      hostId: 'host-overdue',
      zoneId: FIXTURE.zones.ceo,
      status: 'pending_approval',
    });

    const result = await markOverdueVisits(pool, { organisationId: FIXTURE.orgId });
    const [[row]] = await pool.query('SELECT status FROM visits WHERE id = ?', ['visit-pending-booking']);
    assert.equal(row.status, 'pending_approval');
    assert.ok(result.marked >= 0);
  });
});

describe('overdue lifecycle helpers', () => {
  it('allows checkout and transition from overdue', () => {
    assert.equal(canTransition('waiting', 'overdue'), true);
    assert.equal(canTransition('overdue', 'checked_out'), true);
    assert.equal(isCheckoutEligible('overdue'), true);
  });
});
