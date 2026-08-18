import mysql from 'mysql2/promise';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isPostgresDriver,
  resolveDbDriver,
  runPostgresQuery,
} from './sqlDialect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });
dotenv.config({ quiet: true });

const driver = resolveDbDriver();

function createMysqlPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'node_template',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
  });
}

function createPostgresPool() {
  // node-postgres parses "timestamp without time zone" / "date" columns into JS
  // Date objects by reading the raw wall-clock text as if it were local to this
  // process. The whole app treats DATETIME/TIMESTAMP values as naive wall-clock
  // strings (see mysql2's dateStrings:true above, and every getHours()/setHours()
  // call in calendarUtils.js) — so if this server process's TZ isn't the same as
  // the org's local time (e.g. a container defaulting to UTC), that Date object
  // gets serialized back out shifted by the UTC offset. Returning raw text here
  // instead keeps Postgres and MySQL behaving identically, independent of the
  // server's own timezone.
  pg.types.setTypeParser(1114, (value) => value); // timestamp
  pg.types.setTypeParser(1082, (value) => value); // date

  const connectionString = String(process.env.DATABASE_URL || '').trim();
  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : false,
  });

  return {
    driver: 'postgres',
    async query(sql, params = []) {
      return runPostgresQuery(pool, sql, params);
    },
    async end() {
      await pool.end();
    },
  };
}

const pool = isPostgresDriver(driver)
  ? createPostgresPool()
  : createMysqlPool();

export function getDbDriver() {
  return isPostgresDriver(driver) ? 'postgres' : 'mysql';
}

export async function testConnection() {
  if (isPostgresDriver(driver)) {
    const [rows] = await pool.query('SELECT current_database() AS db, NOW() AS connected_at');
    return rows[0];
  }

  const [rows] = await pool.query('SELECT DATABASE() AS db, NOW() AS connected_at');
  return rows[0];
}

export default pool;
