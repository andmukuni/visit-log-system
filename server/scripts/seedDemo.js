#!/usr/bin/env node
import mysql from 'mysql2/promise';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrapDatabase } from '../schema.js';
import { seedDashboardIllustration } from '../seedDashboardIllustration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const args = process.argv.slice(2);
const force = args.includes('--force');
const bootstrap = args.includes('--bootstrap');
const targetArg = args.find((arg) => arg.startsWith('--target='));
const urlArg = args.find((arg) => arg.startsWith('--url='));
const target = targetArg?.split('=')[1] || 'local';

function mysqlToPg(sql) {
  let index = 0;
  return sql
    .replace(/\?/g, () => `$${++index}`)
    .replace(/CURDATE\(\)/g, 'CURRENT_DATE')
    .replace(/NOW\(\)/g, 'NOW()')
    .replace(/DATE_SUB\(CURDATE\(\), INTERVAL (\d+) DAY\)/g, "CURRENT_DATE - INTERVAL '$1 day'")
    .replace(/DATE_SUB\(CURDATE\(\), INTERVAL (\d+) DAY\) AND created_at < CURDATE\(\)/g, "CURRENT_DATE - INTERVAL '$1 day' AND created_at < CURRENT_DATE")
    .replace(/TINYINT\(1\)/g, 'BOOLEAN')
    .replace(/DATETIME/g, 'TIMESTAMP');
}

function createPgPool(connectionString) {
  const pool = new pg.Pool({ connectionString, ssl: false });
  return {
    async query(sql, params = []) {
      const text = mysqlToPg(sql);
      const result = await pool.query(text, params);
      return [result.rows, result.fields];
    },
    async end() {
      await pool.end();
    },
  };
}

function createMysqlPool(overrides = {}) {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wgvl',
    dateStrings: true,
    ...overrides,
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
      throw new Error('Remote seed currently supports PostgreSQL connection strings only.');
    }
    console.log('[seed:demo] Connecting to remote PostgreSQL…');
    return createPgPool(connectionString);
  }

  console.log('[seed:demo] Connecting to local MySQL…');
  return createMysqlPool();
}

async function main() {
  const pool = await resolvePool();

  try {
    if (bootstrap) {
      if (target !== 'local') {
        console.warn('[seed:demo] Bootstrap on PostgreSQL is not fully supported — attempting seed only.');
      } else {
        console.log('[seed:demo] Bootstrapping base schema…');
        await bootstrapDatabase();
      }
    }

    const result = await seedDashboardIllustration(pool, { force });
    if (result.skipped) {
      console.log('[seed:demo] Nothing to do.');
      return;
    }

    console.log('[seed:demo] Done.');
  } finally {
    await pool.end?.();
  }
}

main().catch((error) => {
  console.error('[seed:demo] Failed:', error.message);
  process.exit(1);
});
