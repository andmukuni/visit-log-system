#!/usr/bin/env node
/**
 * Migration CLI.
 *
 *   node server/scripts/migrateCli.js --status   # report pending, change nothing
 *   node server/scripts/migrateCli.js            # apply pending migrations
 *   node server/scripts/migrateCli.js --url=...  # target an explicit database
 *
 * Safety: refuses to apply against a database whose URL is not explicitly
 * passed unless ALLOW_MIGRATE=1 is set, so a stray run cannot silently touch
 * whatever DATABASE_URL happens to be configured. --status is always safe.
 */
import pg from 'pg';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPostgresDriver, resolveDbDriver, runPostgresQuery } from '../sqlDialect.js';
import { runMigrations, pendingMigrations } from '../migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const statusOnly = args.includes('--status');
const urlArg = args.find((a) => a.startsWith('--url='));
const explicitUrl = urlArg ? urlArg.slice('--url='.length) : null;
const connectionString = explicitUrl || process.env.DATABASE_URL || '';

function createPgPool(url) {
  const pool = new pg.Pool({ connectionString: url, ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : false });
  return {
    driver: 'postgres',
    query: (sql, params = []) => runPostgresQuery(pool, sql, params),
    end: () => pool.end(),
  };
}

async function createMysqlPool() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'node_template',
    dateStrings: true,
  });
  return { driver: 'mysql', query: (sql, params = []) => pool.query(sql, params), end: () => pool.end() };
}

async function main() {
  const usePg = connectionString
    ? connectionString.startsWith('postgres')
    : isPostgresDriver(resolveDbDriver());

  const pool = usePg ? createPgPool(connectionString) : await createMysqlPool();
  const target = usePg ? connectionString.replace(/:\/\/[^@]*@/, '://***@') : `mysql://${process.env.DB_HOST || '127.0.0.1'}`;

  try {
    const pending = await pendingMigrations(pool);
    console.log(`[migrate] target: ${target}`);
    console.log(`[migrate] pending: ${pending.length ? pending.map((m) => `${m.version}:${m.name}`).join(', ') : 'none'}`);

    if (statusOnly) return;

    if (!explicitUrl && process.env.ALLOW_MIGRATE !== '1') {
      console.error('[migrate] Refusing to apply without an explicit --url= or ALLOW_MIGRATE=1.');
      process.exitCode = 1;
      return;
    }

    const result = await runMigrations(pool);
    console.log(`[migrate] applied: ${result.applied.join(', ') || 'none'}`);
    console.log(`[migrate] already applied: ${result.skipped.join(', ') || 'none'}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exitCode = 1;
});
