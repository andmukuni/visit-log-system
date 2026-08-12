import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADMIN_ROLES,
  EXECUTIVE_PORTAL_KEYS,
  permissionMatches,
  RECEPTION_KEYS,
} from '../shared/rbacPermissions.js';
import {
  canAccessPortal,
  canUsePortalSwitcher,
  getAccessiblePortals,
  isExecutiveOnlyUser,
  isHostOnlyUser,
  isHostPortalPath,
  isPortalLockExemptPath,
  isReceptionOnlyUser,
  isReceptionPortalPath,
  resolveDefaultHomeRoute,
  resolveLoginRedirect,
  resolvePrimaryPortal,
} from '../shared/portalNavigation.js';

const hostRole = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'host');
const hostEmployee = hostRole?.permissions || [];
const ceoRole = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'ceo');
const ceoPerms = ceoRole?.permissions || [];
const receptionPerms = RECEPTION_KEYS;
const executiveReceptionPerms = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'executive_reception')?.permissions || [];
const securityManagerPerms = DEFAULT_ADMIN_ROLES.find((role) => role.slug === 'security_manager')?.permissions || [];

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
    assert.equal(resolveLoginRedirect('/host/visitors', EXECUTIVE_PORTAL_KEYS), '/host/visitors');
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

  it('routes main reception users to the reception calendar', () => {
    assert.equal(resolveDefaultHomeRoute(receptionPerms), '/reception/calendar');
    assert.equal(resolveLoginRedirect('/login', receptionPerms), '/reception/calendar');
    assert.equal(
      resolvePrimaryPortal(hasPermissionFactory(receptionPerms), receptionPerms),
      'reception',
    );
  });

  it('routes executive reception to reception, not host', () => {
    assert.equal(isExecutiveOnlyUser(executiveReceptionPerms), false);
    assert.equal(isReceptionOnlyUser(executiveReceptionPerms), true);
    assert.equal(isHostOnlyUser(executiveReceptionPerms), false);
    assert.equal(resolveDefaultHomeRoute(executiveReceptionPerms), '/reception/calendar');
    assert.equal(resolveLoginRedirect('/login', executiveReceptionPerms), '/reception/calendar');
    assert.equal(
      resolveLoginRedirect('/reception/check-in', executiveReceptionPerms),
      '/reception/check-in',
    );
    assert.equal(
      resolvePrimaryPortal(hasPermissionFactory(executiveReceptionPerms), executiveReceptionPerms),
      'reception',
    );
    assert.equal(
      canAccessPortal('host', hasPermissionFactory(executiveReceptionPerms), executiveReceptionPerms),
      false,
    );
    assert.deepEqual(
      getAccessiblePortals(hasPermissionFactory(executiveReceptionPerms), executiveReceptionPerms),
      [],
    );
  });

  it('routes security managers to the security portal', () => {
    assert.equal(isExecutiveOnlyUser(securityManagerPerms), false);
    assert.equal(resolveDefaultHomeRoute(securityManagerPerms), '/security');
    assert.equal(resolveLoginRedirect('/login', securityManagerPerms), '/security');
    assert.equal(
      resolvePrimaryPortal(hasPermissionFactory(securityManagerPerms), securityManagerPerms),
      'security',
    );
  });

  it('preserves deep links for non-calendar portal users', () => {
    const adminPerms = ['admin.dashboard', 'admin.visitors'];
    assert.equal(resolveLoginRedirect('/admin/visitors', adminPerms), '/admin/visitors');
    assert.equal(resolveLoginRedirect('/login', adminPerms), '/admin');
  });

  it('keeps host and reception portals fully isolated', () => {
    assert.equal(isHostOnlyUser(hostEmployee), true);
    assert.equal(isReceptionOnlyUser(receptionPerms), true);
    assert.equal(canAccessPortal('reception', hasPermissionFactory(hostEmployee), hostEmployee), false);
    assert.equal(canAccessPortal('host', hasPermissionFactory(receptionPerms), receptionPerms), false);
    assert.deepEqual(getAccessiblePortals(hasPermissionFactory(hostEmployee), hostEmployee), []);
    assert.deepEqual(getAccessiblePortals(hasPermissionFactory(receptionPerms), receptionPerms), []);
  });

  it('shows the portal switcher only for admin (or platform) users', () => {
    const adminPerms = ['admin.dashboard', 'admin.visitors', 'reception.dashboard', 'host.dashboard'];
    const mixedDeskPerms = [...receptionPerms, 'host.dashboard', 'host.invite'];

    assert.equal(canUsePortalSwitcher(adminPerms), true);
    assert.equal(canUsePortalSwitcher(['platform.dashboard']), true);
    assert.equal(canUsePortalSwitcher(receptionPerms), false);
    assert.equal(canUsePortalSwitcher(hostEmployee), false);
    assert.equal(canUsePortalSwitcher(mixedDeskPerms), false);
    assert.equal(canUsePortalSwitcher(securityManagerPerms), false);

    assert.ok(getAccessiblePortals(hasPermissionFactory(adminPerms), adminPerms).length > 0);
    assert.deepEqual(getAccessiblePortals(hasPermissionFactory(mixedDeskPerms), mixedDeskPerms), []);
    assert.deepEqual(
      getAccessiblePortals(hasPermissionFactory(securityManagerPerms), securityManagerPerms),
      [],
    );
  });

  it('locks reception-only users out of every non-reception route', () => {
    assert.equal(isReceptionPortalPath('/reception'), true);
    assert.equal(isReceptionPortalPath('/reception/calendar'), true);
    assert.equal(isReceptionPortalPath('/host'), false);
    assert.equal(isReceptionPortalPath('/admin/receptionists'), false);
    assert.equal(isReceptionPortalPath('/security'), false);

    assert.equal(resolveLoginRedirect('/host', receptionPerms), '/reception/calendar');
    assert.equal(resolveLoginRedirect('/admin', receptionPerms), '/reception/calendar');
    assert.equal(resolveLoginRedirect('/security/approvals', receptionPerms), '/reception/calendar');
    assert.equal(resolveLoginRedirect('/station', receptionPerms), '/reception/calendar');
    assert.equal(resolveLoginRedirect('/reception/check-in', receptionPerms), '/reception/check-in');

    assert.equal(resolveLoginRedirect('/host', executiveReceptionPerms), '/reception/calendar');
    assert.equal(resolveLoginRedirect('/admin/receptionists', executiveReceptionPerms), '/reception/calendar');
    assert.equal(isPortalLockExemptPath('/login'), true);
    assert.equal(isPortalLockExemptPath('/host'), false);
    assert.equal(isPortalLockExemptPath('/reception/calendar'), false);
  });

  it('keeps host accounts on /host even when they also have reception permissions', () => {
    const mixedHostReception = [...hostEmployee, 'reception.dashboard', 'reception.calendar'];

    assert.equal(isReceptionOnlyUser(mixedHostReception), false);
    assert.equal(resolveDefaultHomeRoute(mixedHostReception), '/host');
    assert.equal(resolveLoginRedirect('/login', mixedHostReception), '/host');
    assert.equal(resolveLoginRedirect('/reception/calendar', mixedHostReception), '/host');
    assert.equal(resolveLoginRedirect('/host/appointments', mixedHostReception), '/host/appointments');
    assert.equal(
      resolvePrimaryPortal(hasPermissionFactory(mixedHostReception), mixedHostReception),
      'host',
    );
  });

  it('locks host-only users out of every non-host route', () => {
    assert.equal(isHostPortalPath('/host'), true);
    assert.equal(isHostPortalPath('/host/appointments'), true);
    assert.equal(isHostPortalPath('/executive'), true);
    assert.equal(isHostPortalPath('/reception'), false);
    assert.equal(isHostPortalPath('/admin'), false);
    assert.equal(isHostPortalPath('/security'), false);

    assert.equal(resolveLoginRedirect('/reception', hostEmployee), '/host');
    assert.equal(resolveLoginRedirect('/admin', hostEmployee), '/host');
    assert.equal(resolveLoginRedirect('/security', hostEmployee), '/host');
    assert.equal(resolveLoginRedirect('/management', hostEmployee), '/host');
    assert.equal(resolveLoginRedirect('/host/appointments', hostEmployee), '/host/appointments');
    assert.equal(resolveLoginRedirect('/executive', ceoPerms), '/host');
    assert.equal(resolveLoginRedirect('/reception/calendar', ceoPerms), '/host');
  });
});
