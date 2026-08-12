import pool from './db.js';
import { generateId } from './visitorSchema.js';
import { writeAuditLog } from './auditService.js';

export const VEHICLE_STATUS_TRANSITIONS = {
  expected: ['arrived_at_gate', 'cancelled'],
  arrived_at_gate: ['entry_approved', 'cancelled'],
  entry_approved: ['on_site'],
  on_site: ['exit_gate', 'departed'],
  exit_gate: ['exited', 'departed'],
  exited: [],
  departed: [],
  cancelled: [],
};

export function canTransitionVehicle(fromStatus, toStatus) {
  const allowed = VEHICLE_STATUS_TRANSITIONS[fromStatus] || VEHICLE_STATUS_TRANSITIONS.on_site || [];
  return allowed.includes(toStatus);
}

export async function ensureAccessSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      visit_id VARCHAR(90) NOT NULL,
      host_id VARCHAR(90),
      title VARCHAR(255),
      scheduled_at DATETIME,
      status VARCHAR(40) DEFAULT 'scheduled',
      calendar_synced TINYINT(1) DEFAULT 0,
      created_by VARCHAR(90),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_appointment_visit (visit_id),
      INDEX idx_appointments_org (organisation_id),
      INDEX idx_appointments_scheduled (scheduled_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_contact_details (
      visitor_id VARCHAR(90) PRIMARY KEY,
      id_type VARCHAR(40),
      id_number VARCHAR(80),
      confidential_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expected_vehicles (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      visit_id VARCHAR(90),
      appointment_id VARCHAR(90),
      plate_number VARCHAR(40) NOT NULL,
      driver_name VARCHAR(255),
      passenger_count INT DEFAULT 0,
      status VARCHAR(30) DEFAULT 'expected',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_expected_vehicles_visit (visit_id),
      INDEX idx_expected_vehicles_plate (plate_number),
      INDEX idx_expected_vehicles_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_entries (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      vehicle_id VARCHAR(90),
      expected_vehicle_id VARCHAR(90),
      visit_id VARCHAR(90),
      plate_number VARCHAR(40) NOT NULL,
      driver_name VARCHAR(255),
      passenger_names JSON,
      gate_station_id VARCHAR(90),
      status VARCHAR(30) DEFAULT 'arrived_at_gate',
      approved_by VARCHAR(90),
      approved_at DATETIME,
      entered_at DATETIME,
      exited_at DATETIME,
      created_by VARCHAR(90),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vehicle_entries_plate (plate_number),
      INDEX idx_vehicle_entries_visit (visit_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reception_points (
      id VARCHAR(90) PRIMARY KEY,
      site_id VARCHAR(90) NOT NULL,
      station_id VARCHAR(90),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(40) DEFAULT 'main_reception',
      status VARCHAR(30) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reception_points_site (site_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parking_bays (
      id VARCHAR(90) PRIMARY KEY,
      site_id VARCHAR(90) NOT NULL,
      code VARCHAR(40) NOT NULL,
      zone VARCHAR(80),
      status VARCHAR(30) DEFAULT 'available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_site_bay (site_id, code)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS host_contacts (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      host_id VARCHAR(90) NOT NULL,
      visitor_id VARCHAR(90),
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(80),
      company VARCHAR(255),
      use_count INT DEFAULT 1,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_host_contacts_host (host_id),
      INDEX idx_host_contacts_org (organisation_id),
      INDEX idx_host_contacts_name (host_id, full_name)
    )
  `);

  const categoryColumns = [
    { name: 'classification', ddl: "ADD COLUMN classification VARCHAR(20) DEFAULT 'standard'" },
  ];
  for (const col of categoryColumns) {
    const [[exists]] = await pool.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visitor_categories' AND COLUMN_NAME = ?`,
      [col.name],
    );
    if (!Number(exists?.count)) {
      await pool.query(`ALTER TABLE visitor_categories ${col.ddl}`);
    }
  }

  const visitColumns = [
    { name: 'appointment_id', ddl: 'ADD COLUMN appointment_id VARCHAR(90) NULL' },
    { name: 'confidential_notes', ddl: 'ADD COLUMN confidential_notes TEXT NULL' },
  ];
  for (const col of visitColumns) {
    const [[exists]] = await pool.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visits' AND COLUMN_NAME = ?`,
      [col.name],
    );
    if (!Number(exists?.count)) {
      await pool.query(`ALTER TABLE visits ${col.ddl}`);
    }
  }
}

export async function seedAccessData() {
  const [[org]] = await pool.query('SELECT id FROM organisations LIMIT 1');
  const [[site]] = org?.id
    ? await pool.query('SELECT id FROM sites WHERE organisation_id = ? LIMIT 1', [org.id])
    : [[]];
  const [[receptionStation]] = site?.id
    ? await pool.query("SELECT id FROM stations WHERE site_id = ? AND type = 'reception' LIMIT 1", [site.id])
    : [[]];

  if (!site?.id) return;

  const [[existingRp]] = await pool.query(
    'SELECT id FROM reception_points WHERE site_id = ? LIMIT 1',
    [site.id],
  );
  if (!existingRp) {
    await pool.query(
      `INSERT INTO reception_points (id, site_id, station_id, name, type, status)
       VALUES (?, ?, ?, 'Main Reception Desk', 'main_reception', 'active')`,
      [generateId('rp'), site.id, receptionStation?.id || null],
    );
  }

  for (const bay of ['A1', 'A2', 'B1', 'VIP-1']) {
    await pool.query(
      `INSERT IGNORE INTO parking_bays (id, site_id, code, zone, status)
       VALUES (?, ?, ?, ?, 'available')`,
      [generateId('bay'), site.id, bay, bay.startsWith('VIP') ? 'VIP' : 'General'],
    );
  }

  if (org?.id) {
    await pool.query(
      `UPDATE visitor_categories SET classification = 'vip' WHERE organisation_id = ? AND slug = 'vip'`,
      [org.id],
    );
    const [[vvipCat]] = await pool.query(
      "SELECT id FROM visitor_categories WHERE organisation_id = ? AND slug = 'vvip' LIMIT 1",
      [org.id],
    );
    if (!vvipCat) {
      await pool.query(
        `INSERT INTO visitor_categories (id, organisation_id, name, slug, requires_approval, default_duration_minutes, classification)
         VALUES (?, ?, 'VVIP', 'vvip', 1, 480, 'vvip')`,
        [generateId('cat'), org.id],
      );
    }
    await pool.query(
      `UPDATE visitor_categories SET classification = 'standard'
       WHERE organisation_id = ? AND slug NOT IN ('vip', 'vvip') AND (classification IS NULL OR classification = '')`,
      [org.id],
    );
  }

  console.log('[access] Reception points, parking bays and VIP classifications seeded.');
}

export async function createAppointmentForVisit(poolConn, {
  organisationId,
  visitId,
  hostId,
  scheduledAt,
  title,
  createdBy,
}) {
  const id = generateId('appt');
  await poolConn.query(
    `INSERT INTO appointments (id, organisation_id, visit_id, host_id, title, scheduled_at, status, calendar_synced, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 1, ?)`,
    [
      id,
      organisationId,
      visitId,
      hostId || null,
      title || 'Visitor appointment',
      scheduledAt || null,
      createdBy || null,
    ],
  );
  try {
    await poolConn.query('UPDATE visits SET appointment_id = ? WHERE id = ?', [id, visitId]);
  } catch (error) {
    // Older DBs may not have visits.appointment_id yet; appointment row is still useful.
    console.warn('[access] Could not set visits.appointment_id:', error.message);
  }
  return id;
}

export async function upsertVisitorContactDetails(poolConn, visitorId, {
  idType,
  idNumber,
  confidentialNotes,
  actorUserId = null,
  organisationId = null,
}) {
  if (!idNumber && !confidentialNotes && !idType) return;
  await poolConn.query(
    `INSERT INTO visitor_contact_details (visitor_id, id_type, id_number, confidential_notes)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id_type = COALESCE(VALUES(id_type), visitor_contact_details.id_type),
       id_number = COALESCE(VALUES(id_number), visitor_contact_details.id_number),
       confidential_notes = COALESCE(VALUES(confidential_notes), visitor_contact_details.confidential_notes),
       updated_at = NOW()`,
    [visitorId, idType || null, idNumber || null, confidentialNotes || null],
  );

  // Never put idNumber/confidentialNotes *values* in the audit trail — only
  // which fields changed (Logic.md: "Visitor ID numbers... not included in logs").
  const fieldsUpdated = [idType && 'idType', idNumber && 'idNumber', confidentialNotes && 'confidentialNotes'].filter(Boolean);
  await writeAuditLog(poolConn, {
    organisationId,
    actorUserId,
    action: 'visitor.details_updated',
    targetType: 'visitor',
    targetId: visitorId,
    details: { fieldsUpdated },
  });
}

export async function upsertHostContact(poolConn, {
  organisationId,
  hostId,
  visitorId,
  fullName,
  email,
  phone,
  company,
}) {
  const name = String(fullName || '').trim();
  if (!organisationId || !hostId || !name) return null;

  const phoneNorm = String(phone || '').trim() || null;
  const emailNorm = String(email || '').trim() || null;
  const companyNorm = String(company || '').trim() || null;

  let existing = null;
  if (phoneNorm) {
    const [[row]] = await poolConn.query(
      `SELECT id FROM host_contacts
       WHERE host_id = ? AND organisation_id = ? AND phone = ?
       LIMIT 1`,
      [hostId, organisationId, phoneNorm],
    );
    existing = row;
  }
  if (!existing) {
    const [[row]] = await poolConn.query(
      `SELECT id FROM host_contacts
       WHERE host_id = ? AND organisation_id = ? AND LOWER(full_name) = LOWER(?)
       LIMIT 1`,
      [hostId, organisationId, name],
    );
    existing = row;
  }

  if (existing?.id) {
    await poolConn.query(
      `UPDATE host_contacts
       SET full_name = ?, email = ?, phone = ?, company = ?,
           visitor_id = COALESCE(?, visitor_id),
           use_count = use_count + 1,
           last_used_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [name, emailNorm, phoneNorm, companyNorm, visitorId || null, existing.id],
    );
    return existing.id;
  }

  const id = generateId('hct');
  await poolConn.query(
    `INSERT INTO host_contacts (
      id, organisation_id, host_id, visitor_id, full_name, email, phone, company, use_count, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
    [id, organisationId, hostId, visitorId || null, name, emailNorm, phoneNorm, companyNorm],
  );
  return id;
}
