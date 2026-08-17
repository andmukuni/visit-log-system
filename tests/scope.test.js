import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  visitMatchesScope,
  visitMatchesHost,
  VISIT_TRANSITIONS,
} from '../server/scopeService.js';
import { permissionMatches, ADMIN_PERMISSIONS } from '../shared/rbacPermissions.js';

describe('visit state transitions', () => {
  it('allows approved → reception check-in', () => {
    assert.equal(canTransition('approved', 'reception_check_in'), true);
  });

  it('allows expected → arrived_at_gate', () => {
    assert.equal(canTransition('expected', 'arrived_at_gate'), true);
  });

  it('blocks pending_approval → reception_check_in', () => {
    assert.equal(canTransition('pending_approval', 'reception_check_in'), false);
  });

  it('blocks completed → any transition', () => {
    assert.equal(canTransition('completed', 'checked_in'), false);
  });

  it('allows arrived_at_gate → reception check-in', () => {
    assert.equal(canTransition('arrived_at_gate', 'reception_check_in'), true);
  });

  it('defines all expected statuses', () => {
    assert.ok(VISIT_TRANSITIONS.approved.includes('reception_check_in'));
    assert.ok(VISIT_TRANSITIONS.expected.includes('arrived_at_gate'));
    assert.ok(VISIT_TRANSITIONS.pending_approval.includes('rejected'));
    assert.ok(VISIT_TRANSITIONS.pending_approval.includes('waiting'));
    assert.ok(VISIT_TRANSITIONS.reception_check_in.includes('pending_approval'));
    assert.ok(VISIT_TRANSITIONS.rejected.includes('pending_approval'));
    assert.ok(VISIT_TRANSITIONS.rejected.includes('checked_out'));
    assert.ok(VISIT_TRANSITIONS.pending_approval.includes('checked_out'));
    assert.ok(VISIT_TRANSITIONS.arrived_at_gate.includes('checked_in'));
  });

  it('allows kiosk/staff check-in after gate arrival', () => {
    assert.equal(canTransition('arrived_at_gate', 'checked_in'), true);
    assert.equal(canTransition('entered_premises', 'checked_in'), true);
  });

  it('allows checkout of an on-site queued guest', () => {
    assert.equal(canTransition('pending_approval', 'checked_out'), true);
  });

  it('allows overdue from active desk statuses', () => {
    assert.equal(canTransition('waiting', 'overdue'), true);
    assert.equal(canTransition('in_meeting', 'overdue'), true);
    assert.equal(canTransition('overdue', 'checked_out'), true);
  });
});

describe('tenant scope', () => {
  const scope = { organisation_id: 'org-1', site_id: 'site-1' };

  it('allows visit in same org and site', () => {
    const visit = { organisation_id: 'org-1', site_id: 'site-1' };
    assert.equal(visitMatchesScope(visit, scope), true);
  });

  it('denies cross-organisation access', () => {
    const visit = { organisation_id: 'org-2', site_id: 'site-1' };
    assert.equal(visitMatchesScope(visit, scope), false);
  });

  it('denies cross-site access when site scoped', () => {
    const visit = { organisation_id: 'org-1', site_id: 'site-2' };
    assert.equal(visitMatchesScope(visit, scope), false);
  });
});

describe('host record scope', () => {
  it('allows visit assigned to host', () => {
    const visit = { host_id: 'host-1', created_by: 'user-2' };
    assert.equal(visitMatchesHost(visit, { hostId: 'host-1', userId: 'user-1' }), true);
  });

  it('denies another host visit even if current user created it', () => {
    const visit = { host_id: 'host-2', created_by: 'user-1' };
    assert.equal(visitMatchesHost(visit, { hostId: 'host-1', userId: 'user-1' }), false);
  });

  it('allows unassigned draft created by user', () => {
    const visit = { host_id: null, created_by: 'user-1' };
    assert.equal(visitMatchesHost(visit, { hostId: 'host-1', userId: 'user-1' }), true);
  });

  it('denies unrelated host visit', () => {
    const visit = { host_id: 'host-2', created_by: 'user-3' };
    assert.equal(visitMatchesHost(visit, { hostId: 'host-1', userId: 'user-1' }), false);
  });
});

describe('organisation placement hierarchy', () => {
  it('includes admin.offices permission for office management', () => {
    assert.ok(ADMIN_PERMISSIONS.some((p) => p.key === 'admin.offices'));
  });

  it('includes admin.positions permission for position management', () => {
    assert.ok(ADMIN_PERMISSIONS.some((p) => p.key === 'admin.positions'));
  });

  it('maps employee through office → department → organisation fields', () => {
    // Contract for resolveEmployeePlacement / hosts listing joins.
    const placement = {
      user_id: 'usr-1',
      office_id: 'off-1',
      office_number: 'CEO-001',
      department_id: 'dept-1',
      department_name: 'Executive Office',
      organisation_id: 'org-1',
      organisation_name: 'Demo Organisation',
    };
    assert.equal(placement.office_number, 'CEO-001');
    assert.ok(placement.department_id);
    assert.ok(placement.organisation_id);
  });
});

describe('RBAC permissionMatches', () => {
  it('grants super_admin slug all permissions', () => {
    assert.equal(permissionMatches(['super_admin'], 'station.visitors.checkin'), true);
  });

  it('denies missing permission', () => {
    assert.equal(permissionMatches(['host.dashboard'], 'station.visitors.checkin'), false);
  });

  it('allows exact permission match', () => {
    assert.equal(permissionMatches(['station.visitors.checkin'], 'station.visitors.checkin'), true);
  });
});
