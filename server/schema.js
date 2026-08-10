import crypto from 'crypto';
import pool from './db.js';
import { hashPassword } from './auth.js';
import { ensureRbacTables, seedRbac } from './rbacService.js';
import { ensureVisitorSchema, seedVisitorData, seedOfficeHierarchy } from './visitorSchema.js';
import { ensurePasswordResetSchema } from './hostPortalService.js';
import { ensureSecuritySchema, seedSecurityData } from './securitySchema.js';
import { ensureComplianceSchema, seedComplianceData } from './complianceSchema.js';
import { ensurePlatformSchema, seedPlatformData } from './platformSchema.js';
import { ensureAccessSchema, seedAccessData } from './accessSchema.js';
import { seedPortalUsers, seedSampleVisits } from './seedPortalUsers.js';
import { ensureSettingsSchema, seedSettingsData } from './settingsSchema.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(90) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(60),
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(30) DEFAULT 'user',
      email_verified TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await ensureRbacTables(pool);
}

export async function seedDefaultAdmin() {
  const ADMIN_EMAIL = String(process.env.DEFAULT_ADMIN_EMAIL || 'admin@template.dev').trim().toLowerCase();
  const ADMIN_PASSWORD = String(process.env.DEFAULT_ADMIN_PASSWORD || 'admin123').trim();
  const ADMIN_NAME = String(process.env.DEFAULT_ADMIN_NAME || 'Template Admin').trim();

  const [[existing]] = await pool.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (existing) {
    console.log('[auth] Admin user already exists, skipping seed.');
    return;
  }

  if (IS_PRODUCTION && (!process.env.DEFAULT_ADMIN_EMAIL || !process.env.DEFAULT_ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin123')) {
    throw new Error('DEFAULT_ADMIN_EMAIL and a non-default DEFAULT_ADMIN_PASSWORD are required before seeding the first production admin.');
  }

  const id = `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = hashPassword(ADMIN_PASSWORD);

  await pool.query(
    `INSERT INTO users (id, name, email, phone, password_hash, role, email_verified)
     VALUES (?, ?, ?, '', ?, 'admin', 1)`,
    [id, ADMIN_NAME, ADMIN_EMAIL, passwordHash],
  );
  console.log(`[auth] Default admin user seeded: ${ADMIN_EMAIL}`);
}

export async function bootstrapDatabase() {
  await ensureSchema();
  await ensureVisitorSchema();
  await ensurePasswordResetSchema(pool);
  await ensureSecuritySchema();
  await ensureComplianceSchema();
  await ensurePlatformSchema();
  await ensureAccessSchema();
  await ensureSettingsSchema();
  await seedDefaultAdmin();
  await seedRbac(pool);
  await seedVisitorData();
  await seedOfficeHierarchy();
  await seedSecurityData();
  await seedComplianceData();
  await seedPlatformData();
  await seedAccessData();
  await seedSettingsData();
  await seedPortalUsers();
  if (process.env.SEED_DEMO_VISITS === '1') {
    await seedSampleVisits();
  }
}
