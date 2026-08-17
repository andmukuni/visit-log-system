/**
 * Visitors Log RBAC permission catalog — shared by API and UI.
 */

export const RBAC_SUPER_ADMIN_SLUG = 'super_admin';

const RECEPTION_PERMISSIONS = [
  { key: 'reception.dashboard', name: 'View reception dashboard', group: 'Reception' },
  { key: 'reception.calendar', name: 'View expected visitors calendar', group: 'Reception' },
  { key: 'reception.visitors.register', name: 'Register walk-in visitors', group: 'Reception' },
  { key: 'reception.visitors.view', name: 'View visitor records', group: 'Reception' },
  { key: 'reception.visitors.checkin', name: 'Check visitors in at reception', group: 'Reception' },
  { key: 'reception.visitors.checkout', name: 'Check visitors out at reception', group: 'Reception' },
  { key: 'reception.approvals.track', name: 'Track pending approval requests', group: 'Reception' },
  { key: 'reception.host.queue', name: 'Queue visitors to host', group: 'Reception' },
  { key: 'reception.hosts.availability', name: 'View host availability', group: 'Reception' },
  { key: 'reception.badges', name: 'Badge desk at reception', group: 'Reception' },
  { key: 'reception.occupancy', name: 'View reception occupancy', group: 'Reception' },
];

const STATION_PERMISSIONS = [
  { key: 'station.dashboard', name: 'View station dashboard', group: 'Station' },
  { key: 'station.visitors.register', name: 'Register visitors', group: 'Station' },
  { key: 'station.visitors.view', name: 'View visitor logs', group: 'Station' },
  { key: 'station.visitors.checkin', name: 'Check visitors in', group: 'Station' },
  { key: 'station.visitors.checkout', name: 'Check visitors out', group: 'Station' },
  { key: 'station.vehicles.register', name: 'Register vehicles', group: 'Station' },
  { key: 'station.vehicles.view', name: 'View vehicle logs', group: 'Station' },
  { key: 'station.deliveries', name: 'Manage deliveries', group: 'Station' },
  { key: 'station.badges', name: 'Badge desk', group: 'Station' },
  { key: 'station.occupancy', name: 'View occupancy', group: 'Station' },
  { key: 'station.emergency', name: 'Emergency list', group: 'Station' },
  { key: 'station.incidents', name: 'Report incidents', group: 'Station' },
  { key: 'station.activity', name: 'View own activity', group: 'Station' },
];

const ADMIN_PORTAL_PERMISSIONS = [
  { key: 'admin.dashboard', name: 'View admin dashboard', group: 'Administration' },
  { key: 'admin.organisations', name: 'Manage organisations', group: 'Administration' },
  { key: 'admin.sites', name: 'Manage sites', group: 'Administration' },
  { key: 'admin.zones', name: 'Manage buildings & zones', group: 'Administration' },
  { key: 'admin.stations', name: 'Manage stations & gates', group: 'Administration' },
  { key: 'admin.departments', name: 'Manage departments', group: 'Administration' },
  { key: 'admin.offices', name: 'Manage offices', group: 'Administration' },
  { key: 'admin.positions', name: 'Manage positions', group: 'Administration' },
  { key: 'admin.hosts', name: 'Manage employees & hosts', group: 'Administration' },
  { key: 'admin.receptionists', name: 'Manage receptionists', group: 'Administration' },
  { key: 'admin.security_guards', name: 'Manage security guards', group: 'Administration' },
  { key: 'admin.users', name: 'Manage users', group: 'Administration' },
  { key: 'admin.rbac', name: 'Manage roles & permissions', group: 'Administration' },
  { key: 'admin.categories', name: 'Manage visitor categories', group: 'Administration' },
  { key: 'admin.visitors', name: 'View organisation visitors', group: 'Administration' },
  { key: 'admin.vehicles', name: 'View organisation vehicles', group: 'Administration' },
  { key: 'admin.workflows', name: 'Manage approval workflows', group: 'Administration' },
  { key: 'admin.badges', name: 'Manage badge inventory', group: 'Administration' },
  { key: 'admin.notifications', name: 'Manage notifications', group: 'Administration' },
  { key: 'admin.reports', name: 'View admin reports', group: 'Administration' },
  { key: 'admin.privacy', name: 'Manage privacy & retention', group: 'Administration' },
  { key: 'admin.integrations', name: 'Manage integrations', group: 'Administration' },
  { key: 'admin.audit', name: 'View audit logs', group: 'Administration' },
  { key: 'admin.settings', name: 'Manage organisation settings', group: 'Administration' },
];

const SECURITY_PERMISSIONS = [
  { key: 'security.dashboard', name: 'View security dashboard', group: 'Security' },
  { key: 'security.occupancy', name: 'View live occupancy', group: 'Security' },
  { key: 'security.approvals', name: 'Manage approval queue', group: 'Security' },
  { key: 'security.exceptions', name: 'Manage exceptions', group: 'Security' },
  { key: 'security.visitors', name: 'Search visitors', group: 'Security' },
  { key: 'security.vehicles', name: 'Monitor vehicles', group: 'Security' },
  { key: 'security.contractors', name: 'Review contractors', group: 'Security' },
  { key: 'security.watchlist', name: 'Manage watchlist', group: 'Security' },
  { key: 'security.badges', name: 'Manage badges', group: 'Security' },
  { key: 'security.incidents', name: 'Manage incidents', group: 'Security' },
  { key: 'security.overdue', name: 'View overdue visits', group: 'Security' },
  { key: 'security.rollcall', name: 'Emergency roll call', group: 'Security' },
  { key: 'security.stations', name: 'Monitor stations', group: 'Security' },
  { key: 'security.reports', name: 'Security reports', group: 'Security' },
  { key: 'security.audit', name: 'Activity audit', group: 'Security' },
];

const HOST_PERMISSIONS = [
  { key: 'host.dashboard', name: 'View host dashboard', group: 'Host' },
  { key: 'host.invite', name: 'Invite visitors', group: 'Host' },
  { key: 'host.visitors', name: 'View my visitors', group: 'Host' },
  { key: 'host.approvals', name: 'Approve/reject visits', group: 'Host' },
  { key: 'host.onsite', name: 'View on-site visitors', group: 'Host' },
  { key: 'host.recurring', name: 'Manage recurring visits', group: 'Host' },
  { key: 'host.groups', name: 'Manage group visits', group: 'Host' },
  { key: 'host.delegates', name: 'Manage delegates', group: 'Host' },
  { key: 'host.notifications', name: 'View notifications', group: 'Host' },
  { key: 'host.profile', name: 'Manage profile', group: 'Host' },
];

const MANAGEMENT_PERMISSIONS = [
  { key: 'management.dashboard', name: 'Executive dashboard', group: 'Management' },
  { key: 'management.occupancy', name: 'Live occupancy (masked)', group: 'Management' },
  { key: 'management.analytics', name: 'View analytics', group: 'Management' },
  { key: 'management.reports', name: 'Generate reports', group: 'Management' },
  { key: 'management.scheduled', name: 'Scheduled reports', group: 'Management' },
  { key: 'management.exports', name: 'Export history', group: 'Management' },
];

const COMPLIANCE_PERMISSIONS = [
  { key: 'compliance.dashboard', name: 'Compliance dashboard', group: 'Compliance' },
  { key: 'compliance.audit', name: 'Audit trail', group: 'Compliance' },
  { key: 'compliance.access', name: 'User access review', group: 'Compliance' },
  { key: 'compliance.privileged', name: 'Privileged access review', group: 'Compliance' },
  { key: 'compliance.approvals', name: 'Approval & override logs', group: 'Compliance' },
  { key: 'compliance.exports', name: 'Export logs', group: 'Compliance' },
  { key: 'compliance.privacy', name: 'Privacy requests', group: 'Compliance' },
  { key: 'compliance.retention', name: 'Retention & legal holds', group: 'Compliance' },
  { key: 'compliance.incidents', name: 'Incident review', group: 'Compliance' },
  { key: 'compliance.register', name: 'Data processing register', group: 'Compliance' },
  { key: 'compliance.reports', name: 'Compliance reports', group: 'Compliance' },
  { key: 'compliance.evidence', name: 'Evidence export', group: 'Compliance' },
];

const EMERGENCY_PERMISSIONS = [
  { key: 'emergency.dashboard', name: 'Emergency dashboard', group: 'Emergency' },
  { key: 'emergency.occupancy', name: 'Current occupancy', group: 'Emergency' },
  { key: 'emergency.rollcall', name: 'Roll call', group: 'Emergency' },
  { key: 'emergency.zones', name: 'Zone view', group: 'Emergency' },
  { key: 'emergency.unresolved', name: 'Unresolved persons', group: 'Emergency' },
  { key: 'emergency.contacts', name: 'Emergency contacts', group: 'Emergency' },
  { key: 'emergency.history', name: 'Previous events', group: 'Emergency' },
  { key: 'emergency.export', name: 'Print/export', group: 'Emergency' },
];

const EXECUTIVE_PERMISSIONS = [
  { key: 'executive.dashboard', name: 'Executive dashboard', group: 'Executive' },
  { key: 'executive.calendar', name: 'View my appointments', group: 'Executive' },
  { key: 'executive.appointments', name: 'Manage executive appointments', group: 'Executive' },
  { key: 'executive.visits', name: 'View my visitors', group: 'Executive' },
  { key: 'executive.contacts', name: 'Manage my contacts', group: 'Executive' },
  { key: 'executive.full_contact', name: 'View full VIP/VVIP contact details', group: 'Executive' },
  { key: 'executive.assign_vip', name: 'Assign VIP/VVIP classification', group: 'Executive' },
];

export const EXECUTIVE_PORTAL_KEYS = [
  'executive.dashboard',
  'executive.calendar',
  'executive.appointments',
  'executive.visits',
  'executive.contacts',
  'executive.full_contact',
  'executive.assign_vip',
  'host.notifications',
];

/**
 * Calendar + scheduling access for employees on the merged host portal.
 * Includes `executive.contacts` so an employee can keep their own contact
 * list; it never exposes another host's visitors. Deliberately excludes
 * `executive.full_contact` and `executive.assign_vip` — VIP contact detail and
 * VIP classification stay with the executive roles.
 */
export const EMPLOYEE_CALENDAR_KEYS = [
  'executive.dashboard',
  'executive.calendar',
  'executive.appointments',
  'executive.visits',
  'executive.contacts',
];

/**
 * Executive assistants act on the principal's behalf: full calendar,
 * appointments and VIP contact detail so they can coordinate visits — but NOT
 * `executive.assign_vip`. Classifying a visitor as VIP/VVIP is a policy
 * decision reserved for the executive themselves.
 */
export const EXECUTIVE_SECRETARY_KEYS = EXECUTIVE_PORTAL_KEYS
  .filter((key) => key !== 'executive.assign_vip');

const EXECUTIVE_KEYS = EXECUTIVE_PERMISSIONS.map((p) => p.key);

const PLATFORM_PERMISSIONS = [
  { key: 'platform.dashboard', name: 'Platform dashboard', group: 'Platform' },
  { key: 'platform.calendar', name: 'Platform calendar', group: 'Platform' },
  { key: 'platform.logbook', name: 'Platform log book', group: 'Platform' },
  { key: 'platform.visitors', name: 'Platform visitors', group: 'Platform' },
  { key: 'platform.vehicles', name: 'Platform vehicles', group: 'Platform' },
  { key: 'platform.organisations', name: 'Manage organisations', group: 'Platform' },
  { key: 'platform.subscriptions', name: 'Manage subscriptions', group: 'Platform' },
  { key: 'platform.users', name: 'Platform users', group: 'Platform' },
  { key: 'platform.health', name: 'System health', group: 'Platform' },
  { key: 'platform.integrations', name: 'Global integrations', group: 'Platform' },
  { key: 'platform.support', name: 'Support access', group: 'Platform' },
  { key: 'platform.audit', name: 'Global audit logs', group: 'Platform' },
  { key: 'platform.settings', name: 'Platform settings', group: 'Platform' },
];

export const ADMIN_PERMISSIONS = [
  ...PLATFORM_PERMISSIONS,
  ...ADMIN_PORTAL_PERMISSIONS,
  ...SECURITY_PERMISSIONS,
  ...RECEPTION_PERMISSIONS,
  ...STATION_PERMISSIONS,
  ...HOST_PERMISSIONS,
  ...MANAGEMENT_PERMISSIONS,
  ...COMPLIANCE_PERMISSIONS,
  ...EMERGENCY_PERMISSIONS,
  ...EXECUTIVE_PERMISSIONS,
];

export const ALL_PERMISSION_KEYS = ADMIN_PERMISSIONS.map((p) => p.key);

export const RECEPTION_KEYS = RECEPTION_PERMISSIONS.map((p) => p.key);

const STATION_KEYS = STATION_PERMISSIONS.map((p) => p.key);
const ADMIN_KEYS = ADMIN_PORTAL_PERMISSIONS.map((p) => p.key);
const SECURITY_KEYS = SECURITY_PERMISSIONS.map((p) => p.key);
const HOST_KEYS = HOST_PERMISSIONS.map((p) => p.key);
const MANAGEMENT_KEYS = MANAGEMENT_PERMISSIONS.map((p) => p.key);
const COMPLIANCE_KEYS = COMPLIANCE_PERMISSIONS.map((p) => p.key);
const EMERGENCY_KEYS = EMERGENCY_PERMISSIONS.map((p) => p.key);
const PLATFORM_KEYS = PLATFORM_PERMISSIONS.map((p) => p.key);

export const DEFAULT_ADMIN_ROLES = [
  {
    slug: RBAC_SUPER_ADMIN_SLUG,
    name: 'Super Admin',
    description: 'Full access to all portals and features.',
    is_system: true,
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    slug: 'org_admin',
    name: 'Organisation Administrator',
    description: 'Manage organisation configuration, users and policies.',
    is_system: true,
    permissions: ADMIN_KEYS,
  },
  {
    slug: 'security_manager',
    name: 'Security Manager',
    description: 'Oversee security operations and exceptions.',
    is_system: true,
    permissions: [...SECURITY_KEYS, 'station.dashboard', 'station.occupancy', 'station.visitors.view'],
  },
  {
    slug: 'receptionist',
    name: 'Receptionist',
    description: 'Reception desk check-in, visitor passes and host queue for the assigned zone.',
    is_system: true,
    // Previously carried STATION_KEYS — byte-identical to gate_security — while
    // still being a reception-lock role, so holders were locked to /reception
    // with zero reception permissions and an empty portal. Reception desks are
    // differentiated by assigned ZONE, not by permission set.
    permissions: RECEPTION_KEYS,
  },
  {
    slug: 'host',
    name: 'Employee / Host',
    description: 'Invite, approve and monitor own visitors.',
    is_system: true,
    permissions: [...HOST_KEYS, ...EMPLOYEE_CALENDAR_KEYS],
  },
  {
    slug: 'management_viewer',
    name: 'Management Viewer',
    description: 'Read-only management dashboards and reports.',
    is_system: true,
    permissions: MANAGEMENT_KEYS,
  },
  {
    slug: 'auditor',
    name: 'Auditor / Compliance Officer',
    description: 'Read-only compliance and audit access.',
    is_system: true,
    permissions: COMPLIANCE_KEYS,
  },
  {
    slug: 'emergency_officer',
    name: 'Emergency Officer',
    description: 'Emergency occupancy and roll-call access.',
    is_system: true,
    permissions: EMERGENCY_KEYS,
  },
  {
    slug: 'platform_admin',
    name: 'Platform Administrator',
    description: 'Multi-organisation administration via the Administration portal.',
    is_system: true,
    // Platform portal retired — use Administration with platform-wide access retained.
    permissions: [...new Set([...ADMIN_KEYS, ...PLATFORM_KEYS])],
  },
  {
    slug: 'gate_security',
    name: 'Gate Security',
    description: 'Vehicle capture and gate entry processing.',
    is_system: true,
    permissions: STATION_KEYS,
  },
  {
    slug: 'main_reception',
    name: 'Main Reception',
    description: 'Reception desk check-in and visitor pass issuance.',
    is_system: true,
    permissions: RECEPTION_KEYS,
  },
  {
    slug: 'executive_reception',
    name: 'Executive Reception',
    description: 'Executive reception with full VIP/VVIP contact access.',
    is_system: true,
    permissions: [...RECEPTION_KEYS, ...EXECUTIVE_KEYS],
  },
  {
    slug: 'ceo_secretary',
    name: 'CEO Secretary',
    description: 'Manage the CEO calendar and VIP/VVIP appointments (cannot assign VIP status).',
    is_system: true,
    permissions: [...new Set([...HOST_KEYS, ...EXECUTIVE_SECRETARY_KEYS])],
  },
  {
    slug: 'dceo_secretary',
    name: 'DCEO Secretary',
    description: 'Manage the DCEO calendar and VIP/VVIP appointments (cannot assign VIP status).',
    is_system: true,
    permissions: [...new Set([...HOST_KEYS, ...EXECUTIVE_SECRETARY_KEYS])],
  },
  {
    slug: 'ceo',
    name: 'CEO',
    description: 'Host portal calendar, VIP visitors, and personal visitor management.',
    is_system: true,
    permissions: [...new Set([...EXECUTIVE_PORTAL_KEYS, ...HOST_KEYS])],
  },
  {
    slug: 'dceo',
    name: 'DCEO',
    description: 'Host portal calendar, VIP visitors, and personal visitor management.',
    is_system: true,
    permissions: [...new Set([...EXECUTIVE_PORTAL_KEYS, ...HOST_KEYS])],
  },
];

/** Legacy nav map for old admin demo routes */
export const NAV_PERMISSION_MAP = {
  dashboard: 'admin.dashboard',
  items: 'admin.dashboard',
  'items-create': 'admin.dashboard',
  users: 'admin.users',
  settings: 'admin.settings',
  'access-control': 'admin.rbac',
};

export function permissionMatches(have = [], need = '') {
  const required = String(need || '').trim();
  if (!required) return true;
  const set = new Set((have || []).map((p) => String(p).trim()));
  if (set.has(RBAC_SUPER_ADMIN_SLUG)) return true;
  if (set.has('*')) return true;
  return set.has(required);
}

export function hasAnyPermission(have = [], needs = []) {
  const list = Array.isArray(needs) ? needs : [needs];
  return list.some((n) => permissionMatches(have, n));
}

export function hasPortalAccess(have = [], portalId = '') {
  const prefix = `${portalId}.`;
  return (have || []).some((p) => String(p).startsWith(prefix));
}
