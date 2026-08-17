import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateVisitAccess,
  applyVisitAccessPolicy,
  applyVisitAccessPolicyToRows,
} from '../server/visitorAccessPolicy.js';
import {
  buildFullExpectedVisitorDTO,
  buildRestrictedExpectedVisitorDTO,
  buildSecurityExpectedVisitorDTO,
} from '../server/visitorDto.js';

function viewer(overrides = {}) {
  return {
    userId: 'u1',
    permissions: [],
    isElevated: false,
    scope: { organisation_id: 'org1' },
    hostContext: null,
    receptionContext: null,
    securityContext: null,
    ...overrides,
  };
}

function visit(overrides = {}) {
  return {
    id: 'visit-1',
    organisation_id: 'org1',
    host_id: 'host-1',
    created_by: 'u1',
    full_name: 'Jane Doe',
    phone: '+260971111111',
    email: 'jane@example.com',
    company: 'Acme',
    purpose: 'Business meeting',
    status: 'expected',
    expected_at: '2026-08-12T09:00:00Z',
    classification: 'standard',
    invite_token: 'secret-token',
    check_in_signature: 'base64sig',
    ...overrides,
  };
}

describe('evaluateVisitAccess — precedence matrix (scenarios 1-6, 9, 10, 13)', () => {
  it('denies cross-tenant visits outright (scenario 13)', () => {
    const decision = evaluateVisitAccess(viewer(), visit({ organisation_id: 'other-org' }));
    assert.equal(decision.level, 'denied');
    assert.equal(decision.reason, 'cross_tenant');
  });

  it('elevated/super-admin always gets full access', () => {
    const decision = evaluateVisitAccess(viewer({ isElevated: true }), visit());
    assert.equal(decision.level, 'full');
    assert.equal(decision.reason, 'elevated');
  });

  it('host owner gets full access to their own visit (scenario 10, positive case)', () => {
    const decision = evaluateVisitAccess(
      viewer({ hostContext: { hostId: 'host-1', userId: 'u1' } }),
      visit({ host_id: 'host-1' }),
    );
    assert.equal(decision.level, 'full');
    assert.equal(decision.reason, 'host_owner');
  });

  it('a role alone never grants access — host must own the visit (scenario 10, negative case)', () => {
    const decision = evaluateVisitAccess(
      viewer({ hostContext: { hostId: 'host-2', userId: 'u2' } }),
      visit({ host_id: 'host-1', created_by: 'someone-else' }),
    );
    assert.equal(decision.level, 'denied');
    assert.equal(decision.reason, 'no_relationship');
  });

  it('receptionist with matching zone gets full access (scenario 1, 3, 4)', () => {
    const decision = evaluateVisitAccess(
      viewer({ receptionContext: { receptionistId: 'r1', zoneIds: ['zone-ceo'] } }),
      visit(),
      { visitZoneMatch: true },
    );
    assert.equal(decision.level, 'full');
    assert.equal(decision.reason, 'zone_match');
  });

  it('receptionist with no zone match gets restricted, not denied (scenario 2)', () => {
    const decision = evaluateVisitAccess(
      viewer({ receptionContext: { receptionistId: 'r1', zoneIds: ['zone-dceo'] } }),
      visit(),
      { visitZoneMatch: false },
    );
    assert.equal(decision.level, 'restricted');
    assert.equal(decision.reason, 'zone_mismatch');
  });

  it('a host with no resolvable zone is always restricted for reception, never full (scenario 6 fail-safe)', () => {
    const decision = evaluateVisitAccess(
      viewer({ receptionContext: { receptionistId: 'r1', zoneIds: ['zone-a', 'zone-b'] } }),
      visit({ zone_id: null }),
      { visitZoneMatch: false }, // caller can never compute true when the host has no zone
    );
    assert.equal(decision.level, 'restricted');
  });

  it('security officer within scope gets the gate view (scenario 8)', () => {
    const decision = evaluateVisitAccess(
      viewer({ securityContext: { guardId: 'g1', siteId: 'site1' } }),
      visit(),
      { securityMatches: true },
    );
    assert.equal(decision.level, 'gate');
  });

  it('security officer outside scope is denied — visit does not appear at all (scenario 9)', () => {
    const decision = evaluateVisitAccess(
      viewer({ securityContext: { guardId: 'g1', siteId: 'site1' } }),
      visit(),
      { securityMatches: false },
    );
    assert.equal(decision.level, 'denied');
    assert.equal(decision.reason, 'security_scope_mismatch');
  });

  it('a viewer with no applicable relationship is denied by default', () => {
    const decision = evaluateVisitAccess(viewer(), visit({ host_id: 'someone-else', created_by: 'nope' }));
    assert.equal(decision.level, 'denied');
    assert.equal(decision.reason, 'no_relationship');
  });
});

describe('buildRestrictedExpectedVisitorDTO — strict allowlist (scenario 2, 11)', () => {
  const FORBIDDEN_FIELDS = [
    'phone', 'email', 'address', 'id_number', 'id_number_masked', 'company',
    'job_title', 'purpose', 'status', 'classification', 'host_id', 'host_name',
    'pass_code', 'badge_number', 'zone_id', 'zone_name', 'site_id', 'site_name',
    'invite_token', 'check_in_signature', 'confidential_notes', 'title',
  ];

  it('never leaks any forbidden field, whatever the source row contains', () => {
    const dto = buildRestrictedExpectedVisitorDTO(visit());
    for (const field of FORBIDDEN_FIELDS) {
      assert.equal(dto[field], undefined, `restricted DTO must not include "${field}"`);
    }
  });

  it('keeps only id, visitor name, expected time, and access metadata', () => {
    const dto = buildRestrictedExpectedVisitorDTO(visit());
    assert.equal(dto.id, 'visit-1');
    assert.equal(dto.full_name, 'Jane Doe');
    assert.equal(dto.expected_at, '2026-08-12T09:00:00Z');
    assert.equal(dto._accessLevel, 'restricted');
    assert.equal(dto._restrictedReason, 'zone_mismatch');
  });

  it('preserves whichever name/time key the source row used (visitor_name / scheduled_at)', () => {
    const dto = buildRestrictedExpectedVisitorDTO({ id: 'v2', visitor_name: 'Sam Lee', scheduled_at: '2026-08-12T10:00:00Z' });
    assert.equal(dto.visitor_name, 'Sam Lee');
    assert.equal(dto.scheduled_at, '2026-08-12T10:00:00Z');
    assert.equal(dto.full_name, undefined);
    assert.equal(dto.expected_at, undefined);
  });
});

describe('buildFullExpectedVisitorDTO', () => {
  it('excludes invite_token and check_in_signature by default', () => {
    const dto = buildFullExpectedVisitorDTO(visit());
    assert.equal(dto.invite_token, undefined);
    assert.equal(dto.check_in_signature, undefined);
    assert.equal(dto._accessLevel, 'full');
    assert.equal(dto.full_name, 'Jane Doe');
    assert.equal(dto.phone, '+260971111111');
  });

  it('includes invite_token/check_in_signature only when explicitly requested', () => {
    const dto = buildFullExpectedVisitorDTO(visit(), { includeInviteToken: true, includeCheckInSignature: true });
    assert.equal(dto.invite_token, 'secret-token');
    assert.equal(dto.check_in_signature, 'base64sig');
  });
});

describe('buildSecurityExpectedVisitorDTO — gate operational view', () => {
  it('never includes phone/email/company/id_number even if present on the row', () => {
    const dto = buildSecurityExpectedVisitorDTO(visit());
    assert.equal(dto.phone, undefined);
    assert.equal(dto.email, undefined);
    assert.equal(dto.company, undefined);
    assert.equal(dto.id_number, undefined);
    assert.equal(dto._accessLevel, 'gate');
  });

  it('includes masked identity and check-in signature for gate checkout', () => {
    const dto = buildSecurityExpectedVisitorDTO({
      ...visit(),
      id_type: 'nrc',
      id_number: '123456/78/9',
      id_number_masked: '12****/78/9',
      check_in_signature: 'data:image/png;base64,abc',
    });
    assert.equal(dto.id_type, 'nrc');
    assert.equal(dto.id_number_masked, '12****/78/9');
    assert.equal(dto.check_in_signature, 'data:image/png;base64,abc');
    assert.equal(dto.id_number, undefined);
  });

  it('derives masked NRC when only contact-detail id_number is present', () => {
    const dto = buildSecurityExpectedVisitorDTO({
      ...visit(),
      id_type: 'nrc',
      id_number: '123456/78/9',
    });
    assert.equal(dto.id_number_masked, '12****/78/9');
    assert.equal(dto.id_number, undefined);
  });
});

describe('applyVisitAccessPolicy — precedence rule (VIP masking runs only inside full/gate)', () => {
  it('a cross-zone VIP visit ends up restricted — VIP masking never even runs', () => {
    const vipVisit = visit({ classification: 'vip' });
    const result = applyVisitAccessPolicy(
      vipVisit,
      viewer({ receptionContext: { receptionistId: 'r1', zoneIds: ['zone-x'] } }),
      { visitZoneMatch: false },
    );
    assert.equal(result._accessLevel, 'restricted');
    assert.equal(result.phone, undefined);
    assert.equal(result.classification, undefined);
  });

  it('a same-zone VIP visit still gets VIP-masked before allowlisting when caller lacks full-contact permission', () => {
    const vipVisit = visit({ classification: 'vip' });
    const result = applyVisitAccessPolicy(
      vipVisit,
      viewer({ receptionContext: { receptionistId: 'r1', zoneIds: ['zone-x'] }, permissions: [] }),
      { visitZoneMatch: true },
    );
    assert.equal(result._accessLevel, 'full');
    assert.notEqual(result.phone, '+260971111111'); // masked, not raw
  });

  it('denied rows return null and are dropped from list results', () => {
    const result = applyVisitAccessPolicy(visit({ organisation_id: 'other-org' }), viewer(), {});
    assert.equal(result, null);

    const rows = applyVisitAccessPolicyToRows(
      [visit(), visit({ id: 'v2', organisation_id: 'other-org' })],
      viewer({ hostContext: { hostId: 'host-1', userId: 'u1' } }),
      {},
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'visit-1');
  });
});
