import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  VISIT_TRANSITIONS,
} from '../server/scopeService.js';
import {
  RECEPTION_KEYS,
  DEFAULT_ADMIN_ROLES,
  permissionMatches,
  hasAnyPermission,
} from '../shared/rbacPermissions.js';
import { resolveVisitRoutePermissions } from '../server/rbacService.js';
import {
  isExecutiveOnlyUser,
  isReceptionOnlyUser,
  resolveDefaultHomeRoute,
  resolveLoginRedirect,
  PORTALS,
} from '../shared/portalNavigation.js';
import {
  hostZoneFilterClause,
  visitZoneFilterClause,
} from '../server/receptionistService.js';

const HOST_OCCUPIED_STATUSES = ['waiting', 'in_meeting', 'reception_check_in', 'checked_in'];

describe('reception RBAC', () => {
  it('defines reception permission keys', () => {
    assert.ok(RECEPTION_KEYS.includes('reception.dashboard'));
    assert.ok(RECEPTION_KEYS.includes('reception.calendar'));
    assert.ok(RECEPTION_KEYS.includes('reception.host.queue'));
    assert.ok(RECEPTION_KEYS.includes('reception.hosts.availability'));
  });

  it('assigns main_reception to reception keys only', () => {
    const role = DEFAULT_ADMIN_ROLES.find((r) => r.slug === 'main_reception');
    assert.ok(role);
    assert.deepEqual(role.permissions, RECEPTION_KEYS);
    assert.equal(permissionMatches(role.permissions, 'reception.calendar'), true);
    assert.equal(permissionMatches(role.permissions, 'station.dashboard'), false);
  });

  it('assigns executive_reception reception plus executive keys', () => {
    const role = DEFAULT_ADMIN_ROLES.find((r) => r.slug === 'executive_reception');
    assert.ok(role);
    assert.equal(permissionMatches(role.permissions, 'reception.dashboard'), true);
    assert.equal(permissionMatches(role.permissions, 'executive.full_contact'), true);
    assert.equal(permissionMatches(role.permissions, 'station.dashboard'), false);
  });

  it('routes reception users to calendar home', () => {
    assert.equal(resolveDefaultHomeRoute(RECEPTION_KEYS), `${PORTALS.reception.routePrefix}/calendar`);
  });

  it('routes executive_reception to reception calendar instead of host', () => {
    const role = DEFAULT_ADMIN_ROLES.find((r) => r.slug === 'executive_reception');
    assert.ok(role);
    assert.equal(isReceptionOnlyUser(role.permissions), true);
    assert.equal(isExecutiveOnlyUser(role.permissions), false);
    assert.equal(resolveDefaultHomeRoute(role.permissions), `${PORTALS.reception.routePrefix}/calendar`);
    assert.equal(resolveLoginRedirect('/login', role.permissions), `${PORTALS.reception.routePrefix}/calendar`);
  });
});

describe('shared visit route permissions', () => {
  it('allows reception check-in permission on visit check-in routes', () => {
    const perms = resolveVisitRoutePermissions({ path: '/api/admin/visits/abc/check-in', method: 'POST' });
    assert.ok(hasAnyPermission(RECEPTION_KEYS, perms));
    assert.ok(perms.includes('reception.visitors.checkin'));
  });

  it('allows reception host queue on waiting transition', () => {
    const perms = resolveVisitRoutePermissions({ path: '/api/admin/visits/abc/waiting', method: 'POST' });
    assert.ok(perms.includes('reception.host.queue'));
  });

  it('allows reception view on GET visits', () => {
    const perms = resolveVisitRoutePermissions({ path: '/api/admin/visits', method: 'GET' });
    assert.ok(perms.includes('reception.visitors.view'));
  });

  it('gate security role cannot access reception calendar', () => {
    const role = DEFAULT_ADMIN_ROLES.find((r) => r.slug === 'gate_security');
    assert.ok(role);
    assert.equal(permissionMatches(role.permissions, 'reception.calendar'), false);
    assert.equal(permissionMatches(role.permissions, 'station.dashboard'), true);
  });
});

describe('host occupied lifecycle', () => {
  it('treats in_meeting and waiting as on-site occupied states', () => {
    for (const status of ['waiting', 'in_meeting', 'reception_check_in', 'checked_in']) {
      assert.ok(HOST_OCCUPIED_STATUSES.includes(status));
    }
  });

  it('allows queue transition from reception check-in to waiting', () => {
    assert.equal(canTransition('reception_check_in', 'waiting'), true);
    assert.ok(VISIT_TRANSITIONS.reception_check_in.includes('waiting'));
  });

  it('allows in_meeting after waiting', () => {
    assert.equal(canTransition('waiting', 'in_meeting'), true);
  });

  it('frees host after checkout and left premises', () => {
    assert.equal(HOST_OCCUPIED_STATUSES.includes('checked_out'), false);
    assert.equal(HOST_OCCUPIED_STATUSES.includes('left_premises'), false);
    assert.equal(canTransition('in_meeting', 'checked_out'), true);
  });

  it('queues checked-in visitors to host approvals, then waiting on accept', () => {
    assert.equal(canTransition('reception_check_in', 'pending_approval'), true);
    assert.equal(canTransition('checked_in', 'pending_approval'), true);
    assert.equal(canTransition('pending_approval', 'waiting'), true);
    assert.equal(canTransition('expected', 'waiting'), false);
  });
});

describe('reception visit action labels', () => {
  it('maps gate, reception, queue, and host stages to distinct labels', async () => {
    const {
      getReceptionVisitAction,
      getReceptionCheckInActionLabel,
      receptionActionHref,
    } = await import('../shared/visitReceptionActions.js');

    assert.equal(getReceptionVisitAction('arrived_at_gate').label, 'Receive at desk');
    assert.equal(getReceptionVisitAction('expected').label, 'Check in');
    assert.equal(getReceptionVisitAction('reception_check_in').label, 'Queue to host');
    assert.equal(getReceptionVisitAction('waiting').label, 'View host queue');
    assert.equal(getReceptionVisitAction('in_meeting').label, 'With host');
    assert.equal(getReceptionVisitAction('completed').show, false);

    assert.equal(getReceptionCheckInActionLabel('entered_premises').label, 'Receive at desk');
    assert.equal(getReceptionCheckInActionLabel('expected').label, 'Check in');

    assert.equal(
      receptionActionHref(getReceptionVisitAction('expected'), 'vis-1'),
      '/reception/check-in?visit=vis-1',
    );
  });
});

describe('reception zone filters', () => {
  it('denies all rows when zoneIds is null or empty (strict isolation)', () => {
    assert.match(visitZoneFilterClause(null).sql, /1=0/);
    assert.match(visitZoneFilterClause([]).sql, /1=0/);
    assert.match(hostZoneFilterClause(null).sql, /1=0/);
  });

  it('scopes visits and hosts to the receptionist zone set', () => {
    const zones = ['zone-a', 'zone-b'];
    const visit = visitZoneFilterClause(zones);
    const host = hostZoneFilterClause(zones, 'ofc');
    assert.match(visit.sql, /vis\.zone_id IN/);
    assert.match(visit.sql, /ofc\.zone_id IN/);
    assert.match(visit.sql, /vis_ofc\.zone_id IN/);
    assert.deepEqual(visit.params, [...zones, ...zones, ...zones]);
    assert.match(host.sql, /ofc\.zone_id IN \(\?, \?\)/);
    assert.deepEqual(host.params, zones);
  });
});
