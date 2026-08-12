import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ADMIN_ROLES, permissionMatches } from '../shared/rbacPermissions.js';
import { resolveRouteAdminPermission } from '../server/rbacService.js';
import { resolvePortalLockRedirect } from '../shared/portalNavigation.js';

const perms = (slug) => DEFAULT_ADMIN_ROLES.find((r) => r.slug === slug).permissions;

/** Every non-host portal route a host might type, bookmark, or be linked to. */
const NON_HOST_ROUTES = [
  '/reception', '/reception/calendar', '/reception/check-in', '/reception/approvals',
  '/reception/host-queue', '/reception/visitors', '/reception/visitors/visit-1',
  '/reception/occupancy', '/reception/badges', '/reception/notifications',
  '/admin', '/admin/users', '/admin/visitors', '/admin/access-control', '/admin/settings',
  '/admin/hosts', '/admin/receptionists', '/admin/audit',
  '/security', '/security/visitors', '/security/watchlist', '/security/incidents',
  '/station', '/station/gate-entry', '/station/visitors',
  '/management', '/management/reports',
  '/compliance', '/compliance/audit',
  '/emergency', '/emergency/roll-call',
  '/platform', '/platform/organisations',
];

const HOST_ROUTES = [
  '/host', '/host/appointments', '/host/approvals', '/host/on-site',
  '/host/contacts', '/host/visitors/visit-1', '/host/invite',
];

describe('HOST LOCK — a host may not leave the host portal', () => {
  const hostPerms = perms('host');
  const hostRoles = ['host'];

  for (const route of NON_HOST_ROUTES) {
    it(`redirects a host away from ${route}`, () => {
      const redirect = resolvePortalLockRedirect(route, hostPerms, hostRoles);
      assert.equal(redirect, '/host', `host was allowed to stay on ${route}`);
    });
  }

  for (const route of HOST_ROUTES) {
    it(`lets a host stay on ${route}`, () => {
      assert.equal(resolvePortalLockRedirect(route, hostPerms, hostRoles), null);
    });
  }

  it('sends the legacy /executive alias to the canonical /host route', () => {
    assert.equal(resolvePortalLockRedirect('/executive', hostPerms, hostRoles), '/host');
    assert.equal(resolvePortalLockRedirect('/executive/appointments', hostPerms, hostRoles), '/host');
  });

  it('does not trap a host on public/auth paths', () => {
    for (const route of ['/', '/login', '/admin/login', '/reset-password', '/kiosk', '/visit/invite/abc']) {
      assert.equal(resolvePortalLockRedirect(route, hostPerms, hostRoles), null,
        `${route} must stay reachable (login/kiosk/invite would otherwise be unusable)`);
    }
  });

  it('locks a host even if someone attaches stray reception permissions to them', () => {
    // Role slug is authoritative: a host with an accidental reception.dashboard
    // permission must still be a host, not gain the reception portal.
    const mixed = [...hostPerms, 'reception.dashboard', 'reception.calendar'];
    assert.equal(resolvePortalLockRedirect('/reception', mixed, ['host']), '/host');
    assert.equal(resolvePortalLockRedirect('/reception/calendar', mixed, ['host']), '/host');
  });
});

describe('HOST LOCK — applies to every host-family role', () => {
  for (const slug of ['host', 'ceo', 'dceo', 'ceo_secretary', 'dceo_secretary']) {
    it(`${slug} is redirected out of /reception and /admin`, () => {
      const p = perms(slug);
      assert.equal(resolvePortalLockRedirect('/reception', p, [slug]), '/host');
      assert.equal(resolvePortalLockRedirect('/admin', p, [slug]), '/host');
      assert.equal(resolvePortalLockRedirect('/host', p, [slug]), null);
    });
  }
});

describe('RECEPTION LOCK — the mirror rule still holds', () => {
  for (const slug of ['receptionist', 'main_reception', 'executive_reception']) {
    it(`${slug} is redirected out of /host and /admin, and stays in /reception`, () => {
      const p = perms(slug);
      const home = resolvePortalLockRedirect('/host', p, [slug]);
      assert.ok(home && home.startsWith('/reception'), `${slug} should be sent back to reception, got ${home}`);
      assert.ok(resolvePortalLockRedirect('/admin', p, [slug]).startsWith('/reception'));
      assert.equal(resolvePortalLockRedirect('/reception/check-in', p, [slug]), null);
    });
  }

  it('reception wins over host when an account carries both role slugs', () => {
    const p = [...perms('main_reception'), ...perms('host')];
    const redirect = resolvePortalLockRedirect('/host', p, ['main_reception', 'host']);
    assert.ok(redirect.startsWith('/reception'), 'a desk account must land in reception, not host');
  });
});

describe('PORTAL LOCK — roles that legitimately switch portals are not locked', () => {
  for (const slug of ['super_admin', 'org_admin', 'platform_admin', 'security_manager', 'gate_security']) {
    it(`${slug} may navigate freely`, () => {
      const p = perms(slug);
      assert.equal(resolvePortalLockRedirect('/admin', p, [slug]), null);
      assert.equal(resolvePortalLockRedirect('/security', p, [slug]), null);
    });
  }

  it('an unauthenticated / permissionless session is never redirected by the lock', () => {
    assert.equal(resolvePortalLockRedirect('/reception', [], []), null);
    assert.equal(resolvePortalLockRedirect('/admin', null, null), null);
  });

  it('never returns the path it was given, which would cause a redirect loop', () => {
    for (const slug of ['host', 'ceo', 'main_reception', 'receptionist']) {
      const p = perms(slug);
      for (const route of ['/host', '/reception', '/admin', '/security']) {
        const redirect = resolvePortalLockRedirect(route, p, [slug]);
        assert.notEqual(redirect, route, `${slug} on ${route} would redirect to itself`);
      }
    }
  });
});

describe('BACKEND — route permissions match the portal each role is locked to', () => {
  const RECEPTION_ROUTES = [
    ['/admin/reception/dashboard', 'GET'],
    ['/admin/reception/calendar', 'GET'],
    ['/admin/reception/reference-data', 'GET'],
    ['/admin/reception/check-in-appointments', 'GET'],
    ['/admin/reception/check-in/walk-in', 'POST'],
    ['/admin/reception/host-availability', 'GET'],
    ['/admin/reception/host-queue', 'GET'],
    ['/admin/reception/occupancy', 'GET'],
    ['/admin/reception/register', 'POST'],
    ['/admin/reception/visits', 'GET'],
    ['/admin/reception/visits/abc', 'GET'],
    ['/admin/reception/visits/abc/queue-host', 'POST'],
    ['/admin/reception/visits/abc/in-meeting', 'POST'],
    ['/admin/reception/visits/abc/request-approval', 'POST'],
  ];

  it('every reception route is reachable by every reception role', () => {
    // Regression: the nested /reception/visits/:id/<action> routes fell through
    // to the generic /visits handler and demanded station.* permissions, 403ing
    // the visitor log, visit detail and the queue-to-host desk workflow.
    for (const slug of ['receptionist', 'main_reception', 'executive_reception']) {
      const p = perms(slug);
      for (const [path, method] of RECEPTION_ROUTES) {
        const need = resolveRouteAdminPermission({ path, method });
        assert.ok(permissionMatches(p, need),
          `${slug} is 403'd on ${method} ${path} (needs "${need}")`);
      }
    }
  });

  it('a host cannot reach ANY reception route at the API layer', () => {
    const p = perms('host');
    for (const [path, method] of RECEPTION_ROUTES) {
      const need = resolveRouteAdminPermission({ path, method });
      assert.equal(permissionMatches(p, need), false,
        `host can reach ${method} ${path} via "${need}" — the frontend lock must not be the only defence`);
    }
  });

  it('a host cannot reach admin, security or platform routes either', () => {
    const p = perms('host');
    for (const [path, method] of [
      ['/admin/org/users', 'GET'], ['/admin/org/hosts', 'GET'], ['/admin/rbac', 'GET'],
      ['/admin/security/watchlist', 'GET'], ['/admin/security/incidents', 'GET'],
      ['/admin/platform/organisations', 'GET'], ['/admin/org/audit', 'GET'],
    ]) {
      const need = resolveRouteAdminPermission({ path, method });
      assert.equal(permissionMatches(p, need), false,
        `host can reach ${method} ${path} via "${need}"`);
    }
  });
});
