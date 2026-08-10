/**
 * Canonical organisation structure relationships (visitor access control).
 *
 * Organisation (company)
 * ├── Department                  — org chart unit (no site required)
 * ├── Site / Branch               — physical place
 * │   ├── Building
 * │   │   └── Zone               — access level inside a building
 * │   │       └── Office         — room (needs zone + department)
 * │   └── Station / Gate         — reception or entry point on a site
 * └── Employee / Host             — department + site (+ optional office)
 */

export const ORG_STRUCTURE_ORDER = [
  'organisation',
  'site',
  'building',
  'zone',
  'station',
  'department',
  'office',
  'employee',
];

export const ORG_STRUCTURE_RULES = {
  organisation: {
    label: 'Organisation',
    parents: [],
    required: [],
  },
  site: {
    label: 'Site / Branch',
    parents: ['organisation'],
    required: ['organisation_id'],
  },
  building: {
    label: 'Building',
    parents: ['site'],
    required: ['site_id'],
  },
  zone: {
    label: 'Zone',
    parents: ['building'],
    required: ['building_id'],
  },
  station: {
    label: 'Station / Gate',
    parents: ['site'],
    required: ['site_id'],
    note: 'Access points belong to a site/branch, not a department.',
  },
  department: {
    label: 'Department',
    parents: ['organisation'],
    required: ['organisation_id'],
    note: 'Org-chart unit. Created with organisation only — no site/building required.',
  },
  office: {
    label: 'Office',
    parents: ['organisation', 'department', 'building', 'zone'],
    required: ['organisation_id', 'department_id', 'building_id', 'zone_id'],
    derives: ['site_id'],
    note: 'Room number in a zone, assigned to a department. Building and site are inherited from the zone.',
  },
  employee: {
    label: 'Employee / Host',
    parents: ['organisation', 'department', 'site'],
    required: ['organisation_id', 'department_id', 'site_id'],
    optional: ['office_id'],
    note: 'Works in a department at a site. Optional office must match that department and site.',
  },
};

export const STATION_TYPES = [
  { value: 'reception', label: 'Reception' },
  { value: 'gate', label: 'Gate' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'kiosk', label: 'Kiosk' },
];

export function describeOrgHierarchy() {
  return [
    'Organisation → Sites & Branches',
    'Site → Buildings & Zones',
    'Site → Stations & Gates',
    'Organisation → Departments',
    'Building + Department → Offices',
    'Department + Site (+ Office) → Employees & Hosts',
  ];
}
