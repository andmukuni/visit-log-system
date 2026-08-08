import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adaptSqlForPostgres, prepareCreateTable } from '../server/sqlDialect.js';

describe('PostgreSQL SQL adapter', () => {
  it('converts placeholders and date helpers', () => {
    const sql = adaptSqlForPostgres(
      'SELECT COUNT(*) AS count FROM visits WHERE created_at >= CURDATE() AND organisation_id = ?',
    );
    assert.match(sql, /organisation_id = \$1/);
    assert.match(sql, /CURRENT_DATE/);
    assert.doesNotMatch(sql, /CURDATE\(\)/);
  });

  it('converts weekly date grouping', () => {
    const sql = adaptSqlForPostgres(
      `SELECT DATE(created_at) AS visit_date, COUNT(*) AS count
       FROM visits
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(created_at)`,
    );
    assert.match(sql, /\(created_at\)::date/);
    assert.match(sql, /CURRENT_DATE - INTERVAL '6 day'/);
  });

  it('converts DATE_ADD and start-of-week DATE_SUB for executive KPIs', () => {
    const weekRange = adaptSqlForPostgres(
      'AND a.scheduled_at >= CURDATE() AND a.scheduled_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
    );
    assert.match(weekRange, /CURRENT_DATE \+ INTERVAL '7 day'/);
    assert.doesNotMatch(weekRange, /DATE_ADD/);

    const weekStart = adaptSqlForPostgres(
      'AND vis.updated_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)',
    );
    assert.match(weekStart, /date_trunc\('week', CURRENT_DATE\)::date/);
    assert.doesNotMatch(weekStart, /WEEKDAY/);
  });

  it('converts INSERT IGNORE to ON CONFLICT DO NOTHING', () => {
    const sql = adaptSqlForPostgres(
      'INSERT IGNORE INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
    );
    assert.match(sql, /ON CONFLICT DO NOTHING/);
    assert.doesNotMatch(sql, /INSERT IGNORE/);
  });

  it('converts ON DUPLICATE KEY UPDATE upserts', () => {
    const sql = adaptSqlForPostgres(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
    );
    assert.match(sql, /ON CONFLICT \(setting_key\) DO UPDATE SET/);
    assert.match(sql, /EXCLUDED\.setting_value/);
  });

  it('extracts inline indexes from CREATE TABLE', () => {
    const { ddl, indexes } = prepareCreateTable(`
      CREATE TABLE IF NOT EXISTS sites (
        id VARCHAR(90) PRIMARY KEY,
        organisation_id VARCHAR(90) NOT NULL,
        INDEX idx_sites_org (organisation_id)
      )
    `);
    assert.match(ddl, /CREATE TABLE IF NOT EXISTS sites/);
    assert.doesNotMatch(ddl, /INDEX idx_sites_org/);
    assert.equal(indexes.length, 1);
    assert.match(indexes[0], /CREATE INDEX IF NOT EXISTS idx_sites_org ON sites/);
  });

  it('converts information_schema column checks', () => {
    const sql = adaptSqlForPostgres(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visits' AND COLUMN_NAME = ?`,
    );
    assert.match(sql, /information_schema\.columns/i);
    assert.match(sql, /table_schema = 'public'/);
    assert.match(sql, /column_name = \$1/);
  });

  it('converts GROUP_CONCAT to STRING_AGG', () => {
    const sql = adaptSqlForPostgres('SELECT GROUP_CONCAT(DISTINCT ar.slug) AS role_slugs FROM admin_roles ar');
    assert.match(sql, /STRING_AGG\(DISTINCT ar\.slug::text, ','\)/);
  });
});
