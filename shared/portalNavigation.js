/**
 * Portal sidebar navigation — shared by frontend layouts.
 * Each item maps to an RBAC permission via `permission`.
 */

import { resolveNavIcon } from './navIcons.js';
import { permissionMatches } from './rbacPermissions.js';

function navItemVisible(item, hasPermission) {
  if (item.permissions?.length) {
    return item.permissions.some((key) => hasPermission(key));
  }
  if (!item.permission) return true;
  return hasPermission(item.permission);
}

export const PORTALS = {
  admin: {
    id: 'admin',
    label: 'Administration Portal',
    routePrefix: '/admin',
    navSections: {
      primary: 'Operations',
      organisation: 'Administration',
      system: 'Reports & Compliance',
    },
  },
  security: {
    id: 'security',
    label: 'Security Portal',
    routePrefix: '/security',
    navSections: { primary: 'Operations', system: 'Monitoring & Reports' },
  },
  reception: {
    id: 'reception',
    label: 'Reception Access Portal',
    routePrefix: '/reception',
    navSections: { primary: 'Reception Desk', system: 'Tracking' },
  },
  station: {
    id: 'station',
    label: 'Station Portal',
    routePrefix: '/station',
    navSections: { primary: 'Gate Operations', system: 'Safety & Tracking' },
  },
  host: {
    id: 'host',
    label: 'Host Portal',
    routePrefix: '/host',
    navSections: { primary: 'My schedule', system: 'More' },
  },
  management: {
    id: 'management',
    label: 'Management Portal',
    routePrefix: '/management',
    navSections: { primary: 'Executive Insights' },
  },
  compliance: {
    id: 'compliance',
    label: 'Compliance Portal',
    routePrefix: '/compliance',
    navSections: { primary: 'Compliance', system: 'Reports & Evidence' },
  },
  emergency: {
    id: 'emergency',
    label: 'Emergency Portal',
    routePrefix: '/emergency',
    navSections: { primary: 'Emergency Operations' },
  },
};

export const PORTAL_NAVIGATION = {
  admin: [
    // Use-case order: overview → entities → records → configuration
    { key: 'dashboard', name: 'Dashboard', to: '/admin', permission: 'admin.dashboard', end: true, section: 'primary' },
    { key: 'visitors', name: 'Visitors', to: '/admin/visitors', permissions: ['admin.visitors', 'admin.dashboard'], section: 'primary' },
    { key: 'vehicles', name: 'Vehicles', to: '/admin/vehicles', permissions: ['admin.vehicles', 'admin.dashboard'], section: 'primary' },
    { key: 'log-book', name: 'Log Book', to: '/admin/log-book', permissions: ['admin.visitors', 'admin.vehicles', 'admin.dashboard'], section: 'primary' },
    { key: 'workflows', name: 'Approval Workflows', to: '/admin/workflows', permission: 'admin.workflows', section: 'primary' },
    { key: 'badges', name: 'Badge Inventory', to: '/admin/badges', permission: 'admin.badges', section: 'primary' },
    // Hierarchy setup order: Org → Site → Building/Zone → Station → Dept → Office → People → visitor policy
    { key: 'organisations', name: 'Organisations', to: '/admin/organisations', permission: 'admin.organisations', section: 'organisation', badgeKey: 'organisations' },
    { key: 'sites', name: 'Sites & Branches', to: '/admin/sites', permission: 'admin.sites', section: 'organisation', badgeKey: 'sites' },
    { key: 'zones', name: 'Buildings & Zones', to: '/admin/zones', permission: 'admin.zones', section: 'organisation', badgeKey: 'zones' },
    { key: 'stations', name: 'Stations & Gates', to: '/admin/stations', permission: 'admin.stations', section: 'organisation', badgeKey: 'stations' },
    { key: 'departments', name: 'Departments', to: '/admin/departments', permission: 'admin.departments', section: 'organisation', badgeKey: 'departments' },
    { key: 'offices', name: 'Offices', to: '/admin/offices', permission: 'admin.offices', section: 'organisation', badgeKey: 'offices' },
    { key: 'hosts', name: 'Employees & Hosts', to: '/admin/hosts', permission: 'admin.hosts', section: 'organisation', badgeKey: 'hosts' },
    { key: 'receptionists', name: 'Receptionists', to: '/admin/receptionists', permission: 'admin.receptionists', section: 'organisation', badgeKey: 'receptionists' },
    { key: 'users', name: 'Users', to: '/admin/users', permission: 'admin.users', section: 'organisation', badgeKey: 'users' },
    { key: 'categories', name: 'Visitor Categories', to: '/admin/categories', permission: 'admin.categories', section: 'organisation' },
    { key: 'notifications', name: 'Notifications', to: '/admin/notifications', permission: 'admin.notifications', section: 'system' },
    { key: 'reports', name: 'Reports', to: '/admin/reports', permission: 'admin.reports', section: 'system' },
    { key: 'privacy', name: 'Privacy & Retention', to: '/admin/privacy', permission: 'admin.privacy', section: 'system' },
    { key: 'integrations', name: 'Integrations', to: '/admin/integrations', permission: 'admin.integrations', section: 'system' },
    { key: 'audit', name: 'Audit Logs', to: '/admin/audit', permission: 'admin.audit', section: 'system' },
    { key: 'roles', name: 'Roles & Permissions', to: '/admin/access-control', permission: 'admin.rbac', section: 'settings' },
    { key: 'settings', name: 'Settings', to: '/admin/settings', permission: 'admin.settings', section: 'settings' },
  ],
  security: [
    { key: 'dashboard', name: 'Operations Dashboard', to: '/security', permission: 'security.dashboard', end: true, section: 'primary' },
    { key: 'occupancy', name: 'Live Occupancy', to: '/security/occupancy', permission: 'security.occupancy', section: 'primary' },
    { key: 'approvals', name: 'Approval Queue', to: '/security/approvals', permission: 'security.approvals', section: 'primary' },
    { key: 'exceptions', name: 'Exceptions', to: '/security/exceptions', permission: 'security.exceptions', section: 'primary' },
    { key: 'visitors', name: 'Visitors', to: '/security/visitors', permission: 'security.visitors', section: 'primary' },
    { key: 'vehicles', name: 'Vehicles', to: '/security/vehicles', permission: 'security.vehicles', section: 'primary' },
    { key: 'contractors', name: 'Contractors', to: '/security/contractors', permission: 'security.contractors', section: 'primary' },
    { key: 'watchlist', name: 'Watchlist', to: '/security/watchlist', permission: 'security.watchlist', section: 'primary' },
    { key: 'badges', name: 'Badge Management', to: '/security/badges', permission: 'security.badges', section: 'primary' },
    { key: 'incidents', name: 'Incidents', to: '/security/incidents', permission: 'security.incidents', section: 'primary' },
    { key: 'overdue', name: 'Overdue Visits', to: '/security/overdue', permission: 'security.overdue', section: 'primary' },
    { key: 'roll-call', name: 'Emergency Roll Call', to: '/security/roll-call', permission: 'security.rollcall', section: 'primary' },
    { key: 'stations', name: 'Stations & Shifts', to: '/security/stations', permission: 'security.stations', section: 'system' },
    { key: 'reports', name: 'Security Reports', to: '/security/reports', permission: 'security.reports', section: 'system' },
    { key: 'audit', name: 'Activity Audit', to: '/security/audit', permission: 'security.audit', section: 'system' },
  ],
  reception: [
    { key: 'dashboard', name: 'Dashboard', to: '/reception', permission: 'reception.dashboard', end: true, section: 'primary' },
    { key: 'calendar', name: 'Calendar', to: '/reception/calendar', permission: 'reception.calendar', section: 'primary', isPrimaryRoute: true },
    { key: 'check-in', name: 'Check-in Desk', to: '/reception/check-in', permission: 'reception.visitors.checkin', section: 'primary' },
    { key: 'approvals', name: 'Pending Approvals', to: '/reception/approvals', permission: 'reception.approvals.track', section: 'primary' },
    { key: 'host-queue', name: 'Host Queue', to: '/reception/host-queue', permission: 'reception.host.queue', section: 'primary' },
    { key: 'visitor-logs', name: 'Visitor Logs', to: '/reception/visitors', permission: 'reception.visitors.view', section: 'primary' },
    { key: 'badges', name: 'Badge Desk', to: '/reception/badges', permission: 'reception.badges', section: 'system' },
    { key: 'occupancy', name: 'On-site Visitors', to: '/reception/occupancy', permission: 'reception.occupancy', section: 'system' },
  ],
  station: [
    { key: 'dashboard', name: 'Dashboard', to: '/station', permission: 'station.dashboard', end: true, section: 'primary' },
    { key: 'gate-entry', name: 'Gate Checkin / Checkout', to: '/station/gate-entry', permissions: ['station.visitors.register', 'station.visitors.checkin'], section: 'primary' },
    { key: 'expected', name: 'Expected Arrivals', to: '/station/expected', permission: 'station.visitors.view', section: 'primary' },
    { key: 'pending', name: 'Pending Approvals', to: '/station/pending', permission: 'station.visitors.view', section: 'primary' },
    { key: 'visitor-logs', name: 'Visitor Logs', to: '/station/visitors', permission: 'station.visitors.view', section: 'primary' },
    { key: 'vehicle-logs', name: 'Vehicle Logs', to: '/station/vehicles', permission: 'station.vehicles.view', section: 'primary' },
    { key: 'deliveries', name: 'Deliveries', to: '/station/deliveries', permission: 'station.deliveries', section: 'primary' },
    { key: 'badge-desk', name: 'Badge Desk', to: '/station/badges', permission: 'station.badges', section: 'primary' },
    { key: 'overdue', name: 'Overdue Visitors', to: '/station/overdue', permission: 'station.visitors.view', section: 'primary' },
    { key: 'incidents', name: 'Report Incident', to: '/station/incidents/new', permission: 'station.incidents', section: 'system' },
    { key: 'occupancy', name: 'Current Occupancy', to: '/station/occupancy', permission: 'station.occupancy', section: 'system' },
    { key: 'emergency', name: 'Emergency List', to: '/station/emergency', permission: 'station.emergency', section: 'system' },
    { key: 'activity', name: 'My Activity', to: '/station/activity', permission: 'station.activity', section: 'system' },
  ],
  // Host + former executive calendar merged into one employee portal.
  host: [
    { key: 'dashboard', name: 'Dashboard', to: '/host', permissions: ['executive.dashboard', 'host.dashboard'], end: true, section: 'primary', isPrimaryRoute: true },
    { key: 'appointments', name: 'Appointments', to: '/host/appointments', permission: 'executive.calendar', section: 'primary' },
    { key: 'approvals', name: 'Approval Requests', to: '/host/approvals', permission: 'host.approvals', section: 'primary' },
    { key: 'on-site', name: 'Visitors On-site', to: '/host/on-site', permission: 'host.onsite', section: 'primary' },
    { key: 'contacts', name: 'My Contacts', to: '/host/contacts', permission: 'executive.contacts', section: 'primary' },
  ],
  management: [
    { key: 'dashboard', name: 'Executive Dashboard', to: '/management', permission: 'management.dashboard', end: true, section: 'primary' },
    { key: 'occupancy', name: 'Live Occupancy', to: '/management/occupancy', permission: 'management.occupancy', section: 'primary' },
    { key: 'visitor-analytics', name: 'Visitor Analytics', to: '/management/visitors', permission: 'management.analytics', section: 'primary' },
    { key: 'vehicle-analytics', name: 'Vehicle Analytics', to: '/management/vehicles', permission: 'management.analytics', section: 'primary' },
    { key: 'site-comparison', name: 'Site Comparison', to: '/management/sites', permission: 'management.analytics', section: 'primary' },
    { key: 'host-reports', name: 'Host & Department Reports', to: '/management/hosts', permission: 'management.reports', section: 'primary' },
    { key: 'exceptions', name: 'Exceptions Summary', to: '/management/exceptions', permission: 'management.reports', section: 'primary' },
    { key: 'incidents', name: 'Incident Summary', to: '/management/incidents', permission: 'management.reports', section: 'primary' },
    { key: 'reports', name: 'Reports', to: '/management/reports', permission: 'management.reports', section: 'primary' },
    { key: 'scheduled', name: 'Scheduled Reports', to: '/management/scheduled', permission: 'management.scheduled', section: 'primary' },
    { key: 'exports', name: 'Export History', to: '/management/exports', permission: 'management.exports', section: 'primary' },
  ],
  compliance: [
    { key: 'dashboard', name: 'Compliance Dashboard', to: '/compliance', permission: 'compliance.dashboard', end: true, section: 'primary' },
    { key: 'audit-trail', name: 'Audit Trail', to: '/compliance/audit', permission: 'compliance.audit', section: 'primary' },
    { key: 'access-review', name: 'User Access Review', to: '/compliance/access', permission: 'compliance.access', section: 'primary' },
    { key: 'privileged', name: 'Privileged Access', to: '/compliance/privileged', permission: 'compliance.privileged', section: 'primary' },
    { key: 'approvals', name: 'Approval & Override Logs', to: '/compliance/approvals', permission: 'compliance.approvals', section: 'primary' },
    { key: 'exports', name: 'Export Logs', to: '/compliance/exports', permission: 'compliance.exports', section: 'primary' },
    { key: 'privacy', name: 'Privacy Requests', to: '/compliance/privacy', permission: 'compliance.privacy', section: 'primary' },
    { key: 'retention', name: 'Retention & Legal Holds', to: '/compliance/retention', permission: 'compliance.retention', section: 'primary' },
    { key: 'incidents', name: 'Incident Review', to: '/compliance/incidents', permission: 'compliance.incidents', section: 'primary' },
    { key: 'register', name: 'Data Processing Register', to: '/compliance/register', permission: 'compliance.register', section: 'primary' },
    { key: 'reports', name: 'Compliance Reports', to: '/compliance/reports', permission: 'compliance.reports', section: 'system' },
    { key: 'evidence', name: 'Evidence Export', to: '/compliance/evidence', permission: 'compliance.evidence', section: 'system' },
  ],
  emergency: [
    { key: 'dashboard', name: 'Emergency Dashboard', to: '/emergency', permission: 'emergency.dashboard', end: true, section: 'primary' },
    { key: 'occupancy', name: 'Current Occupancy', to: '/emergency/occupancy', permission: 'emergency.occupancy', section: 'primary' },
    { key: 'start-roll-call', name: 'Start Roll Call', to: '/emergency/roll-call/new', permission: 'emergency.rollcall', section: 'primary' },
    { key: 'roll-call', name: 'Roll Call', to: '/emergency/roll-call', permission: 'emergency.rollcall', section: 'primary' },
    { key: 'zones', name: 'Zone View', to: '/emergency/zones', permission: 'emergency.zones', section: 'primary' },
    { key: 'unresolved', name: 'Unresolved Persons', to: '/emergency/unresolved', permission: 'emergency.unresolved', section: 'primary' },
    { key: 'contacts', name: 'Emergency Contacts', to: '/emergency/contacts', permission: 'emergency.contacts', section: 'primary' },
    { key: 'previous', name: 'Previous Events', to: '/emergency/history', permission: 'emergency.history', section: 'primary' },
    { key: 'export', name: 'Print/Export', to: '/emergency/export', permission: 'emergency.export', section: 'primary' },
  ],
};

/** Portal priority for default redirect after login */
export const PORTAL_PRIORITY = [
  'admin',
  'host',
  'security',
  'reception',
  'station',
  'management',
  'compliance',
  'emergency',
];

export function getVisibleNavItems(portalId, hasPermission) {
  const items = PORTAL_NAVIGATION[portalId] || [];
  return items
    .filter((item) => navItemVisible(item, hasPermission))
    .map((item) => ({
      ...item,
      section: item.section || (item.key === 'settings' ? 'settings' : 'primary'),
      icon: item.icon || resolveNavIcon(item.key),
    }));
}

/** Split nav into Mutale-style sections: primary + organisation + system + settings footer. */
export function groupNavItems(items) {
  const primary = [];
  const organisation = [];
  const system = [];
  const settings = [];

  for (const item of items) {
    if (item.section === 'settings') settings.push(item);
    else if (item.section === 'system') system.push(item);
    else if (item.section === 'organisation') organisation.push(item);
    else primary.push(item);
  }

  return { primary, organisation, system, settings };
}

/** CEO/DCEO (and similar) scoped to the personal host/calendar portal only. */
export function isExecutiveOnlyUser(permissions = []) {
  const has = (key) => permissionMatches(permissions, key);
  return has('executive.dashboard') && !has('management.dashboard') && !has('admin.dashboard');
}

export function resolvePrimaryPortal(hasPermission, permissions = []) {
  if (isExecutiveOnlyUser(permissions)) {
    return 'host';
  }

  if (
    permissionMatches(permissions, 'executive.dashboard')
    || permissionMatches(permissions, 'host.dashboard')
  ) {
    return 'host';
  }

  if (permissionMatches(permissions, 'reception.dashboard')) {
    return 'reception';
  }

  for (const portalId of PORTAL_PRIORITY) {
    const items = getVisibleNavItems(portalId, hasPermission);
    if (items.length > 0) return portalId;
  }
  return 'admin';
}

/** Resolve which portal a pathname belongs to (longest matching prefix). */
export function resolvePortalFromPath(pathname = '') {
  const path = String(pathname || '');
  return Object.values(PORTALS)
    .filter((portal) => path === portal.routePrefix || path.startsWith(`${portal.routePrefix}/`))
    .sort((a, b) => b.routePrefix.length - a.routePrefix.length)[0] || null;
}

/** Short crumb label, e.g. "Administration Portal" → "Administration". */
export function portalBreadcrumbLabel(portal) {
  return String(portal?.label || '').replace(/\s+Portal$/i, '') || 'App';
}

/** Default breadcrumbs: Portal → current page title. */
export function defaultPortalBreadcrumbs(pathname = '', pageTitle = '') {
  const portal = resolvePortalFromPath(pathname);
  if (!portal) return [];
  const portalLabel = portalBreadcrumbLabel(portal);
  const title = String(pageTitle || '').trim();
  if (!title) return [{ label: portalLabel, to: portal.routePrefix }];
  return [
    { label: portalLabel, to: portal.routePrefix },
    { label: title },
  ];
}

/** Default post-login route for a permission set. */
export function resolvePortalRoute(permissions = []) {
  const hasPermission = (key) => permissionMatches(permissions, key);
  const portalId = resolvePrimaryPortal(hasPermission, permissions);
  return PORTALS[portalId]?.routePrefix || '/admin';
}

/** Default home route after sign-in — calendar dashboard for host/executive users. */
export function resolveDefaultHomeRoute(permissions = []) {
  if (
    permissionMatches(permissions, 'executive.dashboard')
    || permissionMatches(permissions, 'host.dashboard')
  ) {
    return PORTALS.host.routePrefix;
  }
  if (permissionMatches(permissions, 'reception.calendar')) {
    return `${PORTALS.reception.routePrefix}/calendar`;
  }
  if (permissionMatches(permissions, 'reception.dashboard')) {
    return PORTALS.reception.routePrefix;
  }
  return resolvePortalRoute(permissions);
}

/** Prefer the user's primary portal; never send host-calendar users to /management. */
export function resolveLoginRedirect(fromPath = '', permissions = []) {
  const homeRoute = resolveDefaultHomeRoute(permissions);
  const from = String(fromPath || '').trim();

  // Calendar/host users always land on the merged host dashboard after sign-in.
  if (
    permissionMatches(permissions, 'executive.dashboard')
    || permissionMatches(permissions, 'host.dashboard')
  ) {
    return homeRoute;
  }

  if (!from || from === '/' || from === '/login' || from.startsWith('/admin/login') || from.startsWith('/platform') || from.startsWith('/executive')) {
    return homeRoute;
  }
  if (isExecutiveOnlyUser(permissions) && from.startsWith('/management')) {
    return homeRoute;
  }
  return from;
}

export function canAccessPortal(portalId, hasPermission, permissions = []) {
  if (isExecutiveOnlyUser(permissions) && portalId !== 'host') {
    return false;
  }
  if (portalId === 'host') {
    return [
      'executive.dashboard',
      'executive.calendar',
      'executive.visits',
      'host.dashboard',
      'host.invite',
      'host.visitors',
    ].some((perm) => hasPermission(perm));
  }
  return getVisibleNavItems(portalId, hasPermission).length > 0;
}

/** Portals the signed-in user can access (for sidebar switcher). */
export function getAccessiblePortals(hasPermission, permissions = []) {
  if (isExecutiveOnlyUser(permissions)) {
    return [];
  }

  return PORTAL_PRIORITY.filter((portalId) => {
    const items = getVisibleNavItems(portalId, hasPermission);
    return items.length > 0;
  }).map((portalId) => ({
    ...PORTALS[portalId],
    id: portalId,
  }));
}
