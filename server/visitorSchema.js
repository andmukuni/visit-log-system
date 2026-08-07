import crypto from 'crypto';
import pool from './db.js';

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export const VISIT_STATUSES = [
  'pre_registered',
  'pending_approval',
  'approved',
  'expected',
  'arrived_at_gate',
  'entered_premises',
  'reception_check_in',
  'checked_in',
  'waiting',
  'in_meeting',
  'checked_out',
  'left_premises',
  'completed',
  'rejected',
  'cancelled',
  'denied',
  'overdue',
  'expired',
];

export async function ensureVisitorSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organisations (
      id VARCHAR(90) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(80) NOT NULL UNIQUE,
      status VARCHAR(30) DEFAULT 'active',
      timezone VARCHAR(60) DEFAULT 'Africa/Lusaka',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sites (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(40),
      address TEXT,
      status VARCHAR(30) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sites_org (organisation_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buildings (
      id VARCHAR(90) PRIMARY KEY,
      site_id VARCHAR(90) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_buildings_site (site_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS zones (
      id VARCHAR(90) PRIMARY KEY,
      building_id VARCHAR(90) NOT NULL,
      name VARCHAR(120) NOT NULL,
      access_level VARCHAR(40) DEFAULT 'public',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_zones_building (building_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stations (
      id VARCHAR(90) PRIMARY KEY,
      site_id VARCHAR(90) NOT NULL,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(40) DEFAULT 'reception',
      status VARCHAR(30) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_stations_site (site_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(40),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_departments_org (organisation_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosts (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      department_id VARCHAR(90),
      user_id VARCHAR(90),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(60),
      status VARCHAR(30) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_hosts_org (organisation_id),
      INDEX idx_hosts_dept (department_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_categories (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(60) NOT NULL,
      requires_approval TINYINT(1) DEFAULT 1,
      default_duration_minutes INT DEFAULT 120,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_category_slug (organisation_id, slug)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitors (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      phone VARCHAR(60),
      email VARCHAR(255),
      company VARCHAR(255),
      id_type VARCHAR(40),
      id_number_masked VARCHAR(40),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_visitors_org (organisation_id),
      INDEX idx_visitors_name (full_name),
      INDEX idx_visitors_phone (phone)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      site_id VARCHAR(90) NOT NULL,
      station_id VARCHAR(90),
      visitor_id VARCHAR(90) NOT NULL,
      host_id VARCHAR(90),
      department_id VARCHAR(90),
      category_id VARCHAR(90),
      purpose TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'pending_approval',
      expected_at DATETIME,
      approved_at DATETIME,
      checked_in_at DATETIME,
      checked_out_at DATETIME,
      badge_number VARCHAR(40),
      pass_code VARCHAR(40),
      created_by VARCHAR(90),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_visits_org (organisation_id),
      INDEX idx_visits_site (site_id),
      INDEX idx_visits_status (status),
      INDEX idx_visits_visitor (visitor_id),
      INDEX idx_visits_host (host_id),
      INDEX idx_visits_checked_in (checked_in_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_events (
      id VARCHAR(90) PRIMARY KEY,
      visit_id VARCHAR(90) NOT NULL,
      event_type VARCHAR(60) NOT NULL,
      actor_user_id VARCHAR(90),
      station_id VARCHAR(90),
      details JSON,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_visit_events_visit (visit_id),
      INDEX idx_visit_events_type (event_type)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_approvals (
      id VARCHAR(90) PRIMARY KEY,
      visit_id VARCHAR(90) NOT NULL,
      approver_user_id VARCHAR(90),
      decision VARCHAR(20) NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_visit_approvals_visit (visit_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      visit_id VARCHAR(90),
      plate_number VARCHAR(40) NOT NULL,
      vehicle_type VARCHAR(60),
      make VARCHAR(80),
      colour VARCHAR(40),
      driver_name VARCHAR(255),
      status VARCHAR(30) DEFAULT 'on_site',
      entry_station_id VARCHAR(90),
      exit_station_id VARCHAR(90),
      entered_at DATETIME,
      exited_at DATETIME,
      created_by VARCHAR(90),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vehicles_org (organisation_id),
      INDEX idx_vehicles_plate (plate_number),
      INDEX idx_vehicles_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS badges (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      badge_number VARCHAR(40) NOT NULL,
      status VARCHAR(30) DEFAULT 'available',
      visit_id VARCHAR(90),
      issued_at DATETIME,
      returned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_badge (organisation_id, badge_number),
      INDEX idx_badges_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90),
      actor_user_id VARCHAR(90),
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(60),
      target_id VARCHAR(90),
      result VARCHAR(30) DEFAULT 'success',
      details JSON,
      ip_address VARCHAR(45),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_org (organisation_id),
      INDEX idx_audit_action (action),
      INDEX idx_audit_created (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_scopes (
      user_id VARCHAR(90) NOT NULL,
      organisation_id VARCHAR(90) NOT NULL,
      site_id VARCHAR(90),
      station_id VARCHAR(90),
      department_id VARCHAR(90),
      PRIMARY KEY (user_id, organisation_id),
      INDEX idx_user_scopes_org (organisation_id)
    )
  `);
}

export async function seedVisitorData() {
  const [[existingOrg]] = await pool.query('SELECT id FROM organisations LIMIT 1');
  if (existingOrg) {
    console.log('[visitor] Demo organisation already exists, skipping seed.');
    return;
  }

  const orgId = generateId('org');
  const siteId = generateId('site');
  const stationId = generateId('stn');
  const deptId = generateId('dept');
  const buildingId = generateId('bld');
  const zoneId = generateId('zone');

  await pool.query(
    `INSERT INTO organisations (id, name, slug, status, timezone) VALUES (?, ?, ?, 'active', 'Africa/Lusaka')`,
    [orgId, 'Demo Organisation', 'demo-org'],
  );

  await pool.query(
    `INSERT INTO sites (id, organisation_id, name, code, address, status) VALUES (?, ?, ?, ?, ?, 'active')`,
    [siteId, orgId, 'Head Office', 'HQ', 'Lusaka, Zambia'],
  );

  const site2Id = generateId('site');
  const site3Id = generateId('site');
  const site4Id = generateId('site');
  const station2Id = generateId('stn');
  const station3Id = generateId('stn');
  const station4Id = generateId('stn');
  await pool.query(
    `INSERT INTO sites (id, organisation_id, name, code, address, status) VALUES (?, ?, ?, ?, ?, 'active')`,
    [site2Id, orgId, 'Warehouse Branch', 'WH', 'Ndola, Zambia'],
  );
  await pool.query(
    `INSERT INTO sites (id, organisation_id, name, code, address, status) VALUES (?, ?, ?, ?, ?, 'active')`,
    [site3Id, orgId, 'Regional Office', 'RO', 'Kitwe, Zambia'],
  );
  await pool.query(
    `INSERT INTO sites (id, organisation_id, name, code, address, status) VALUES (?, ?, ?, ?, ?, 'active')`,
    [site4Id, orgId, 'Distribution Centre', 'DC', 'Livingstone, Zambia'],
  );

  await pool.query(
    `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'reception', 'active')`,
    [stationId, siteId, 'Main Reception'],
  );

  await pool.query(
    `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'gate', 'active')`,
    [station2Id, site2Id, 'Warehouse Gate'],
  );

  await pool.query(
    `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'reception', 'active')`,
    [station3Id, site3Id, 'Regional Office Reception'],
  );

  await pool.query(
    `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'reception', 'active')`,
    [station4Id, site4Id, 'Distribution Centre Reception'],
  );

  await pool.query(
    `INSERT INTO departments (id, organisation_id, name, code) VALUES (?, ?, ?, ?)`,
    [deptId, orgId, 'Human Resources', 'HR'],
  );

  await pool.query(
    `INSERT INTO buildings (id, site_id, name) VALUES (?, ?, ?)`,
    [buildingId, siteId, 'Main Building'],
  );

  await pool.query(
    `INSERT INTO zones (id, building_id, name, access_level) VALUES (?, ?, ?, ?)`,
    [zoneId, buildingId, 'Reception Area', 'public'],
  );

  const categories = [
    { name: 'Guest', slug: 'guest', approval: 1, duration: 120, classification: 'standard' },
    { name: 'Contractor', slug: 'contractor', approval: 1, duration: 480, classification: 'standard' },
    { name: 'Supplier', slug: 'supplier', approval: 1, duration: 60, classification: 'standard' },
    { name: 'Delivery / Courier', slug: 'delivery', approval: 0, duration: 30, classification: 'standard' },
    { name: 'VIP', slug: 'vip', approval: 1, duration: 240, classification: 'vip' },
    { name: 'VVIP', slug: 'vvip', approval: 1, duration: 480, classification: 'vvip' },
  ];

  for (const cat of categories) {
    await pool.query(
      `INSERT INTO visitor_categories (id, organisation_id, name, slug, requires_approval, default_duration_minutes, classification)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId('cat'), orgId, cat.name, cat.slug, cat.approval, cat.duration, cat.classification],
    );
  }

  const hosts = [
    { name: 'Jane Mwamba', email: 'jane.mwamba@demo.org', phone: '+260971000001' },
    { name: 'Peter Banda', email: 'peter.banda@demo.org', phone: '+260971000002' },
    { name: 'Grace Lungu', email: 'grace.lungu@demo.org', phone: '+260971000003' },
  ];

  for (const host of hosts) {
    await pool.query(
      `INSERT INTO hosts (id, organisation_id, department_id, name, email, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [generateId('host'), orgId, deptId, host.name, host.email, host.phone],
    );
  }

  for (let i = 1; i <= 20; i += 1) {
    await pool.query(
      `INSERT INTO badges (id, organisation_id, badge_number, status) VALUES (?, ?, ?, 'available')`,
      [generateId('badge'), orgId, `V${String(i).padStart(3, '0')}`],
    );
  }

  const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admins[0]?.id) {
    await pool.query(
      `INSERT INTO user_scopes (user_id, organisation_id, site_id, station_id, department_id)
       VALUES (?, ?, ?, ?, ?)`,
      [admins[0].id, orgId, siteId, stationId, deptId],
    );
  }

  console.log('[visitor] Demo organisation, site, station and reference data seeded.');
}

export { generateId };
