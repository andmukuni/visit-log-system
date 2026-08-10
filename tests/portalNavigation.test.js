import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADMIN_ROLES,
  EXECUTIVE_PORTAL_KEYS,
  permissionMatches,
} from '../shared/rbacPermissions.js';
import {
  isExecutiveOnlyUser,
  resolveDefaultHomeRoute,
  resolveLoginRedirect,
  resolvePrimaryPortal,
} from '../shared/portalNavigation.js';

const hostRole = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'host');
const hostEmployee = hostRole?.permissions || [];

function hasPermissionFactory(permissions = []) {
  return (key) => permissionMatches(permissions, key);
}

describe('portal login routing', () => {
  it('treats CEO/DCEO as executive-only users', () => {
    assert.equal(isExecutiveOnlyUser(EXECUTIVE_PORTAL_KEYS), true);
  });

  it('does not treat host employees with calendar access as executive-only', () => {
    assert.equal(isExecutiveOnlyUser(hostEmployee), false);
  });

  it('routes executive users to their calendar dashboard on login', () => {
    assert.equal(resolveDefaultHomeRoute(EXECUTIVE_PORTAL_KEYS), '/executive');
    assert.equal(resolveLoginRedirect('/host/visitors', EXECUTIVE_PORTAL_KEYS), '/executive');
    assert.equal(resolveLoginRedirect('/login', EXECUTIVE_PORTAL_KEYS), '/executive');
  });

  it('routes host employees with calendar access to /executive', () => {
    assert.equal(resolveDefaultHomeRoute(hostEmployee), '/executive');
    assert.equal(resolveLoginRedirect('/host', hostEmployee), '/executive');
    assert.equal(
      resolvePrimaryPortal(hasPermissionFactory(hostEmployee), hostEmployee),
      'executive',
    );
  });

  it('preserves deep links for non-calendar portal users', () => {
    const adminPerms = ['admin.dashboard', 'admin.visitors'];
    assert.equal(resolveLoginRedirect('/admin/visitors', adminPerms), '/admin/visitors');
    assert.equal(resolveLoginRedirect('/login', adminPerms), '/admin');
  });
});
