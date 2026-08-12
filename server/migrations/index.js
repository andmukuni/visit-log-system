/**
 * Minimal versioned migration runner.
 *
 * The project previously created schema only via idempotent `ensure*Schema()`
 * calls during boot. That is fine for additive columns but gives no record of
 * what ran, no ordering guarantee, and no way to verify a deploy applied a
 * change. Migrations here are:
 *   - versioned  — recorded in `schema_migrations`, applied once, in order
 *   - idempotent — safe to re-run against an already-migrated database
 *   - portable   — MySQL-flavoured SQL, translated for Postgres by sqlDialect
 *
 * They are intentionally additive-only: no migration drops or rewrites data.
 */
import m001 from './001_zone_access_control.js';

export const MIGRATIONS = [m001];

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(60) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(80)
    )
  `);
}

async function appliedVersions(pool) {
  const [rows] = await pool.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((r) => String(r.version)));
}

/**
 * Apply every pending migration in version order.
 * @returns {Promise<{applied: string[], skipped: string[]}>}
 */
export async function runMigrations(pool, { logger = console } = {}) {
  await ensureMigrationsTable(pool);
  const done = await appliedVersions(pool);

  const applied = [];
  const skipped = [];

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version.localeCompare(b.version))) {
    if (done.has(migration.version)) {
      skipped.push(migration.version);
      continue;
    }
    logger.log?.(`[migrate] applying ${migration.version} — ${migration.name}`);
    await migration.up(pool);
    await pool.query(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      [migration.version, migration.name],
    );
    applied.push(migration.version);
  }

  return { applied, skipped };
}

/**
 * Report-only: which migrations would run, without applying anything.
 */
export async function pendingMigrations(pool) {
  await ensureMigrationsTable(pool);
  const done = await appliedVersions(pool);
  return MIGRATIONS.filter((m) => !done.has(m.version)).map((m) => ({
    version: m.version,
    name: m.name,
  }));
}
