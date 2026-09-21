import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, seedFixture, seedHost, seedVisit, FIXTURE } from './helpers/pgMemHarness.js';
import { runMigrations } from '../server/migrations/index.js';
import { markExpiredVisits } from '../server/visitExpire.js';
import { canTransition } from '../server/scopeService.js';
import { isCancelEligible } from '../shared/visitCancel.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

let pool;

before(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  await seedFixture(pool);
  await seedHost(pool, { id: 'host-expire', userId: 'user-expire', zoneId: FIXTURE.zones.ceo });
});

describe('markExpiredVisits', () => {
  it('expires an expected visit whose window has passed', async () => {
    await seedVisit(pool, {
      id: 'visit-expire-past',
      hostId: 'host-expire',
      zoneId: FIXTURE.zones.ceo,
      status: 'expected',
      expectedAt: '2020-01-01T09:00:00',
    });

    const result = await markExpiredVisits(pool, { organisationId: FIXTURE.orgId });
    assert.ok(result.expired >= 1);

    const [[row]] = await pool.query('SELECT status FROM visits WHERE id = ?', ['visit-expire-past']);
    assert.equal(row.status, 'expired');
  });

  it('does not expire a future expected visit', async () => {
    await seedVisit(pool, {
      id: 'visit-expire-future',
      hostId: 'host-expire',
      zoneId: FIXTURE.zones.ceo,
      status: 'expected',
      expectedAt: '2099-01-01T09:00:00',
    });

    await markExpiredVisits(pool, { organisationId: FIXTURE.orgId });
    const [[row]] = await pool.query('SELECT status FROM visits WHERE id = ?', ['visit-expire-future']);
    assert.equal(row.status, 'expected');
  });

  it('does not expire an on-site visit', async () => {
    await seedVisit(pool, {
      id: 'visit-expire-onsite',
      hostId: 'host-expire',
      zoneId: FIXTURE.zones.ceo,
      status: 'expected',
      expectedAt: '2020-01-01T09:00:00',
      checkedInAt: '2020-01-01T09:05:00',
    });

    await markExpiredVisits(pool, { organisationId: FIXTURE.orgId });
    const [[row]] = await pool.query('SELECT status FROM visits WHERE id = ?', ['visit-expire-onsite']);
    assert.equal(row.status, 'expected');
  });
});

describe('cancel eligibility', () => {
  it('allows cancel only for pre-arrival bookings', () => {
    assert.equal(isCancelEligible('expected'), true);
    assert.equal(isCancelEligible('approved'), true);
    assert.equal(isCancelEligible('pending_approval'), true);
    assert.equal(isCancelEligible({ status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' }), false);
    assert.equal(isCancelEligible('reception_check_in'), false);
    assert.equal(canTransition('expected', 'cancelled'), true);
    assert.equal(canTransition('approved', 'cancelled'), true);
    assert.equal(canTransition('pre_registered', 'cancelled'), true);
  });
});
