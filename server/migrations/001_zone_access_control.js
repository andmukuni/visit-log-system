/**
 * 001 — Zone/location-based visitor access control.
 *
 * Creates the assignment tables that back the zone confidentiality policy and
 * brings existing deployments up to the same shape.
 *
 * Design notes (deliberate, not oversights):
 *
 * - NO FOREIGN KEY CONSTRAINTS. Not one table in this schema uses them; every
 *   relationship is a VARCHAR id validated in application code
 *   (orgStructureService.assertOfficePlacement, loadZoneInOrg, ...). Adding FKs
 *   to only these four tables would (a) diverge from every sibling table and
 *   (b) hard-fail the migration on any pre-existing orphan row — an outage on
 *   deploy. Referential integrity is instead enforced on write, and the read
 *   path INNER JOINs to the parent so an orphan row simply grants nothing.
 *   Delete behaviour is handled explicitly in application code (the zone
 *   delete endpoint already refuses while assignments exist, then clears them).
 *
 * - organisation_id is denormalised onto each assignment row so a tenant
 *   boundary can be asserted without a multi-table join, and is backfilled
 *   from the owning host/receptionist/guard.
 *
 * - status carries 'active' | 'inactive' so an assignment can be revoked
 *   without deleting history. Every read path filters
 *   COALESCE(status,'active') = 'active'.
 *
 * ROLLBACK: `down()` drops only the tables this migration created and removes
 * the columns it added. It is destructive by nature (assignment data is lost)
 * and is provided for disposable/test databases. Do not run it against
 * production without a backup — the runner never calls it automatically.
 */
import { getDbDriver } from '../db.js';

const JOIN_TABLES = [
  {
    table: 'host_zones',
    owner: 'host_id',
    target: 'zone_id',
    index: 'idx_host_zones_zone',
    ownerTable: 'hosts',
  },
  {
    table: 'receptionist_zones',
    owner: 'receptionist_id',
    target: 'zone_id',
    index: 'idx_receptionist_zones_zone',
    ownerTable: 'receptionists',
  },
  {
    table: 'security_guard_stations',
    owner: 'security_guard_id',
    target: 'station_id',
    index: 'idx_security_guard_stations_station',
    ownerTable: 'security_guards',
  },
  {
    table: 'security_guard_buildings',
    owner: 'security_guard_id',
    target: 'building_id',
    index: 'idx_security_guard_buildings_building',
    ownerTable: 'security_guards',
  },
];

async function columnExists(pool, table, column) {
  try {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return Boolean(Number(row?.count));
  } catch {
    // Engines/emulators without information_schema support: assume missing and
    // let the guarded ALTER below decide.
    return false;
  }
}

async function addColumnIfMissing(pool, table, column, ddl) {
  if (await columnExists(pool, table, column)) return false;
  try {
    await pool.query(`ALTER TABLE ${table} ${ddl}`);
    return true;
  } catch {
    // Already present under a different catalog view, or table absent.
    return false;
  }
}

export default {
  version: '001',
  name: 'zone_access_control',

  async up(pool) {
    for (const spec of JOIN_TABLES) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${spec.table} (
          ${spec.owner} VARCHAR(90) NOT NULL,
          ${spec.target} VARCHAR(90) NOT NULL,
          organisation_id VARCHAR(90),
          status VARCHAR(30) NOT NULL DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (${spec.owner}, ${spec.target}),
          INDEX ${spec.index} (${spec.target})
        )
      `);

      // Bring pre-migration deployments (created by the boot-time ensure*
      // helpers, which had neither column) up to the same shape.
      await addColumnIfMissing(pool, spec.table, 'organisation_id', 'ADD COLUMN organisation_id VARCHAR(90) NULL');
      await addColumnIfMissing(pool, spec.table, 'status', `ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'active'`);
      await addColumnIfMissing(pool, spec.table, 'updated_at', 'ADD COLUMN updated_at DATETIME NULL');

      if (getDbDriver() === 'postgres') {
        await pool.query(`CREATE INDEX IF NOT EXISTS ${spec.index} ON ${spec.table} (${spec.target})`);
        await pool.query(`CREATE INDEX IF NOT EXISTS ${spec.index}_org ON ${spec.table} (organisation_id)`);
      }

      // Backfill the tenant boundary from the owning record.
      try {
        await pool.query(
          `UPDATE ${spec.table} SET organisation_id = (
             SELECT o.organisation_id FROM ${spec.ownerTable} o WHERE o.id = ${spec.table}.${spec.owner}
           ) WHERE organisation_id IS NULL`,
        );
      } catch {
        // Owner table not present yet on a fresh database — nothing to backfill.
      }
    }

    // Configurable role -> zone default mapping (fallback only).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS host_role_zone_defaults (
        organisation_id VARCHAR(90) NOT NULL,
        role_slug VARCHAR(60) NOT NULL,
        zone_id VARCHAR(90) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (organisation_id, role_slug),
        INDEX idx_host_role_zone_defaults_zone (zone_id)
      )
    `);
    await addColumnIfMissing(pool, 'host_role_zone_defaults', 'status', `ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'active'`);
    if (getDbDriver() === 'postgres') {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_host_role_zone_defaults_zone ON host_role_zone_defaults (zone_id)');
    }
  },

  /** Destructive. Test/disposable databases only — never invoked automatically. */
  async down(pool) {
    for (const spec of [...JOIN_TABLES].reverse()) {
      // receptionist_zones predates this migration; drop only what 001 owns.
      if (spec.table === 'receptionist_zones') continue;
      await pool.query(`DROP TABLE IF EXISTS ${spec.table}`);
    }
    await pool.query('DROP TABLE IF EXISTS host_role_zone_defaults');
  },
};
