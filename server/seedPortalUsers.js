import crypto from 'crypto';
import pool from './db.js';
import { hashPassword } from './auth.js';
import { generateId } from './visitorSchema.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_PORTAL_PASSWORD = String(process.env.DEV_PORTAL_PASSWORD || 'demo1234');

const PORTAL_USERS = [
  { email: 'guard@demo.org', name: 'Guard Demo', roleSlug: 'receptionist' },
  { email: 'orgadmin@demo.org', name: 'Org Admin Demo', roleSlug: 'org_admin' },
  { email: 'security@demo.org', name: 'Security Manager Demo', roleSlug: 'security_manager' },
  { email: 'host@demo.org', name: 'Host Demo', roleSlug: 'host' },
  { email: 'auditor@demo.org', name: 'Auditor Demo', roleSlug: 'auditor' },
  { email: 'management@demo.org', name: 'Management Viewer Demo', roleSlug: 'management_viewer' },
  { email: 'platform@demo.org', name: 'Platform Admin Demo', roleSlug: 'platform_admin' },
  { email: 'emergency@demo.org', name: 'Emergency Officer Demo', roleSlug: 'emergency_officer' },
  { email: 'exec.reception@demo.org', name: 'Executive Reception Demo', roleSlug: 'executive_reception' },
  { email: 'ceo.secretary@demo.org', name: 'CEO Secretary Demo', roleSlug: 'ceo_secretary' },
  { email: 'ceo@demo.org', name: 'CEO Demo', roleSlug: 'ceo' },
];

export async function seedPortalUsers() {
  if (IS_PRODUCTION) {
    console.log('[seed] Skipping portal user seed in production.');
    return;
  }

  const [[org]] = await pool.query('SELECT id FROM organisations LIMIT 1');
  if (!org?.id) return;

  const [[site]] = await pool.query('SELECT id FROM sites WHERE organisation_id = ? LIMIT 1', [org.id]);
  const [[station]] = site?.id
    ? await pool.query('SELECT id FROM stations WHERE site_id = ? LIMIT 1', [site.id])
    : [[]];
  const [[dept]] = await pool.query('SELECT id FROM departments WHERE organisation_id = ? LIMIT 1', [org.id]);

  const passwordHash = hashPassword(DEV_PORTAL_PASSWORD);

  for (const portalUser of PORTAL_USERS) {
    const email = portalUser.email.toLowerCase();
    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    let userId = existing?.id;

    if (!userId) {
      userId = `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      await pool.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, email_verified)
         VALUES (?, ?, ?, '', ?, 'user', 1)`,
        [userId, portalUser.name, email, passwordHash],
      );
    }

    await pool.query(
      `INSERT INTO user_scopes (user_id, organisation_id, site_id, station_id, department_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE site_id = VALUES(site_id), station_id = VALUES(station_id), department_id = VALUES(department_id)`,
      [userId, org.id, site?.id || null, station?.id || null, dept?.id || null],
    );

    const [[roleRow]] = await pool.query('SELECT id FROM admin_roles WHERE slug = ? LIMIT 1', [portalUser.roleSlug]);
    if (roleRow?.id) {
      await pool.query(
        'INSERT IGNORE INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
        [userId, roleRow.id],
      );
    }

    if (portalUser.roleSlug === 'host') {
      const [[existingHost]] = await pool.query(
        'SELECT id FROM hosts WHERE LOWER(email) = ? LIMIT 1',
        [email],
      );
      if (existingHost?.id) {
        await pool.query('UPDATE hosts SET user_id = ?, name = ? WHERE id = ?', [userId, portalUser.name, existingHost.id]);
      } else {
        await pool.query(
          `INSERT INTO hosts (id, organisation_id, department_id, user_id, name, email, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`,
          [generateId('host'), org.id, dept?.id || null, userId, portalUser.name, email],
        );
      }
    }
  }

  console.log('[seed] Portal development users ready (password: DEV_PORTAL_PASSWORD or demo1234).');
  await seedHostDemoVisit();
}

async function seedHostDemoVisit() {
  const [[hostUser]] = await pool.query(`SELECT id FROM users WHERE email = 'host@demo.org' LIMIT 1`);
  if (!hostUser) return;

  const [[host]] = await pool.query(`SELECT id, organisation_id FROM hosts WHERE user_id = ? LIMIT 1`, [hostUser.id]);
  if (!host?.id) return;

  const [[existing]] = await pool.query(
    `SELECT id FROM visits WHERE host_id = ? AND status IN ('pending_approval', 'pre_registered') LIMIT 1`,
    [host.id],
  );
  if (existing) return;

  const [[site]] = await pool.query(`SELECT id FROM sites WHERE organisation_id = ? LIMIT 1`, [host.organisation_id]);
  const [[category]] = await pool.query(`SELECT id FROM visitor_categories WHERE organisation_id = ? LIMIT 1`, [host.organisation_id]);
  if (!site) return;

  const visitorId = generateId('vis');
  await pool.query(
    `INSERT INTO visitors (id, organisation_id, full_name, phone, company) VALUES (?, ?, ?, ?, ?)`,
    [visitorId, host.organisation_id, 'Sarah Banda', '+260972222001', 'Partner Co'],
  );

  const visitId = generateId('visit');
  await pool.query(
    `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, category_id, purpose, status, pass_code, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)`,
    [
      visitId,
      host.organisation_id,
      site.id,
      visitorId,
      host.id,
      category?.id,
      'Partnership discussion',
      Math.random().toString(36).slice(2, 8).toUpperCase(),
      hostUser.id,
    ],
  );
  await pool.query(
    `INSERT INTO visit_events (id, visit_id, event_type, actor_user_id, details) VALUES (?, ?, 'registered', ?, ?)`,
    [generateId('evt'), visitId, hostUser.id, JSON.stringify({ status: 'pending_approval' })],
  );
}

export async function seedSampleVisits() {
  if (IS_PRODUCTION) return;

  const [[existing]] = await pool.query('SELECT id FROM visits LIMIT 1');
  if (existing) return;

  const [[org]] = await pool.query('SELECT id FROM organisations LIMIT 1');
  const [[site]] = await pool.query('SELECT id FROM sites WHERE organisation_id = ? LIMIT 1', [org?.id]);
  const [[station]] = site?.id
    ? await pool.query('SELECT id FROM stations WHERE site_id = ? LIMIT 1', [site.id])
    : [[]];
  const [[host]] = await pool.query(
    `SELECT id FROM hosts WHERE organisation_id = ? ORDER BY user_id IS NOT NULL DESC, created_at ASC LIMIT 1`,
    [org?.id],
  );
  const [[category]] = await pool.query('SELECT id FROM visitor_categories WHERE organisation_id = ? LIMIT 1', [org?.id]);

  if (!org?.id || !site?.id) return;

  const visitors = [
    { name: 'John Chanda', phone: '+260971111001', company: 'ABC Ltd' },
    { name: 'Mary Phiri', phone: '+260971111002', company: 'XYZ Corp' },
  ];

  for (const v of visitors) {
    const visitorId = generateId('vis');
    await pool.query(
      `INSERT INTO visitors (id, organisation_id, full_name, phone, company) VALUES (?, ?, ?, ?, ?)`,
      [visitorId, org.id, v.name, v.phone, v.company],
    );

    const visitId = generateId('visit');
    const status = v.name.includes('John') ? 'approved' : 'pending_approval';
    await pool.query(
      `INSERT INTO visits (id, organisation_id, site_id, station_id, visitor_id, host_id, category_id, purpose, status, pass_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        visitId,
        org.id,
        site.id,
        station?.id,
        visitorId,
        host?.id,
        category?.id,
        'Business meeting',
        status,
        Math.random().toString(36).slice(2, 8).toUpperCase(),
      ],
    );

    await pool.query(
      `INSERT INTO visit_events (id, visit_id, event_type, details) VALUES (?, ?, 'registered', ?)`,
      [generateId('evt'), visitId, JSON.stringify({ status })],
    );
  }

  console.log('[seed] Sample visits created.');
}
