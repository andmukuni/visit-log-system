import pool from './db.js';
import { generateId } from './visitorSchema.js';

export async function ensureComplianceSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS privacy_requests (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      request_type VARCHAR(40) NOT NULL DEFAULT 'access',
      subject_name VARCHAR(255),
      subject_email VARCHAR(255),
      status VARCHAR(30) DEFAULT 'open',
      notes TEXT,
      requested_by VARCHAR(90),
      assigned_to VARCHAR(90),
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_privacy_org (organisation_id),
      INDEX idx_privacy_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS retention_policies (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      category VARCHAR(60) NOT NULL,
      label VARCHAR(120) NOT NULL,
      retention_days INT NOT NULL DEFAULT 365,
      legal_hold TINYINT(1) DEFAULT 0,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_retention_category (organisation_id, category)
    )
  `);
}

export async function seedComplianceData() {
  const [[org]] = await pool.query('SELECT id FROM organisations LIMIT 1');
  if (!org?.id) return;

  const [[existing]] = await pool.query(
    'SELECT id FROM retention_policies WHERE organisation_id = ? LIMIT 1',
    [org.id],
  );
  if (existing) return;

  const policies = [
    { category: 'visit_records', label: 'Visitor visit records', days: 730 },
    { category: 'audit_logs', label: 'Audit logs', days: 2555 },
    { category: 'vehicle_logs', label: 'Vehicle entry logs', days: 365 },
    { category: 'incidents', label: 'Security incidents', days: 1825 },
    { category: 'report_exports', label: 'Report export metadata', days: 1095 },
  ];

  for (const p of policies) {
    await pool.query(
      `INSERT INTO retention_policies (id, organisation_id, category, label, retention_days)
       VALUES (?, ?, ?, ?, ?)`,
      [generateId('ret'), org.id, p.category, p.label, p.days],
    );
  }

  await pool.query(
    `INSERT INTO privacy_requests (id, organisation_id, request_type, subject_name, subject_email, status, notes)
     VALUES (?, ?, 'access', ?, ?, 'open', ?)`,
    [
      generateId('pr'),
      org.id,
      'Former visitor',
      'visitor@example.com',
      'Subject requested copy of visit records from March 2026.',
    ],
  );

  console.log('[compliance] Retention policies and sample privacy request seeded.');
}
