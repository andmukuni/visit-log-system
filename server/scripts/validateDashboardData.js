#!/usr/bin/env node
// Validates that dashboard KPIs reflect real database records.
//
// Recomputes every headline KPI straight from the database (same filters the
// dashboard endpoints use) so the numbers on screen can be compared 1:1, and
// scans for demo/illustration records (seed:demo marker rows) that would make
// dashboards show non-real data.
//
// Usage:
//   npm run validate:dashboard                       # local DB from .env
//   npm run validate:dashboard:remote                # REMOTE_DATABASE_URL / DATABASE_URL
//   node server/scripts/validateDashboardData.js --url=postgres://…
//   node server/scripts/validateDashboardData.js --clean-demo   # delete demo marker rows
//
// Exits 0 when clean, 2 when demo records are found (so it can gate deploys).
import mysql from 'mysql2/promise';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPostgresDriver, resolveDbDriver, runPostgresQuery } from '../sqlDialect.js';
import { visitOnSitePredicate } from '../../shared/visitOnSite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith('--target='));
const urlArg = args.find((arg) => arg.startsWith('--url='));
const target = targetArg?.split('=')[1] || (urlArg ? 'remote' : 'local');
const cleanDemo = args.includes('--clean-demo');

const DEMO_MARKER = 'demo-seed-v1';
const DEMO_ORG_SLUGS = ['acme-corp', 'greenfield-ltd', 'nova-holdings'];

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
  if (target === 'remote') {
    const connectionString = (urlArg ? urlArg.replace(/^--url=/, '') : null)
      || process.env.REMOTE_DATABASE_URL
      || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Remote target requires REMOTE_DATABASE_URL, DATABASE_URL, or --url=postgres://...');
    }
    if (!connectionString.startsWith('postgres')) {
      throw new Error('Remote validation currently supports PostgreSQL connection strings only.');
    }
    console.log('[validate] Connecting to remote PostgreSQL…');
    return createPgPool(connectionString);
  }

  if (isPostgresDriver(resolveDbDriver())) {
    console.log('[validate] Connecting to PostgreSQL…');
    return createPgPool(String(process.env.DATABASE_URL || '').trim());
  }

  console.log('[validate] Connecting to local MySQL…');
  return createMysqlPool();
}

async function countRows(pool, sql, params = []) {
  const [[row]] = await pool.query(sql, params);
  return Number(row?.count || 0);
}

function pct(value, total) {
  if (!total) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

async function reportOrganisationKpis(pool, org) {
  console.log(`\n── ${org.name} (${org.slug || org.id}) ──`);

  const orgParams = [org.id];
  const onSiteSql = visitOnSitePredicate('vis');
  const deskOnSiteSql = visitOnSitePredicate('vis', { includeGate: false });
  const hostOccupiedSql = visitOnSitePredicate('vis', { hostOccupied: true });

  const kpis = {
    'Visits created today': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ? AND created_at >= CURDATE()`,
      orgParams,
    ),
    'Visits created yesterday': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits
       WHERE organisation_id = ?
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND created_at < CURDATE()`,
      orgParams,
    ),
    'Expected today (expected/approved/pre_registered)': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits vis
       WHERE vis.organisation_id = ?
         AND vis.status IN ('expected', 'approved', 'pre_registered')
         AND DATE(COALESCE(
           vis.expected_at,
           (SELECT a.scheduled_at FROM appointments a WHERE a.visit_id = vis.id LIMIT 1),
           vis.created_at
         )) = CURDATE()`,
      orgParams,
    ),
    'Pending approvals': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits
       WHERE organisation_id = ? AND status IN ('pending_approval', 'pre_registered')`,
      orgParams,
    ),
    'On-site now (all on-site statuses)': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits vis
       WHERE vis.organisation_id = ? AND ${onSiteSql}`,
      orgParams,
    ),
    'At desk (reception_check_in/checked_in/waiting/in_meeting)': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits vis
       WHERE vis.organisation_id = ? AND ${deskOnSiteSql}`,
      orgParams,
    ),
    'Waiting for host': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ? AND status = 'waiting'`,
      orgParams,
    ),
    'Hosts occupied': await countRows(
      pool,
      `SELECT COUNT(DISTINCT vis.host_id) AS count FROM visits vis
       WHERE vis.organisation_id = ? AND vis.host_id IS NOT NULL
         AND ${hostOccupiedSql}`,
      orgParams,
    ),
    'Visits last 7 days': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM visits
       WHERE organisation_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`,
      orgParams,
    ),
    'Open incidents': await countRows(
      pool,
      `SELECT COUNT(*) AS count FROM incidents
       WHERE organisation_id = ? AND status IN ('open', 'investigating')`,
      orgParams,
    ),
  };

  for (const [label, value] of Object.entries(kpis)) {
    console.log(`  ${label}: ${value}`);
  }

  const [eventRows] = await pool.query(
    `SELECT ve.event_type, COUNT(*) AS total
     FROM visit_events ve
     INNER JOIN visits vis ON vis.id = ve.visit_id
     WHERE vis.organisation_id = ?
       AND ve.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY ve.event_type
     ORDER BY total DESC`,
    orgParams,
  );
  const eventTotal = eventRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  console.log(`  Events last 30 days ("Recent month" donut): ${eventTotal} total`);
  for (const row of eventRows) {
    const total = Number(row.total || 0);
    console.log(`    ${row.event_type}: ${total} (${pct(total, eventTotal)})`);
  }
}

async function reportDemoContamination(pool) {
  const marker = `%${DEMO_MARKER}%`;
  const checks = {
    'visits (purpose marker)': await countRows(
      pool, 'SELECT COUNT(*) AS count FROM visits WHERE purpose LIKE ?', [marker],
    ),
    'visit_events (details marker)': await countRows(
      pool, 'SELECT COUNT(*) AS count FROM visit_events WHERE details LIKE ?', [marker],
    ),
    'vehicles (attached to marker visits)': await countRows(
      pool,
      'SELECT COUNT(*) AS count FROM vehicles WHERE visit_id IN (SELECT id FROM visits WHERE purpose LIKE ?)',
      [marker],
    ),
    'audit_logs (details marker)': await countRows(
      pool, 'SELECT COUNT(*) AS count FROM audit_logs WHERE details LIKE ?', [marker],
    ),
    'incidents (narrative marker)': await countRows(
      pool, 'SELECT COUNT(*) AS count FROM incidents WHERE narrative LIKE ?', [marker],
    ),
  };

  const slugPlaceholders = DEMO_ORG_SLUGS.map(() => '?').join(', ');
  const [demoOrgs] = await pool.query(
    `SELECT name, slug FROM organisations WHERE slug IN (${slugPlaceholders})`,
    DEMO_ORG_SLUGS,
  );

  console.log('\n── Demo data scan ──');
  let contaminated = 0;
  for (const [label, value] of Object.entries(checks)) {
    contaminated += value;
    console.log(`  ${label}: ${value}${value > 0 ? '  ⚠️' : ''}`);
  }
  if (demoOrgs.length) {
    console.log(`  demo organisations present: ${demoOrgs.map((o) => o.slug).join(', ')}  ⚠️`);
  }

  return { contaminated, demoOrgs };
}

async function cleanDemoRows(pool) {
  const marker = `%${DEMO_MARKER}%`;
  console.log('\n[validate] Deleting demo marker rows…');

  // Portable subquery deletes (the seed's multi-table DELETE JOIN syntax is
  // MySQL-only and would fail against the PostgreSQL deployment).
  const steps = [
    ['vehicles', 'DELETE FROM vehicles WHERE visit_id IN (SELECT id FROM visits WHERE purpose LIKE ?)'],
    ['visit_events (via visits)', 'DELETE FROM visit_events WHERE visit_id IN (SELECT id FROM visits WHERE purpose LIKE ?)'],
    ['visit_events (details marker)', 'DELETE FROM visit_events WHERE details LIKE ?'],
    ['visit_approvals', 'DELETE FROM visit_approvals WHERE visit_id IN (SELECT id FROM visits WHERE purpose LIKE ?)'],
    ['appointments', 'DELETE FROM appointments WHERE visit_id IN (SELECT id FROM visits WHERE purpose LIKE ?)'],
    ['visits', 'DELETE FROM visits WHERE purpose LIKE ?'],
    ['audit_logs', 'DELETE FROM audit_logs WHERE details LIKE ?'],
    ['incidents', 'DELETE FROM incidents WHERE narrative LIKE ?'],
  ];

  for (const [label, sql] of steps) {
    await pool.query(sql, [marker]);
    console.log(`  cleaned ${label}`);
  }

  // Seeded visitors used @example.com addresses; only remove ones no longer
  // referenced by any visit.
  await pool.query(
    `DELETE FROM visitors
     WHERE email LIKE '%@example.com'
       AND id NOT IN (SELECT visitor_id FROM visits WHERE visitor_id IS NOT NULL)`,
  );
  console.log('  cleaned orphaned @example.com visitors');
  console.log('[validate] Demo marker rows removed. Demo organisations (if any) were left in place — remove those manually if intended.');
}

async function main() {
  const pool = await resolvePool();
  try {
    const globals = {
      organisations: await countRows(pool, 'SELECT COUNT(*) AS count FROM organisations'),
      users: await countRows(pool, 'SELECT COUNT(*) AS count FROM users'),
      visits: await countRows(pool, 'SELECT COUNT(*) AS count FROM visits'),
      visit_events: await countRows(pool, 'SELECT COUNT(*) AS count FROM visit_events'),
    };
    console.log('\n── Global totals ──');
    for (const [label, value] of Object.entries(globals)) {
      console.log(`  ${label}: ${value}`);
    }

    const [orgs] = await pool.query('SELECT id, name, slug FROM organisations ORDER BY name');
    for (const org of orgs) {
      await reportOrganisationKpis(pool, org);
    }

    const { contaminated, demoOrgs } = await reportDemoContamination(pool);

    if (cleanDemo && contaminated > 0) {
      await cleanDemoRows(pool);
      const after = await reportDemoContamination(pool);
      process.exitCode = after.contaminated > 0 || after.demoOrgs.length ? 2 : 0;
      return;
    }

    if (contaminated > 0 || demoOrgs.length) {
      console.log('\n[validate] Demo records detected — dashboards include non-real data.');
      if (contaminated > 0) {
        console.log('           Re-run with --clean-demo to delete the marker rows.');
      }
      if (demoOrgs.length) {
        console.log('           Demo organisations must be removed manually (they may hold other records).');
      }
      process.exitCode = 2;
      return;
    }

    console.log('\n[validate] No demo records found — dashboard KPIs are computed from real data.');
  } finally {
    await pool.end?.();
  }
}

main().catch((error) => {
  console.error('[validate] Failed:', error.message);
  process.exit(1);
});
