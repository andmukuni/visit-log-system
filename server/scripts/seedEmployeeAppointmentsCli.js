#!/usr/bin/env node
import mysql from 'mysql2/promise';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedEmployeeAppointments } from '../seedPortalUsers.js';
import { isPostgresDriver, resolveDbDriver, runPostgresQuery } from '../sqlDialect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const args = process.argv.slice(2);
const force = args.includes('--force');
const urlArg = args.find((arg) => arg.startsWith('--url='));

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
  const connectionString = urlArg ? urlArg.replace(/^--url=/, '') : null;
  if (connectionString) {
    if (!connectionString.startsWith('postgres')) {
      throw new Error('--url must be a PostgreSQL connection string.');
    }
    console.log('[seed:employee-appointments] Connecting to PostgreSQL (explicit URL)…');
    return createPgPool(connectionString);
  }

  if (isPostgresDriver(resolveDbDriver())) {
    const localPgUrl = String(process.env.DATABASE_URL || '').trim();
    if (!localPgUrl) throw new Error('DATABASE_URL is required for local PostgreSQL seeding.');
    console.log('[seed:employee-appointments] Connecting to local PostgreSQL…');
    return createPgPool(localPgUrl);
  }

  console.log('[seed:employee-appointments] Connecting to local MySQL…');
  return createMysqlPool();
}

async function main() {
  const pool = await resolvePool();
  try {
    const result = await seedEmployeeAppointments(pool, { force: true });
    if (result.skipped) {
      console.log('[seed:employee-appointments] Skipped:', result.reason || 'production guard');
      process.exitCode = 1;
      return;
    }
    console.log('[seed:employee-appointments] Done.');
  } finally {
    await pool.end?.();
  }
}

main().catch((error) => {
  console.error('[seed:employee-appointments] Failed:', error.message);
  process.exit(1);
});
