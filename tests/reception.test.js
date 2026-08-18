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
  visitInZoneClause,
  visitZoneFilterClause,
  visitZoneMatchExpr,
} from '../server/receptionistService.js';
import { HOST_OCCUPIED_STATUSES } from '../shared/visitOnSite.js';

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

  it('queues checked-in visitors to waiting, then in_meeting on host accept', () => {
    assert.equal(canTransition('reception_check_in', 'waiting'), true);
    assert.equal(canTransition('checked_in', 'waiting'), true);
    assert.equal(canTransition('pending_approval', 'in_meeting'), true);
    assert.equal(canTransition('waiting', 'in_meeting'), true);
    assert.equal(canTransition('expected', 'waiting'), false);
    assert.equal(canTransition('rejected', 'waiting'), true);
    assert.equal(canTransition('rejected', 'checked_out'), true);
  });
});

describe('reception visit action labels', () => {
  it('maps gate, reception, queue, and host stages to distinct labels', async () => {
    const {
      getReceptionVisitAction,
      getReceptionCheckInActionLabel,
      receptionActionHref,
      isReceiveAtDeskAction,
      isQueueToHostAction,
    } = await import('../shared/visitReceptionActions.js');

    const gateAction = getReceptionVisitAction('arrived_at_gate');
    assert.equal(gateAction.label, 'Receive at desk');
    assert.equal(gateAction.actionKind, 'receive-modal');
    assert.equal(isReceiveAtDeskAction(gateAction), true);
    assert.equal(receptionActionHref(gateAction, 'vis-1'), null);
    assert.equal(getReceptionVisitAction('expected').label, 'Check in');
    const queueAction = getReceptionVisitAction('reception_check_in');
    assert.equal(queueAction.label, 'Queue to host');
    assert.equal(queueAction.actionKind, 'queue-modal');
    assert.equal(isQueueToHostAction(queueAction), true);
    assert.equal(receptionActionHref(queueAction, 'vis-1'), null);
    assert.equal(getReceptionVisitAction('waiting').label, 'View host queue');
    assert.equal(getReceptionVisitAction('in_meeting').show, false);
    assert.equal(getReceptionVisitAction('overdue').show, false);
    assert.equal(getReceptionVisitAction('completed').show, false);
    assert.equal(
      getReceptionVisitAction({ status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' }).label,
      'View host queue',
    );
    assert.equal(
      getReceptionVisitAction({ status: 'rejected', checked_in_at: '2026-08-17T10:00:00Z' }).label,
      'Re-queue to host',
    );

    assert.equal(getReceptionCheckInActionLabel('entered_premises').label, 'Receive at desk');
    assert.equal(getReceptionCheckInActionLabel('expected').label, 'Check in');

    assert.equal(
      receptionActionHref(getReceptionVisitAction('expected'), 'vis-1'),
      '/reception/check-in?visit=vis-1',
    );
  });

  it('lets reception re-queue or check out an on-site guest after host reject', async () => {
    const { canQueueVisitToHost } = await import('../shared/visitReceptionActions.js');
    const { isCheckoutEligible } = await import('../shared/visitCheckout.js');

    assert.equal(canQueueVisitToHost({ status: 'reception_check_in' }), true);
    assert.equal(canQueueVisitToHost({ status: 'rejected' }), false);
    assert.equal(canQueueVisitToHost({ status: 'rejected', checked_in_at: '2026-08-17T10:00:00Z' }), true);
    assert.equal(isCheckoutEligible('rejected'), false);
    assert.equal(isCheckoutEligible({ status: 'rejected', checked_in_at: '2026-08-17T10:00:00Z' }), true);
    assert.equal(isCheckoutEligible({ status: 'pending_approval' }), false);
    assert.equal(isCheckoutEligible({ status: 'pending_approval', checked_in_at: '2026-08-17T10:00:00Z' }), true);
    assert.equal(isCheckoutEligible('waiting'), true);
  });

  it('lets reception mark a waiting guest as with host', async () => {
    const { canMarkInMeeting } = await import('../shared/visitReceptionActions.js');
    assert.equal(canMarkInMeeting({ status: 'waiting' }), true);
    assert.equal(canMarkInMeeting({ status: 'reception_check_in' }), false);
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
    assert.match(visit.sql, /COALESCE/);
    assert.match(visit.sql, /vis\.zone_id/);
    assert.match(visit.sql, /h\.zone_id/);
    assert.match(visit.sql, /ofc\.zone_id/);
    assert.match(visit.sql, /vis_ofc\.zone_id/);
    assert.deepEqual(visit.params, zones);
    assert.match(host.sql, /COALESCE\(NULLIF\(h\.zone_id/);
    assert.deepEqual(host.params, zones);
  });
});

describe('visitInZoneClause', () => {
  it('denies all rows when zoneIds is null or empty', () => {
    assert.match(visitInZoneClause(null).sql, /1=0/);
    assert.deepEqual(visitInZoneClause(null).params, []);
    assert.match(visitInZoneClause([]).sql, /1=0/);
    assert.deepEqual(visitInZoneClause([]).params, []);
  });

  it('wraps visitZoneMatchExpr as a WHERE predicate with the same params', () => {
    const zones = ['zone-a', 'zone-b'];
    const match = visitZoneMatchExpr(zones);
    const clause = visitInZoneClause(zones);
    assert.equal(clause.sql, ` AND (${match.sql}) = 1`);
    assert.deepEqual(clause.params, match.params);
    assert.deepEqual(clause.params, [...zones, ...zones]);
  });
});

describe('visit closed statuses — expected-today KPI', () => {
  it('treats checkout and left-premises as closed so they drop off Expected today', async () => {
    const { VISIT_CLOSED_STATUSES } = await import('../shared/visitCheckout.js');
    assert.equal(VISIT_CLOSED_STATUSES.includes('checked_out'), true);
    assert.equal(VISIT_CLOSED_STATUSES.includes('left_premises'), true);
    assert.equal(VISIT_CLOSED_STATUSES.includes('completed'), true);
    assert.equal(VISIT_CLOSED_STATUSES.includes('expected'), false);
    assert.equal(VISIT_CLOSED_STATUSES.includes('waiting'), false);
  });
});
