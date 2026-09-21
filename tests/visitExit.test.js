import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { isGateCheckoutEligible, getGateCheckoutActionLabel, isConfirmLeftEligible } from '../shared/visitCheckout.js';
import { getReceptionVisitAction } from '../shared/visitReceptionActions.js';
import { visitHasCheckedIn } from '../shared/visitCheckout.js';
import { createTestPool, seedFixture, seedHost, seedVisit, FIXTURE } from './helpers/pgMemHarness.js';
import { runMigrations } from '../server/migrations/index.js';
import { writeVisitEvent } from '../server/auditService.js';
import { shouldFinalizeReceptionCheckout, visitHadGateArrival } from '../server/visitExit.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

describe('visit lookup checkout purpose', () => {
  it('treats desk and queued-on-site guests as checkout-eligible', () => {
    assert.equal(isGateCheckoutEligible('waiting'), true);
    assert.equal(isGateCheckoutEligible({ status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' }), true);
    assert.equal(isGateCheckoutEligible('expected'), false);
  });
});

describe('gate checkout action labels', () => {
  it('uses a single checkout label for gate exit', () => {
    assert.equal(getGateCheckoutActionLabel('waiting').label, 'Check out');
    assert.equal(getGateCheckoutActionLabel('checked_out').label, 'Check out');
  });
});

describe('station pending approvals guard', () => {
  it('does not offer pre-arrival approve semantics for on-site queued guests', () => {
    assert.equal(visitHasCheckedIn({ status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' }), true);
    assert.equal(
      getReceptionVisitAction({ status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' }).href,
      '/reception/host-queue',
    );
  });
});

describe('reception confirm-left eligibility', () => {
  it('offers confirm-left only after desk checkout', () => {
    assert.equal(isConfirmLeftEligible('checked_out'), true);
    assert.equal(isConfirmLeftEligible('in_meeting'), false);
    assert.equal(getReceptionVisitAction('checked_out').actionKind, 'confirm-left');
  });
});

describe('reception finalize after checkout', () => {
  let pool;

  before(async () => {
    pool = await createTestPool();
    await runMigrations(pool);
    await seedFixture(pool);
    await seedHost(pool, { id: 'host-exit', userId: 'user-exit', zoneId: FIXTURE.zones.ceo });
  });

  it('finalizes reception-only visits with no gate arrival', async () => {
    await seedVisit(pool, {
      id: 'visit-desk-only',
      hostId: 'host-exit',
      zoneId: FIXTURE.zones.ceo,
      status: 'reception_check_in',
      checkedInAt: '2026-08-17T10:00:00',
    });

    assert.equal(await visitHadGateArrival(pool, 'visit-desk-only'), false);
    assert.equal(await shouldFinalizeReceptionCheckout(pool, 'visit-desk-only'), true);
  });

  it('completes the visit even when the guest arrived at a gate', async () => {
    await seedVisit(pool, {
      id: 'visit-via-gate',
      hostId: 'host-exit',
      zoneId: FIXTURE.zones.ceo,
      status: 'reception_check_in',
      checkedInAt: '2026-08-17T10:00:00',
    });
    await writeVisitEvent(pool, { visitId: 'visit-via-gate', eventType: 'arrived_at_gate' });

    assert.equal(await visitHadGateArrival(pool, 'visit-via-gate'), true);
    assert.equal(await shouldFinalizeReceptionCheckout(pool, 'visit-via-gate'), true);
  });
});
