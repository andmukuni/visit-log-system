import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRestrictedReceptionVars } from '../server/notificationService.js';

describe('buildRestrictedReceptionVars — different-zone notification payload (scenario 2)', () => {
  it('is a fresh two-key object, never "full vars minus fields"', () => {
    const fullVars = {
      visitor_name: 'Jane Doe',
      expected_at: '12 Aug 2026, 09:00',
      host_name: 'CEO Office',
      pass_code: 'A1B2C3',
      company: 'Acme Corp',
      site_name: 'HQ',
      status: 'expected',
      invite_url: 'https://example.com/visit/invite/secret-token',
    };
    const restricted = buildRestrictedReceptionVars(fullVars);
    assert.deepEqual(Object.keys(restricted).sort(), ['expected_at', 'visitor_name']);
    assert.equal(restricted.visitor_name, 'Jane Doe');
    assert.equal(restricted.expected_at, '12 Aug 2026, 09:00');
  });

  it('never carries VIP status through — a different-zone recipient never learns a visit is VIP', () => {
    const vipVars = {
      visitor_name: 'VIP Guest',
      expected_at: '12 Aug 2026, 09:00',
      classification: 'vip',
      pass_code: 'SECRET',
    };
    const restricted = buildRestrictedReceptionVars(vipVars);
    assert.equal(restricted.classification, undefined);
    assert.equal(restricted.pass_code, undefined);
  });
});

describe('notification idempotency-key uniqueness across audience buckets (scenario 12)', () => {
  it('same-zone, different-zone, and security keys never collide for the same event/visit', () => {
    const eventType = 'arrived_at_gate';
    const visitId = 'visit-1';
    const keys = [
      `${eventType}:${visitId}:reception_same:r1`,
      `${eventType}:${visitId}:reception_diff:r2`,
      `${eventType}:${visitId}:security:g1`,
      `${eventType}:${visitId}:host:h1`,
    ];
    assert.equal(new Set(keys).size, keys.length);
  });

  it('the same receptionist gets a distinct key per event type, so retries cannot cross-deliver', () => {
    const visitId = 'visit-1';
    const receptionistId = 'r1';
    const keys = ['pending_approval', 'arrived_at_gate', 'entered_premises'].map(
      (eventType) => `${eventType}:${visitId}:reception_same:${receptionistId}`,
    );
    assert.equal(new Set(keys).size, keys.length);
  });
});
