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
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

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
