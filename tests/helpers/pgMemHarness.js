/**
 * Disposable in-memory PostgreSQL harness.
 *
 * Runs the project's REAL SQL through the REAL Postgres dialect adapter
 * (server/sqlDialect.js), so joins, aliases, parameter ordering and dialect
 * translation are genuinely exercised — unlike a mocked pool, which returns
 * whatever rows the test author imagines.
 *
 * NEVER points at the live/remote database: pg-mem is process-local memory and
 * is discarded when the test ends.
 */
import { newDb, DataType } from 'pg-mem';
import { runPostgresQuery } from '../../server/sqlDialect.js';

/** Mirrors the real org hierarchy seen on the remote database. */
export const FIXTURE = {
  orgId: 'org-wg',
  otherOrgId: 'org-other',
  siteId: 'site-hq',
  otherSiteId: 'site-branch',
  buildingId: 'bld-head-office',
  otherBuildingId: 'bld-annex',
  gateId: 'stn-main-gate',
  otherGateId: 'stn-back-gate',
  zones: {
    ceo: 'zone-ceo-reception',
    dceo: 'zone-dceo-reception',
    area: 'zone-reception-area',
  },
};

const DDL = [
  `CREATE TABLE organisations (id VARCHAR(90) PRIMARY KEY, name VARCHAR(255), slug VARCHAR(80), status VARCHAR(30))`,
  `CREATE TABLE sites (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), name VARCHAR(255), status VARCHAR(30))`,
  `CREATE TABLE buildings (id VARCHAR(90) PRIMARY KEY, site_id VARCHAR(90), name VARCHAR(255))`,
  `CREATE TABLE zones (id VARCHAR(90) PRIMARY KEY, building_id VARCHAR(90), name VARCHAR(120), access_level VARCHAR(40))`,
  `CREATE TABLE stations (id VARCHAR(90) PRIMARY KEY, site_id VARCHAR(90), name VARCHAR(255), type VARCHAR(40), status VARCHAR(30))`,
  `CREATE TABLE departments (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), name VARCHAR(255))`,
  `CREATE TABLE positions (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), name VARCHAR(255))`,
  `CREATE TABLE offices (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), department_id VARCHAR(90),
     building_id VARCHAR(90), zone_id VARCHAR(90), site_id VARCHAR(90), office_number VARCHAR(40),
     name VARCHAR(255), status VARCHAR(30))`,
  `CREATE TABLE users (id VARCHAR(90) PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), phone VARCHAR(60),
     password_hash TEXT, role VARCHAR(40), email_verified INT)`,
  `CREATE TABLE admin_roles (id VARCHAR(90) PRIMARY KEY, slug VARCHAR(60), name VARCHAR(120), is_system INT)`,
  `CREATE TABLE user_admin_roles (user_id VARCHAR(90), role_id VARCHAR(90))`,
  `CREATE TABLE hosts (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), department_id VARCHAR(90),
     site_id VARCHAR(90), office_id VARCHAR(90), zone_id VARCHAR(90), position_id VARCHAR(90),
     user_id VARCHAR(90), title VARCHAR(40), name VARCHAR(255), email VARCHAR(255), phone VARCHAR(60),
     status VARCHAR(30), availability VARCHAR(30))`,
  `CREATE TABLE receptionists (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), site_id VARCHAR(90),
     zone_id VARCHAR(90), station_id VARCHAR(90), department_id VARCHAR(90), user_id VARCHAR(90),
     name VARCHAR(255), email VARCHAR(255), phone VARCHAR(60), status VARCHAR(30))`,
  `CREATE TABLE security_guards (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), site_id VARCHAR(90),
     station_id VARCHAR(90), department_id VARCHAR(90), user_id VARCHAR(90), name VARCHAR(255),
     email VARCHAR(255), phone VARCHAR(60), status VARCHAR(30))`,
  `CREATE TABLE visitor_categories (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), name VARCHAR(120),
     slug VARCHAR(60), classification VARCHAR(30), requires_approval INT, default_duration_minutes INT)`,
  `CREATE TABLE visitors (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), full_name VARCHAR(255),
     phone VARCHAR(60), email VARCHAR(255), company VARCHAR(255), id_type VARCHAR(40), id_number_masked VARCHAR(40))`,
  `CREATE TABLE visitor_contact_details (visitor_id VARCHAR(90) PRIMARY KEY, id_type VARCHAR(40),
     id_number VARCHAR(60), confidential_notes TEXT)`,
  `CREATE TABLE visits (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), site_id VARCHAR(90),
     station_id VARCHAR(90), visitor_id VARCHAR(90), host_id VARCHAR(90), department_id VARCHAR(90),
     category_id VARCHAR(90), office_id VARCHAR(90), zone_id VARCHAR(90), purpose TEXT, status VARCHAR(40),
     expected_at TIMESTAMP, approved_at TIMESTAMP, checked_in_at TIMESTAMP, checked_out_at TIMESTAMP,
     badge_number VARCHAR(40), pass_code VARCHAR(40), created_by VARCHAR(90), approval_requested_by VARCHAR(90),
     appointment_id VARCHAR(90), invite_token VARCHAR(90), check_in_signature TEXT, confidential_notes TEXT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE appointments (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), visit_id VARCHAR(90),
     host_id VARCHAR(90), title VARCHAR(255), scheduled_at TIMESTAMP, duration_minutes INT, status VARCHAR(30),
     calendar_synced INT, created_by VARCHAR(90))`,
  `CREATE TABLE visit_events (id VARCHAR(90) PRIMARY KEY, visit_id VARCHAR(90), event_type VARCHAR(60),
     actor_user_id VARCHAR(90), station_id VARCHAR(90), details TEXT, reason TEXT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE visit_approvals (id VARCHAR(90) PRIMARY KEY, visit_id VARCHAR(90), approver_user_id VARCHAR(90),
     decision VARCHAR(20), reason TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE visit_host_approval_tokens (id VARCHAR(90) PRIMARY KEY, visit_id VARCHAR(90),
     token_hash VARCHAR(128), expires_at TIMESTAMP, used_at TIMESTAMP,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE host_zones (host_id VARCHAR(90), zone_id VARCHAR(90), organisation_id VARCHAR(90), status VARCHAR(30))`,
  `CREATE TABLE receptionist_zones (receptionist_id VARCHAR(90), zone_id VARCHAR(90), organisation_id VARCHAR(90), status VARCHAR(30))`,
  `CREATE TABLE vehicles (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), visit_id VARCHAR(90),
     plate_number VARCHAR(40), status VARCHAR(30))`,
  `CREATE TABLE expected_vehicles (id VARCHAR(90) PRIMARY KEY, visit_id VARCHAR(90), plate_number VARCHAR(40),
     status VARCHAR(30))`,
  `CREATE TABLE audit_logs (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), actor_user_id VARCHAR(90),
     action VARCHAR(80), target_type VARCHAR(60), target_id VARCHAR(90), result VARCHAR(30), details TEXT,
     ip_address VARCHAR(45), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE notifications (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), user_id VARCHAR(90),
     channel VARCHAR(30), notification_type VARCHAR(80), title VARCHAR(255), body TEXT, status VARCHAR(30),
     read_at TIMESTAMP, metadata TEXT, idempotency_key VARCHAR(160), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE notification_deliveries (id VARCHAR(90) PRIMARY KEY, notification_id VARCHAR(90),
     channel VARCHAR(30), status VARCHAR(30), recipient VARCHAR(255), error_message TEXT,
     provider_message_id VARCHAR(120), attempt_count INT DEFAULT 0, attempted_at TIMESTAMP, delivered_at TIMESTAMP)`,
  `CREATE TABLE notification_templates (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90),
     template_key VARCHAR(80), channel VARCHAR(30), subject VARCHAR(255), body_template TEXT, enabled INT DEFAULT 1)`,
  `CREATE TABLE user_notification_preferences (id VARCHAR(90) PRIMARY KEY, user_id VARCHAR(90),
     organisation_id VARCHAR(90), channel VARCHAR(30), category_key VARCHAR(60), enabled INT)`,
  `CREATE TABLE user_scopes (user_id VARCHAR(90), organisation_id VARCHAR(90), site_id VARCHAR(90),
     station_id VARCHAR(90), department_id VARCHAR(90), office_id VARCHAR(90))`,
  `CREATE TABLE watchlist_entries (id VARCHAR(90) PRIMARY KEY, organisation_id VARCHAR(90), entry_type VARCHAR(30),
     full_name VARCHAR(255), phone VARCHAR(60), email VARCHAR(255), plate_number VARCHAR(40), reason TEXT,
     severity VARCHAR(30), status VARCHAR(30), created_by VARCHAR(90), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
];

/** Create a disposable Postgres-backed pool wired through the real dialect adapter. */
export async function createTestPool() {
  // noAstCoverageCheck: pg-mem otherwise throws on valid DDL whose AST nodes
  // its planner does not explicitly consume (PRIMARY KEY + NOT NULL +
  // DEFAULT CURRENT_TIMESTAMP in one statement). The statements still execute.
  const db = newDb({ noAstCoverageCheck: true });

  // Harness shims only — real PostgreSQL provides these natively. pg-mem does
  // not coerce varchar/text for NULLIF, so register a text-typed variant.
  db.public.registerFunction({
    name: 'nullif',
    args: [DataType.text, DataType.text],
    returns: DataType.text,
    allowNullArguments: true,
    implementation: (a, b) => (a === b ? null : a),
  });

  const pgAdapter = db.adapters.createPg();
  const client = new pgAdapter.Client();
  await client.connect();

  const pool = {
    driver: 'postgres',
    query: (sql, params = []) => runPostgresQuery(client, sql, params),
    end: async () => {},
  };

  for (const ddl of DDL) {
    await client.query(ddl);
  }
  return pool;
}

/**
 * Seed the real-world relationships observed on the remote database:
 * CEO -> "CEO - Reception", DCEO -> "DCEO - Reception",
 * GENERAL EMPLOYEE (host) -> "Reception Area".
 */
export async function seedFixture(pool) {
  const q = (sql, params = []) => pool.query(sql, params);
  const F = FIXTURE;

  await q(`INSERT INTO organisations (id, name, slug, status) VALUES (?, ?, ?, 'active')`, [F.orgId, 'Wonderful Group', 'wg']);
  await q(`INSERT INTO organisations (id, name, slug, status) VALUES (?, ?, ?, 'active')`, [F.otherOrgId, 'Other Co', 'other']);
  await q(`INSERT INTO sites (id, organisation_id, name, status) VALUES (?, ?, ?, 'active')`, [F.siteId, F.orgId, 'HQ-Main Office']);
  await q(`INSERT INTO sites (id, organisation_id, name, status) VALUES (?, ?, ?, 'active')`, [F.otherSiteId, F.orgId, 'Branch']);
  await q(`INSERT INTO buildings (id, site_id, name) VALUES (?, ?, ?)`, [F.buildingId, F.siteId, 'WG Head Office']);
  await q(`INSERT INTO buildings (id, site_id, name) VALUES (?, ?, ?)`, [F.otherBuildingId, F.siteId, 'Annex']);
  await q(`INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'gate', 'active')`, [F.gateId, F.siteId, 'WG - Main Gate']);
  await q(`INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'gate', 'active')`, [F.otherGateId, F.siteId, 'Back Gate']);

  for (const [key, name] of [['ceo', 'CEO - Reception'], ['dceo', 'DCEO - Reception'], ['area', 'Reception Area']]) {
    await q(`INSERT INTO zones (id, building_id, name, access_level) VALUES (?, ?, ?, 'public')`, [F.zones[key], F.buildingId, name]);
  }

  await q(`INSERT INTO departments (id, organisation_id, name) VALUES (?, ?, ?)`, ['dept-exec', F.orgId, 'Executive']);
  for (const [slug, name] of [['ceo', 'CEO'], ['dceo', 'DCEO'], ['host', 'Employee / Host'], ['main_reception', 'Main Reception']]) {
    await q(`INSERT INTO admin_roles (id, slug, name, is_system) VALUES (?, ?, ?, 1)`, [`role-${slug}`, slug, name]);
  }
  return F;
}

/** Insert a host with an optional office and explicit zone rows. */
export async function seedHost(pool, { id, name, roleSlug, zoneIds = [], officeId = null, userId = null, siteId = FIXTURE.siteId, orgId = FIXTURE.orgId, email = null, phone = '+260977000001' }) {
  const uid = userId || `usr-${id}`;
  const hostEmail = email || `${id}@example.com`;
  await pool.query(
    `INSERT INTO users (id, name, email, phone, role, email_verified) VALUES (?, ?, ?, ?, 'user', 1)`,
    [uid, name, hostEmail, phone],
  );
  if (roleSlug) {
    await pool.query(`INSERT INTO user_admin_roles (user_id, role_id) VALUES (?, ?)`, [uid, `role-${roleSlug}`]);
  }
  await pool.query(
    `INSERT INTO hosts (id, organisation_id, department_id, site_id, office_id, zone_id, user_id, name, email, phone, status, availability)
     VALUES (?, ?, 'dept-exec', ?, ?, ?, ?, ?, ?, ?, 'active', 'available')`,
    [id, orgId, siteId, officeId, zoneIds[0] || null, uid, name, hostEmail, phone],
  );
  for (const zoneId of zoneIds) {
    await pool.query(
      `INSERT INTO host_zones (host_id, zone_id, organisation_id, status) VALUES (?, ?, ?, 'active')`,
      [id, zoneId, orgId],
    );
  }
  return { hostId: id, userId: uid };
}

export async function seedReceptionist(pool, { id, name, zoneIds = [], statuses = {}, siteId = FIXTURE.siteId, orgId = FIXTURE.orgId }) {
  const uid = `usr-${id}`;
  await pool.query(
    `INSERT INTO users (id, name, email, phone, role, email_verified) VALUES (?, ?, ?, ?, 'user', 1)`,
    [uid, name, `${id}@example.com`, '+260970000000'],
  );
  await pool.query(`INSERT INTO user_admin_roles (user_id, role_id) VALUES (?, 'role-main_reception')`, [uid]);
  await pool.query(
    `INSERT INTO receptionists (id, organisation_id, site_id, zone_id, user_id, name, email, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [id, orgId, siteId, zoneIds[0] || null, uid, name, `${id}@example.com`],
  );
  for (const zoneId of zoneIds) {
    await pool.query(
      `INSERT INTO receptionist_zones (receptionist_id, zone_id, organisation_id, status) VALUES (?, ?, ?, ?)`,
      [id, zoneId, orgId, statuses[zoneId] || 'active'],
    );
  }
  return { receptionistId: id, userId: uid };
}

export async function seedGuard(pool, { id, name, stationIds = [], buildingIds = [], statuses = {}, siteId = FIXTURE.siteId, orgId = FIXTURE.orgId, legacyStationId = null }) {
  const uid = `usr-${id}`;
  await pool.query(
    `INSERT INTO users (id, name, email, role, email_verified) VALUES (?, ?, ?, 'user', 1)`,
    [uid, name, `${id}@example.com`],
  );
  await pool.query(
    `INSERT INTO security_guards (id, organisation_id, site_id, station_id, user_id, name, email, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [id, orgId, siteId, legacyStationId, uid, name, `${id}@example.com`],
  );
  for (const stationId of stationIds) {
    await pool.query(
      `INSERT INTO security_guard_stations (security_guard_id, station_id, organisation_id, status) VALUES (?, ?, ?, ?)`,
      [id, stationId, orgId, statuses[stationId] || 'active'],
    );
  }
  for (const buildingId of buildingIds) {
    await pool.query(
      `INSERT INTO security_guard_buildings (security_guard_id, building_id, organisation_id, status) VALUES (?, ?, ?, ?)`,
      [id, buildingId, orgId, statuses[buildingId] || 'active'],
    );
  }
  return { guardId: id, userId: uid };
}

export async function seedVisit(pool, {
  id, hostId, zoneId = null, officeId = null, stationId = null, siteId = FIXTURE.siteId, orgId = FIXTURE.orgId,
  visitor = {}, status = 'expected', createdBy = null, approvalRequestedBy = null,
  checkedInAt = null, expectedAt = '2026-08-20T09:00:00Z',
}) {
  const visitorId = `vis-${id}`;
  await pool.query(
    `INSERT INTO visitors (id, organisation_id, full_name, phone, email, company, id_number_masked)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      visitorId, orgId,
      visitor.full_name || 'Jane Doe',
      visitor.phone || '+260971111111',
      visitor.email || 'jane@acme.example',
      visitor.company || 'Acme Holdings',
      '******78/9',
    ],
  );
  await pool.query(
    `INSERT INTO visitor_contact_details (visitor_id, id_type, id_number, confidential_notes)
     VALUES (?, 'nrc', ?, ?)`,
    [visitorId, '123456/78/9', 'HOST PRIVATE: acquisition discussion'],
  );
  await pool.query(
    `INSERT INTO visits (id, organisation_id, site_id, station_id, visitor_id, host_id, office_id, zone_id,
       purpose, status, expected_at, pass_code, invite_token, check_in_signature, confidential_notes,
       created_by, approval_requested_by, checked_in_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, orgId, siteId, stationId, visitorId, hostId, officeId, zoneId,
      'Quarterly acquisition review', status, expectedAt,
      'PASS42', 'secret-invite-token', 'base64-signature', 'HOST PRIVATE NOTE',
      createdBy, approvalRequestedBy, checkedInAt,
    ],
  );
  return { visitId: id, visitorId };
}
