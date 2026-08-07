import pool from './db.js';
import { generateId } from './visitorSchema.js';

export const ROLL_CALL_STATUSES = [
  'not_yet_accounted_for',
  'accounted_for',
  'left_site',
  'unknown',
];

export async function ensureSecuritySchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS watchlist_entries (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      entry_type VARCHAR(20) NOT NULL DEFAULT 'visitor',
      full_name VARCHAR(255),
      phone VARCHAR(60),
      email VARCHAR(255),
      plate_number VARCHAR(40),
      reason TEXT NOT NULL,
      severity VARCHAR(20) DEFAULT 'medium',
      status VARCHAR(30) DEFAULT 'active',
      valid_from DATETIME,
      valid_until DATETIME,
      created_by VARCHAR(90),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_watchlist_org (organisation_id),
      INDEX idx_watchlist_status (status),
      INDEX idx_watchlist_name (full_name),
      INDEX idx_watchlist_phone (phone),
      INDEX idx_watchlist_plate (plate_number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      site_id VARCHAR(90),
      visit_id VARCHAR(90),
      incident_type VARCHAR(60) NOT NULL DEFAULT 'security',
      severity VARCHAR(20) DEFAULT 'medium',
      status VARCHAR(30) DEFAULT 'open',
      title VARCHAR(255) NOT NULL,
      narrative TEXT,
      reported_by VARCHAR(90),
      assigned_to VARCHAR(90),
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_incidents_org (organisation_id),
      INDEX idx_incidents_site (site_id),
      INDEX idx_incidents_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS emergency_roll_calls (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      site_id VARCHAR(90),
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      reason VARCHAR(255),
      started_by VARCHAR(90),
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_by VARCHAR(90),
      closed_at DATETIME,
      notes TEXT,
      INDEX idx_roll_calls_org (organisation_id),
      INDEX idx_roll_calls_site (site_id),
      INDEX idx_roll_calls_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roll_call_entries (
      id VARCHAR(90) PRIMARY KEY,
      roll_call_id VARCHAR(90) NOT NULL,
      visit_id VARCHAR(90) NOT NULL,
      visitor_id VARCHAR(90) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'not_yet_accounted_for',
      marked_by VARCHAR(90),
      marked_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_roll_call_visit (roll_call_id, visit_id),
      INDEX idx_roll_call_entries_roll (roll_call_id),
      INDEX idx_roll_call_entries_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_exports (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      exported_by VARCHAR(90) NOT NULL,
      report_type VARCHAR(60) NOT NULL,
      format VARCHAR(20) NOT NULL DEFAULT 'csv',
      purpose TEXT,
      filters JSON,
      row_count INT DEFAULT 0,
      mask_level VARCHAR(30),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_report_exports_org (organisation_id),
      INDEX idx_report_exports_user (exported_by),
      INDEX idx_report_exports_created (created_at)
    )
  `);
}

export async function seedSecurityData() {
  const [[org]] = await pool.query('SELECT id FROM organisations LIMIT 1');
  if (!org?.id) return;

  const [[existing]] = await pool.query(
    'SELECT id FROM watchlist_entries WHERE organisation_id = ? LIMIT 1',
    [org.id],
  );
  if (existing) return;

  await pool.query(
    `INSERT INTO watchlist_entries (id, organisation_id, entry_type, full_name, phone, reason, severity, status)
     VALUES (?, ?, 'visitor', ?, ?, ?, 'high', 'active')`,
    [
      generateId('wl'),
      org.id,
      'Restricted Person',
      '+260979999001',
      'Previous unauthorised access attempt — requires security review before entry.',
    ],
  );

  console.log('[security] Demo watchlist entry seeded.');
}
