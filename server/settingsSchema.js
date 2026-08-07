import pool from './db.js';
import { seedSystemSettings } from './services/adminSettingsService.js';

export async function ensureSettingsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(80) PRIMARY KEY,
      setting_value JSON NOT NULL,
      updated_by VARCHAR(90),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function seedSettingsData() {
  await seedSystemSettings();
}
