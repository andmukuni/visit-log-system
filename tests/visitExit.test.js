import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isGateCheckoutEligible, getGateCheckoutActionLabel } from '../shared/visitCheckout.js';
import { getReceptionVisitAction } from '../shared/visitReceptionActions.js';
import { visitHasCheckedIn } from '../shared/visitCheckout.js';

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
