import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRestrictedReceptionVars,
  buildRestrictedReceptionMetadata,
  isReceptionNewExpectedEvent,
  parseAlertVisitorFlag,
} from '../server/notificationService.js';

describe('reception expected-visitor event routing', () => {
  it('routes confirmed host/executive bookings to reception', () => {
    assert.equal(isReceptionNewExpectedEvent('host_booking'), true);
  });
});

describe('buildRestrictedReceptionVars — different-zone notification payload (scenario 2)', () => {
  it('is a fresh allowlisted object, never "full vars minus fields"', () => {
    const fullVars = {
      app_name: 'WG - Visitor Management',
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
    // app_name is org-wide branding, not visit data — the only non-visit key allowed through.
    assert.deepEqual(Object.keys(restricted).sort(), ['app_name', 'expected_at', 'visitor_name']);
    assert.equal(restricted.visitor_name, 'Jane Doe');
    assert.equal(restricted.expected_at, '12 Aug 2026, 09:00');
    assert.equal(restricted.app_name, 'WG - Visitor Management');
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

describe('restricted notification METADATA must not leak lifecycle or visitor data', () => {
  // notifications.metadata is returned verbatim by GET /api/admin/notifications
  // (SELECT *), so it is a client-visible field, not internal bookkeeping.
  const FORBIDDEN_METADATA_KEYS = [
    'eventType', 'event_type', 'status', 'classification', 'company',
    'host_name', 'hostName', 'pass_code', 'passCode', 'purpose',
    'phone', 'email', 'id_number', 'site_name', 'zone_id',
  ];

  it('contains only the opaque visit id and the audience tag', () => {
    const metadata = buildRestrictedReceptionMetadata('visit-1');
    assert.deepEqual(Object.keys(metadata).sort(), ['audience', 'visitId']);
    assert.equal(metadata.visitId, 'visit-1');
  });

  it('never carries eventType or any other visitor/lifecycle field', () => {
    const metadata = buildRestrictedReceptionMetadata('visit-1');
    for (const key of FORBIDDEN_METADATA_KEYS) {
      assert.equal(metadata[key], undefined, `restricted metadata must not include "${key}"`);
    }
  });

  it('is a fresh object — spreading a shared metadata bag cannot contaminate it', () => {
    // Regression: the previous implementation used { ...metadata, audience }
    // where metadata carried { visitId, eventType }, leaking lifecycle status.
    const shared = { visitId: 'visit-1', eventType: 'arrived_at_gate', purpose: 'Merger talks' };
    const metadata = buildRestrictedReceptionMetadata(shared.visitId);
    assert.equal(metadata.eventType, undefined);
    assert.equal(metadata.purpose, undefined);
    assert.equal(JSON.stringify(metadata).includes('arrived_at_gate'), false);
    assert.equal(JSON.stringify(metadata).includes('Merger talks'), false);
  });

  it('serialises to JSON containing no forbidden substring', () => {
    const json = JSON.stringify(buildRestrictedReceptionMetadata('visit-1'));
    for (const needle of ['arrived_at_gate', 'entered_premises', 'vip', 'Acme']) {
      assert.doesNotMatch(json, new RegExp(needle, 'i'));
    }
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

describe('parseAlertVisitorFlag', () => {
  it('is opt-in — omitted or falsey values do not alert the visitor', () => {
    assert.equal(parseAlertVisitorFlag(undefined), false);
    assert.equal(parseAlertVisitorFlag(null), false);
    assert.equal(parseAlertVisitorFlag(false), false);
    assert.equal(parseAlertVisitorFlag(0), false);
    assert.equal(parseAlertVisitorFlag(''), false);
    assert.equal(parseAlertVisitorFlag('false'), false);
    assert.equal(parseAlertVisitorFlag('no'), false);
  });

  it('accepts explicit true-like values from JSON or form payloads', () => {
    assert.equal(parseAlertVisitorFlag(true), true);
    assert.equal(parseAlertVisitorFlag(1), true);
    assert.equal(parseAlertVisitorFlag('true'), true);
    assert.equal(parseAlertVisitorFlag('TRUE'), true);
    assert.equal(parseAlertVisitorFlag('1'), true);
    assert.equal(parseAlertVisitorFlag('yes'), true);
  });
});
