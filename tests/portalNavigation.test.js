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
const ceoRole = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'ceo');
const ceoPerms = ceoRole?.permissions || [];

function hasPermissionFactory(permissions = []) {
  return (key) => permissionMatches(permissions, key);
}

describe('portal login routing', () => {
  it('treats CEO/DCEO calendar users as host-portal-scoped', () => {
    assert.equal(isExecutiveOnlyUser(EXECUTIVE_PORTAL_KEYS), true);
    assert.equal(isExecutiveOnlyUser(ceoPerms), true);
  });

  it('scopes host employees to the merged host portal only', () => {
    assert.equal(isExecutiveOnlyUser(hostEmployee), true);
  });

  it('routes executive users to the merged host calendar on login', () => {
    assert.equal(resolveDefaultHomeRoute(EXECUTIVE_PORTAL_KEYS), '/host');
    assert.equal(resolveLoginRedirect('/host/visitors', EXECUTIVE_PORTAL_KEYS), '/host');
    assert.equal(resolveLoginRedirect('/login', EXECUTIVE_PORTAL_KEYS), '/host');
    assert.equal(resolveLoginRedirect('/executive', EXECUTIVE_PORTAL_KEYS), '/host');
  });

  it('routes host employees to /host calendar dashboard', () => {
    assert.equal(resolveDefaultHomeRoute(hostEmployee), '/host');
    assert.equal(resolveLoginRedirect('/host', hostEmployee), '/host');
    assert.equal(
      resolvePrimaryPortal(hasPermissionFactory(hostEmployee), hostEmployee),
      'host',
    );
  });

  it('preserves deep links for non-calendar portal users', () => {
    const adminPerms = ['admin.dashboard', 'admin.visitors'];
    assert.equal(resolveLoginRedirect('/admin/visitors', adminPerms), '/admin/visitors');
    assert.equal(resolveLoginRedirect('/login', adminPerms), '/admin');
  });
});
