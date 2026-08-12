#!/usr/bin/env node
/**
 * Clears visitor/vehicle operational records so the system can start fresh.
 * Preserves users, roles, organisations, sites, hosts, and location structure.
 *
 * Usage:
 *   node server/scripts/resetOperationalData.js
 *   node server/scripts/resetOperationalData.js --target=remote
 *   node server/scripts/resetOperationalData.js --target=remote --url=postgres://...
 */
import mysql from 'mysql2/promise';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPostgresDriver, resolveDbDriver, adaptSqlForPostgres } from '../sqlDialect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith('--target='));
const urlArg = args.find((arg) => arg.startsWith('--url='));
const target = targetArg?.split('=')[1] || 'local';

const OPERATIONAL_TABLES = [
  'notification_deliveries',
  'notifications',
  'report_exports',
  'roll_call_entries',
  'emergency_roll_calls',
  'incidents',
  'watchlist_entries',
  'privacy_requests',
  'vehicle_entries',
  'expected_vehicles',
  'vehicles',
  'visit_approvals',
  'visit_events',
  'appointments',
  'visits',
  'visitor_contact_details',
  'visitors',
  'badges',
  'audit_logs',
];

function createPgPool(connectionString) {
  const pool = new pg.Pool({ connectionString, ssl: false });
  return {
    async query(sql, params = []) {
      const text = adaptSqlForPostgres(sql);
      const result = await pool.query(text, params);
      return [{ affectedRows: result.rowCount, rowCount: result.rowCount }, result.fields];
    },
    async end() {
      await pool.end();
    },
  };
}

function createMysqlPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wgvl',
    dateStrings: true,
  });
}

async function resolvePool() {
  if (target === 'remote') {
    const connectionString = (urlArg ? urlArg.replace(/^--url=/, '') : null)
      || process.env.REMOTE_DATABASE_URL
      || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Remote target requires REMOTE_DATABASE_URL, DATABASE_URL, or --url=postgres://...');
    }
    if (!connectionString.startsWith('postgres')) {
      throw new Error('Remote reset currently supports PostgreSQL connection strings only.');
    }
    const host = (() => {
      try { return new URL(connectionString).hostname; } catch { return 'remote'; }
    })();
    console.log(`[reset] Connecting to remote PostgreSQL (${host})…`);
    return createPgPool(connectionString);
  }

  if (isPostgresDriver(resolveDbDriver())) {
    const connectionString = String(process.env.DATABASE_URL || '').trim();
    if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL.');
    console.log('[reset] Connecting to PostgreSQL…');
    return createPgPool(connectionString);
  }
  console.log('[reset] Connecting to local MySQL…');
  return createMysqlPool();
}

async function tableExists(pool, table) {
  try {
    await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pool = await resolvePool();
  const cleared = [];

  try {
    for (const table of OPERATIONAL_TABLES) {
      if (!(await tableExists(pool, table))) {
        console.log(`[reset] Skip ${table} (table not found)`);
        continue;
      }
      const [result] = await pool.query(`DELETE FROM ${table}`);
      const count = result?.affectedRows ?? result?.rowCount ?? 0;
      cleared.push({ table, count });
      console.log(`[reset] Cleared ${table}: ${count} row(s)`);
    }

    console.log('[reset] Done. Preserved: users, roles, organisations, sites, hosts, stations.');
    console.log('[reset] Summary:', cleared.reduce((sum, row) => sum + Number(row.count || 0), 0), 'total rows removed.');
  } finally {
    await pool.end?.();
  }
}

main().catch((error) => {
  console.error('[reset] Failed:', error.message);
  process.exit(1);
});
