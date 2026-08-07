#!/usr/bin/env node
import mysql from 'mysql2/promise';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrapDatabase } from '../schema.js';
import { seedDashboardIllustration } from '../seedDashboardIllustration.js';
import { isPostgresDriver, resolveDbDriver, runPostgresQuery } from '../sqlDialect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const args = process.argv.slice(2);
const force = args.includes('--force');
const bootstrap = args.includes('--bootstrap');
const targetArg = args.find((arg) => arg.startsWith('--target='));
const urlArg = args.find((arg) => arg.startsWith('--url='));
const target = targetArg?.split('=')[1] || 'local';

function createPgPool(connectionString) {
  const pool = new pg.Pool({ connectionString, ssl: false });
  return {
    async query(sql, params = []) {
      return runPostgresQuery(pool, sql, params);
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

  if (isPostgresDriver(resolveDbDriver())) {
    const connectionString = String(process.env.DATABASE_URL || '').trim();
    console.log('[seed:demo] Connecting to PostgreSQL…');
    return createPgPool(connectionString);
  }

  console.log('[seed:demo] Connecting to local MySQL…');
  return createMysqlPool();
}

async function main() {
  const pool = await resolvePool();

  try {
    if (bootstrap) {
      console.log('[seed:demo] Bootstrapping base schema…');
      await bootstrapDatabase();
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
