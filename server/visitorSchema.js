import crypto from 'crypto';
import pool, { getDbDriver } from './db.js';

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

async function ensureColumn(db, tableName, columnName, ddl) {
  const [[exists]] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  if (!Number(exists?.count)) {
    await db.query(`ALTER TABLE ${tableName} ${ddl}`);
  }
}

async function tableExists(db, tableName) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName],
  );
  return Boolean(Number(row?.count));
}

/** Create offices table + office_id columns (safe to re-run). */
export async function ensureOfficeSchema(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS offices (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      department_id VARCHAR(90) NOT NULL,
      building_id VARCHAR(90),
      zone_id VARCHAR(90),
      site_id VARCHAR(90),
      office_number VARCHAR(40) NOT NULL,
      name VARCHAR(255),
      status VARCHAR(30) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_office_number (organisation_id, office_number),
      INDEX idx_offices_org (organisation_id),
      INDEX idx_offices_dept (department_id),
      INDEX idx_offices_building (building_id),
      INDEX idx_offices_zone (zone_id),
      INDEX idx_offices_site (site_id)
    )
  `);
  await ensureColumn(db, 'offices', 'building_id', 'ADD COLUMN building_id VARCHAR(90) NULL');
  await ensureColumn(db, 'offices', 'zone_id', 'ADD COLUMN zone_id VARCHAR(90) NULL');
  // Postgres extracts INDEX clauses from CREATE TABLE and runs them even when the
  // table already exists — recreate after columns are ensured.
  if (getDbDriver() === 'postgres') {
    await db.query('CREATE INDEX IF NOT EXISTS idx_offices_building ON offices (building_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_offices_zone ON offices (zone_id)');
  }
  if (await tableExists(db, 'hosts')) {
    await ensureColumn(db, 'hosts', 'office_id', 'ADD COLUMN office_id VARCHAR(90) NULL');
    await ensureColumn(db, 'hosts', 'site_id', 'ADD COLUMN site_id VARCHAR(90) NULL');
  }
  if (await tableExists(db, 'user_scopes')) {
    await ensureColumn(db, 'user_scopes', 'office_id', 'ADD COLUMN office_id VARCHAR(90) NULL');
  }
}

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

  // Office → Organisation + Department + Building (site inherited from building).
  await ensureOfficeSchema(pool);

  // Employee/host → Organisation + Department + Site (+ optional Office matching dept/site).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosts (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      department_id VARCHAR(90),
      site_id VARCHAR(90),
      office_id VARCHAR(90),
      user_id VARCHAR(90),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(60),
      status VARCHAR(30) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_hosts_org (organisation_id),
      INDEX idx_hosts_dept (department_id),
      INDEX idx_hosts_site (site_id),
      INDEX idx_hosts_office (office_id)
    )
  `);
  await ensureColumn(pool, 'hosts', 'office_id', 'ADD COLUMN office_id VARCHAR(90) NULL');
  await ensureColumn(pool, 'hosts', 'site_id', 'ADD COLUMN site_id VARCHAR(90) NULL');
  await ensureColumn(
    pool,
    'hosts',
    'availability',
    "ADD COLUMN availability VARCHAR(30) NOT NULL DEFAULT 'available'",
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS receptionists (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      site_id VARCHAR(90),
      station_id VARCHAR(90),
      department_id VARCHAR(90),
      user_id VARCHAR(90),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(60),
      status VARCHAR(30) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_receptionists_org (organisation_id),
      INDEX idx_receptionists_site (site_id),
      INDEX idx_receptionists_station (station_id),
      INDEX idx_receptionists_user (user_id)
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
      office_id VARCHAR(90),
      PRIMARY KEY (user_id, organisation_id),
      INDEX idx_user_scopes_org (organisation_id),
      INDEX idx_user_scopes_office (office_id)
    )
  `);
  await ensureColumn(pool, 'user_scopes', 'office_id', 'ADD COLUMN office_id VARCHAR(90) NULL');
  await ensureColumn(pool, 'visits', 'check_in_signature', 'ADD COLUMN check_in_signature MEDIUMTEXT NULL');
  await ensureColumn(pool, 'visits', 'office_id', 'ADD COLUMN office_id VARCHAR(90) NULL');
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
    [siteId, orgId, 'HQ', 'HQ', 'Lusaka, Zambia'],
  );

  await pool.query(
    `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'gate', 'active')`,
    [stationId, siteId, 'Main Gate'],
  );

  await pool.query(
    `INSERT INTO departments (id, organisation_id, name, code) VALUES (?, ?, ?, ?)`,
    [deptId, orgId, 'Human Resources', 'HR'],
  );

  const deptOpsId = generateId('dept');
  const deptExecId = generateId('dept');
  await pool.query(
    `INSERT INTO departments (id, organisation_id, name, code) VALUES (?, ?, ?, ?)`,
    [deptOpsId, orgId, 'Operations', 'OPS'],
  );
  await pool.query(
    `INSERT INTO departments (id, organisation_id, name, code) VALUES (?, ?, ?, ?)`,
    [deptExecId, orgId, 'Executive Office', 'EXEC'],
  );

  await pool.query(
    `INSERT INTO buildings (id, site_id, name) VALUES (?, ?, ?)`,
    [buildingId, siteId, 'Wonderful Group Greatest'],
  );

  // Keep a single public zone for the building (zones depend on buildings).
  await pool.query(
    `INSERT INTO zones (id, building_id, name, access_level) VALUES (?, ?, ?, ?)`,
    [zoneId, buildingId, 'Reception Area', 'public'],
  );

  const officeItId = generateId('off');
  await pool.query(
    `INSERT INTO offices (id, organisation_id, department_id, building_id, zone_id, site_id, office_number, name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [officeItId, orgId, deptOpsId, buildingId, zoneId, siteId, '6', 'IT Dep Group office 6'],
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
    { name: 'Jane Mwamba', email: 'jane.mwamba@demo.org', phone: '+260971000001', departmentId: deptId },
    { name: 'Peter Banda', email: 'peter.banda@demo.org', phone: '+260971000002', departmentId: deptOpsId },
    { name: 'Grace Lungu', email: 'grace.lungu@demo.org', phone: '+260971000003', departmentId: deptExecId },
  ];

  for (const host of hosts) {
    await pool.query(
      `INSERT INTO hosts (id, organisation_id, department_id, site_id, office_id, name, email, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [generateId('host'), orgId, host.departmentId, siteId, officeItId, host.name, host.email, host.phone],
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
      `INSERT INTO user_scopes (user_id, organisation_id, site_id, station_id, department_id, office_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [admins[0].id, orgId, siteId, stationId, deptOpsId, officeItId],
    );
  }

  console.log('[visitor] Demo organisation seeded: HQ / Wonderful Group Greatest / Main Gate / IT Dep Group office 6');
}

/**
 * Wipe sites / buildings / stations / offices (and dependent zones),
 * then seed the canonical HQ location structure.
 * Does NOT modify roles, employees/hosts rows (except location FKs), or departments.
 * Destructive — only for explicit CLI reset, never for normal app boot.
 */
export async function resetAndSeedLocationStructure(db = pool, { force = false } = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !force && process.env.ALLOW_LOCATION_RESET !== '1') {
    console.warn('[visitor] Refusing location structure reset in production (set ALLOW_LOCATION_RESET=1 to override).');
    return { skipped: true, reason: 'production_guard' };
  }

  await ensureOfficeSchema(db);

  // Prefer the demo/portal org so seeded locations match logged-in user scopes.
  let [[org]] = await db.query(
    `SELECT id FROM organisations WHERE slug = 'demo-org' LIMIT 1`,
  );
  if (!org?.id) {
    [[org]] = await db.query(
      `SELECT o.id
       FROM organisations o
       INNER JOIN user_scopes us ON us.organisation_id = o.id
       GROUP BY o.id
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
    );
  }
  if (!org?.id) {
    [[org]] = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  }
  if (!org?.id) {
    return { skipped: true, reason: 'no_organisation' };
  }

  const [[dept]] = await db.query(
    `SELECT id FROM departments
     WHERE organisation_id = ?
     ORDER BY
       CASE
         WHEN LOWER(name) LIKE '%it%' OR LOWER(code) LIKE '%it%' THEN 0
         WHEN code = 'OPS' THEN 1
         ELSE 2
       END,
       name ASC
     LIMIT 1`,
    [org.id],
  );
  if (!dept?.id) {
    return { skipped: true, reason: 'no_department' };
  }

  const siteId = generateId('site');
  const buildingId = generateId('bld');
  const stationId = generateId('stn');
  const officeId = generateId('off');

  // Insert new site/building/station first so NOT NULL FKs can be remapped.
  await db.query(
    `INSERT INTO sites (id, organisation_id, name, code, address, status)
     VALUES (?, ?, 'HQ', 'HQ', 'Lusaka, Zambia', 'active')`,
    [siteId, org.id],
  );
  await db.query(
    `INSERT INTO buildings (id, site_id, name) VALUES (?, ?, ?)`,
    [buildingId, siteId, 'Wonderful Group Greatest'],
  );
  await db.query(
    `INSERT INTO stations (id, site_id, name, type, status)
     VALUES (?, ?, 'Main Gate', 'gate', 'active')`,
    [stationId, siteId],
  );

  // Remap location pointers only (do not alter employee/department/role identity).
  await db.query('UPDATE visits SET site_id = ?, station_id = ? WHERE organisation_id = ?', [
    siteId,
    stationId,
    org.id,
  ]);
  await db.query(
    `UPDATE user_scopes
     SET site_id = ?, station_id = ?, office_id = NULL
     WHERE organisation_id = ?`,
    [siteId, stationId, org.id],
  );
  await db.query(
    `UPDATE hosts
     SET site_id = ?, office_id = NULL
     WHERE organisation_id = ?`,
    [siteId, org.id],
  );

  // Optional dependent location tables (safe if missing).
  try {
    await db.query('UPDATE reception_points SET site_id = ?, station_id = ?', [siteId, stationId]);
  } catch {
    /* table may not exist yet */
  }
  try {
    await db.query('UPDATE parking_bays SET site_id = ?', [siteId]);
  } catch {
    /* table may not exist yet */
  }
  try {
    await db.query(
      'UPDATE vehicles SET entry_station_id = ?, exit_station_id = NULL WHERE organisation_id = ?',
      [stationId, org.id],
    );
  } catch {
    /* ignore */
  }

  // Clear previous seeded location rows, then insert zone + office.
  await db.query('DELETE FROM offices');
  await db.query('DELETE FROM zones');
  await db.query('DELETE FROM stations WHERE id <> ?', [stationId]);
  await db.query('DELETE FROM buildings WHERE id <> ?', [buildingId]);
  await db.query('DELETE FROM sites WHERE id <> ?', [siteId]);

  const zoneId = generateId('zone');
  await db.query(
    `INSERT INTO zones (id, building_id, name, access_level)
     VALUES (?, ?, 'Reception Area', 'public')`,
    [zoneId, buildingId],
  );
  await db.query(
    `INSERT INTO offices (id, organisation_id, department_id, building_id, zone_id, site_id, office_number, name, status)
     VALUES (?, ?, ?, ?, ?, ?, '6', 'IT Dep Group office 6', 'active')`,
    [officeId, org.id, dept.id, buildingId, zoneId, siteId],
  );
  await db.query(
    `UPDATE user_scopes SET office_id = ? WHERE organisation_id = ?`,
    [officeId, org.id],
  );
  await db.query(
    `UPDATE hosts SET office_id = ? WHERE organisation_id = ?`,
    [officeId, org.id],
  );

  // Drop orphaned reception/parking rows that still pointed at deleted sites.
  try {
    await db.query(
      `DELETE FROM reception_points
       WHERE site_id NOT IN (SELECT id FROM sites)`,
    );
  } catch {
    /* ignore */
  }
  try {
    await db.query(
      `DELETE FROM parking_bays
       WHERE site_id NOT IN (SELECT id FROM sites)`,
    );
  } catch {
    /* ignore */
  }

  console.log('[visitor] Location structure reset: HQ → Wonderful Group Greatest → Main Gate + IT Dep Group office 6 + Reception Area');
  return {
    skipped: false,
    siteId,
    buildingId,
    stationId,
    officeId,
    zoneId,
    departmentId: dept.id,
  };
}

/**
 * Bootstrap helper: ensure office schema only.
 * Never wipes location data — that wiped user-added sites/zones/offices on deploy
 * whenever the exact demo HQ building name was missing.
 */
export async function seedOfficeHierarchy(db = pool) {
  await ensureOfficeSchema(db);

  const [[existing]] = await db.query('SELECT id FROM sites LIMIT 1');
  if (existing?.id) {
    return { skipped: true, reason: 'location_data_exists' };
  }

  // Empty database only: insert canonical demo location once.
  return resetAndSeedLocationStructure(db, { force: true });
}

export { generateId };
