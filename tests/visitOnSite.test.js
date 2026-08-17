import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOST_OCCUPIED_STATUSES,
  isVisitPhysicallyOnSite,
  visitOnSitePredicate,
} from '../shared/visitOnSite.js';
import {
  isCheckoutEligible,
  isGateCheckoutEligible,
  isGateExitEligible,
} from '../shared/visitCheckout.js';

describe('visit on-site occupancy', () => {
  it('inlines statuses so zone_match bind order stays stable', () => {
    const sql = visitOnSitePredicate('vis');
    assert.equal(sql.includes('?'), false);
    assert.match(sql, /vis\.status IN \('reception_check_in', 'checked_in', 'waiting', 'in_meeting', 'overdue', 'arrived_at_gate', 'entered_premises'\)/);
    assert.match(sql, /pending_approval/);
    assert.match(sql, /rejected/);
    assert.match(sql, /checked_in_at IS NOT NULL/);
  });

  it('does not treat pre-arrival pending_approval as on site', () => {
    assert.equal(isVisitPhysicallyOnSite({ status: 'pending_approval' }), false);
    assert.equal(isVisitPhysicallyOnSite({ status: 'pending_approval', checked_in_at: null }), false);
    assert.equal(isVisitPhysicallyOnSite({ status: 'expected' }), false);
  });

  it('counts desk, gate, and queued-on-site guests', () => {
    assert.equal(isVisitPhysicallyOnSite({ status: 'waiting' }), true);
    assert.equal(isVisitPhysicallyOnSite({ status: 'arrived_at_gate' }), true);
    assert.equal(isVisitPhysicallyOnSite({ status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' }), true);
    assert.equal(isVisitPhysicallyOnSite({ status: 'rejected', checked_in_at: '2026-08-17T10:00:00Z' }), true);
    assert.equal(
      isVisitPhysicallyOnSite({ status: 'arrived_at_gate' }, { includeGate: false }),
      false,
    );
    assert.equal(
      isVisitPhysicallyOnSite(
        { status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' },
        { includeGate: false },
      ),
      true,
    );
  });

  it('marks a host occupied for desk guests and on-site pending_approval only', () => {
    for (const status of ['waiting', 'in_meeting', 'reception_check_in', 'checked_in']) {
      assert.ok(HOST_OCCUPIED_STATUSES.includes(status));
    }
    const sql = visitOnSitePredicate('vis', { hostOccupied: true });
    assert.match(sql, /pending_approval/);
    assert.equal(sql.includes('rejected'), false);
    assert.equal(HOST_OCCUPIED_STATUSES.includes('checked_out'), false);
  });
});

describe('on-site checkout and gate exit eligibility', () => {
  const queuedOnSite = { status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' };

  it('lets reception check out a guest still waiting on host approval', () => {
    assert.equal(isCheckoutEligible('pending_approval'), false);
    assert.equal(isCheckoutEligible(queuedOnSite), true);
    assert.equal(isGateCheckoutEligible(queuedOnSite), true);
    assert.equal(isGateExitEligible(queuedOnSite), true);
  });

  it('keeps checked_out visits on the gate exit list', () => {
    assert.equal(isGateExitEligible('checked_out'), true);
    assert.equal(isGateCheckoutEligible('checked_out'), false);
  });
});
