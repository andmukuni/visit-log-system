#!/usr/bin/env node
/**
 * READ-ONLY audit of historical notification rows for visitor PII.
 *
 *   node server/scripts/auditHistoricalNotifications.js --url=postgres://...
 *   node server/scripts/auditHistoricalNotifications.js --url=... --plan
 *
 * Why this exists
 * ---------------
 * Notification title/body are rendered once, at send time, and stored as flat
 * text. Rows written BEFORE the zone-confidentiality work could therefore
 * contain visitor detail that a different-zone receptionist would not be
 * allowed to see today. Deleting or rewriting them is a destructive,
 * irreversible operation on production data, so this script only REPORTS.
 *
 * Guarantees
 * ----------
 * - Executes SELECT statements only. There is no UPDATE/DELETE/DDL anywhere in
 *   this file; `--plan` prints a proposed remediation as text without running it.
 * - Emits COUNTS grouped by notification_type. It never prints a matched
 *   title/body, so running it cannot itself leak the PII it is looking for.
 * - Portable SQL (no MySQL-only syntax) so it runs against the Postgres
 *   production dialect directly.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='));
const showPlan = args.includes('--plan');
const connectionString = urlArg ? urlArg.slice('--url='.length) : process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Usage: auditHistoricalNotifications.js --url=postgres://...');
  process.exit(1);
}

/**
 * Detection patterns. Deliberately conservative: they flag rows for human
 * review rather than asserting a definite leak.
 */
const PII_PATTERNS = [
  { key: 'phone_number', regex: '(\\+?[0-9][0-9 ()-]{7,}[0-9])' },
  { key: 'email_address', regex: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}' },
  { key: 'nrc_id_number', regex: '[0-9]{5,6}/[0-9]{2}/[0-9]' },
  { key: 'pass_code', regex: '(?i)pass\\s*code' },
  { key: 'company_or_purpose', regex: '(?i)(company|purpose|meeting|acquisition|contract)' },
  { key: 'host_disclosure', regex: '(?i)host:' },
  { key: 'private_note', regex: '(?i)(private|confidential)' },
];

/** Template keys whose audience is a DIFFERENT-ZONE receptionist (name + time only). */
const RESTRICTED_TEMPLATE_KEYS = [
  'visit.reception_new_expected_restricted',
  'visit.arrived_at_gate_restricted',
  'visit.entered_premises_restricted',
  'visit.pre_arrival_alert_restricted',
];

async function main() {
  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : false,
  });

  try {
    const redacted = connectionString.replace(/:\/\/[^@]*@/, '://***@');
    console.log(`[audit] target (READ-ONLY): ${redacted}\n`);

    const { rows: [totals] } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              MIN(created_at) AS oldest,
              MAX(created_at) AS newest
       FROM notifications`,
    );
    console.log(`Total notification rows: ${totals.total}`);
    console.log(`Date range: ${totals.oldest || 'n/a'} .. ${totals.newest || 'n/a'}\n`);

    // 1) Which rows carry each PII signal, grouped by type (counts only).
    console.log('--- Rows matching PII patterns, by notification_type ---');
    for (const { key, regex } of PII_PATTERNS) {
      const { rows } = await pool.query(
        `SELECT notification_type, channel, COUNT(*)::int AS affected
         FROM notifications
         WHERE COALESCE(title, '') || ' ' || COALESCE(body, '') ~ $1
         GROUP BY notification_type, channel
         ORDER BY affected DESC`,
        [regex],
      );
      const total = rows.reduce((n, r) => n + r.affected, 0);
      console.log(`\n[${key}] total rows: ${total}`);
      for (const r of rows.slice(0, 10)) {
        console.log(`   ${r.notification_type} (${r.channel}): ${r.affected}`);
      }
    }

    // 2) The highest-severity case: a restricted-audience row that contains
    //    anything beyond visitor name + time.
    console.log('\n--- Restricted-audience rows containing more than name + time ---');
    const { rows: restricted } = await pool.query(
      `SELECT notification_type, channel, COUNT(*)::int AS affected
       FROM notifications
       WHERE notification_type = ANY($1)
         AND (COALESCE(title,'') || ' ' || COALESCE(body,'')) ~ $2
       GROUP BY notification_type, channel`,
      [RESTRICTED_TEMPLATE_KEYS, '(?i)(pass\\s*code|host:|company|purpose|@|[0-9]{5,6}/[0-9]{2}/[0-9])'],
    );
    if (!restricted.length) {
      console.log('   none — no restricted-template row contains extra detail.');
    } else {
      for (const r of restricted) console.log(`   ${r.notification_type} (${r.channel}): ${r.affected}`);
    }

    // 3) Stored metadata carrying lifecycle status to a restricted audience.
    console.log('\n--- Restricted-audience rows whose stored metadata carries eventType ---');
    const { rows: metaRows } = await pool.query(
      `SELECT COUNT(*)::int AS affected
       FROM notifications
       WHERE COALESCE(metadata::text, '') LIKE '%reception_different_zone%'
         AND COALESCE(metadata::text, '') LIKE '%eventType%'`,
    );
    console.log(`   rows: ${metaRows[0].affected}`);

    // 4) Delivery rows: recipient is the addressee, but check for visitor PII
    //    accidentally stored in error messages.
    console.log('\n--- notification_deliveries.error_message containing PII-like text ---');
    const { rows: deliv } = await pool.query(
      `SELECT COUNT(*)::int AS affected
       FROM notification_deliveries
       WHERE COALESCE(error_message, '') ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'`,
    );
    console.log(`   rows: ${deliv[0].affected}`);

    if (showPlan) printPlan();
    else console.log('\nRe-run with --plan to print the proposed (unexecuted) sanitization plan.');
  } finally {
    await pool.end();
  }
}

function printPlan() {
  console.log(`
=========================================================
 PROPOSED SANITIZATION PLAN — NOT EXECUTED BY THIS SCRIPT
=========================================================
Requires: explicit approval + a verified backup. Run inside one transaction.

Step 1 — Back up (reversible by construction):
    CREATE TABLE notifications_pre_sanitize_backup AS
      SELECT * FROM notifications
      WHERE notification_type = ANY(<restricted template keys>);

Step 2 — Verify the backup row count matches the audit count above.

Step 3 — Redact only restricted-audience rows, preserving the permitted
         name + time and leaving all other rows untouched:
    UPDATE notifications
       SET body  = regexp_replace(body, '(?i)(pass\\s*code.*|host:.*)', '', 'g'),
           metadata = jsonb_build_object(
             'visitId',  metadata::jsonb ->> 'visitId',
             'audience', metadata::jsonb ->> 'audience'
           )::text
     WHERE notification_type = ANY(<restricted template keys>);

Step 4 — Re-run this audit; restricted-row matches should be zero.

Rollback:
    UPDATE notifications n
       SET title = b.title, body = b.body, metadata = b.metadata
      FROM notifications_pre_sanitize_backup b
     WHERE n.id = b.id;

Retention alternative (often preferable): rather than rewriting history, delete
in-app notifications older than the retention window, which removes the exposure
without mutating records that may be needed for audit.
`);
}

main().catch((err) => {
  console.error('[audit] failed:', err.message);
  process.exitCode = 1;
});
