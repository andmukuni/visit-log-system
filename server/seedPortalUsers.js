import crypto from 'crypto';
import pool from './db.js';
import { hashPassword } from './auth.js';
import { generateId } from './visitorSchema.js';
import { createAppointmentForVisit } from './accessSchema.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_PORTAL_PASSWORD = String(process.env.DEV_PORTAL_PASSWORD || 'demo1234');

/** Demo portal users aligned with defined executive/reception/security roles. */
export const PORTAL_USERS = [
  { email: 'orgadmin@demo.org', name: 'Org Admin Demo', roleSlug: 'org_admin' },
  { email: 'ceo@demo.org', name: 'CEO Demo', roleSlug: 'ceo' },
  { email: 'dceo@demo.org', name: 'DCEO Demo', roleSlug: 'dceo' },
  { email: 'ceo.secretary@demo.org', name: 'CEO Secretary Demo', roleSlug: 'ceo_secretary' },
  { email: 'dceo.secretary@demo.org', name: 'DCEO Secretary Demo', roleSlug: 'dceo_secretary' },
  { email: 'exec.reception@demo.org', name: 'Executive Reception Demo', roleSlug: 'executive_reception' },
  { email: 'reception@demo.org', name: 'Main Reception Demo', roleSlug: 'main_reception' },
  { email: 'gate@demo.org', name: 'Gate Security Demo', roleSlug: 'gate_security' },
  { email: 'guard@demo.org', name: 'Guard Demo', roleSlug: 'receptionist' },
  { email: 'security@demo.org', name: 'Security Manager Demo', roleSlug: 'security_manager' },
  { email: 'host@demo.org', name: 'Host Demo', roleSlug: 'host' },
  { email: 'auditor@demo.org', name: 'Auditor Demo', roleSlug: 'auditor' },
  { email: 'management@demo.org', name: 'Management Viewer Demo', roleSlug: 'management_viewer' },
  { email: 'platform@demo.org', name: 'Platform Admin Demo', roleSlug: 'platform_admin' },
  { email: 'emergency@demo.org', name: 'Emergency Officer Demo', roleSlug: 'emergency_officer' },
];

const HOST_LINKED_ROLES = new Set(['host', 'ceo', 'dceo']);

export async function seedPortalUsers(poolConn = pool, { force = false } = {}) {
  if (IS_PRODUCTION && !force) {
    console.log('[seed] Skipping portal user seed in production (pass force: true to override).');
    return { skipped: true };
  }

  const [[org]] = await poolConn.query('SELECT id FROM organisations LIMIT 1');
  if (!org?.id) {
    console.warn('[seed] No organisation found — bootstrap the database before seeding portal users.');
    return { skipped: true, reason: 'no_organisation' };
  }

  const [[site]] = await poolConn.query('SELECT id FROM sites WHERE organisation_id = ? LIMIT 1', [org.id]);
  const [[station]] = site?.id
    ? await poolConn.query('SELECT id FROM stations WHERE site_id = ? LIMIT 1', [site.id])
    : [[]];
  const [[dept]] = await poolConn.query('SELECT id FROM departments WHERE organisation_id = ? LIMIT 1', [org.id]);

  const passwordHash = hashPassword(DEV_PORTAL_PASSWORD);
  let created = 0;
  let updated = 0;

  for (const portalUser of PORTAL_USERS) {
    const email = portalUser.email.toLowerCase();
    const [[existing]] = await poolConn.query('SELECT id FROM users WHERE email = ?', [email]);
    let userId = existing?.id;

    if (!userId) {
      userId = `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      await poolConn.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, email_verified)
         VALUES (?, ?, ?, '', ?, 'user', 1)`,
        [userId, portalUser.name, email, passwordHash],
      );
      created += 1;
    } else if (force) {
      await poolConn.query(
        'UPDATE users SET name = ?, password_hash = ?, email_verified = 1 WHERE id = ?',
        [portalUser.name, passwordHash, userId],
      );
      updated += 1;
    }

    await poolConn.query(
      `INSERT INTO user_scopes (user_id, organisation_id, site_id, station_id, department_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE site_id = VALUES(site_id), station_id = VALUES(station_id), department_id = VALUES(department_id)`,
      [userId, org.id, site?.id || null, station?.id || null, dept?.id || null],
    );

    const [[roleRow]] = await poolConn.query('SELECT id FROM admin_roles WHERE slug = ? LIMIT 1', [portalUser.roleSlug]);
    if (roleRow?.id) {
      await poolConn.query(
        'INSERT IGNORE INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
        [userId, roleRow.id],
      );
    } else {
      console.warn(`[seed] Role not found: ${portalUser.roleSlug} (${email})`);
    }

    if (HOST_LINKED_ROLES.has(portalUser.roleSlug)) {
      const [[existingHost]] = await poolConn.query(
        'SELECT id FROM hosts WHERE LOWER(email) = ? LIMIT 1',
        [email],
      );
      if (existingHost?.id) {
        await poolConn.query('UPDATE hosts SET user_id = ?, name = ? WHERE id = ?', [userId, portalUser.name, existingHost.id]);
      } else {
        await poolConn.query(
          `INSERT INTO hosts (id, organisation_id, department_id, user_id, name, email, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`,
          [generateId('host'), org.id, dept?.id || null, userId, portalUser.name, email],
        );
      }
    }
  }

  console.log(`[seed] Portal users ready (${created} created, ${updated} updated). Password: demo1234`);
  await seedHostDemoVisit(poolConn);
  await seedExecutiveDemoVisits(poolConn);
  return { skipped: false, created, updated };
}

async function seedHostDemoVisit(poolConn = pool) {
  const [[hostUser]] = await poolConn.query(`SELECT id FROM users WHERE email = 'host@demo.org' LIMIT 1`);
  if (!hostUser) return;

  const [[host]] = await poolConn.query(`SELECT id, organisation_id FROM hosts WHERE user_id = ? LIMIT 1`, [hostUser.id]);
  if (!host?.id) return;

  const [[existing]] = await poolConn.query(
    `SELECT id FROM visits WHERE host_id = ? AND status IN ('pending_approval', 'pre_registered') LIMIT 1`,
    [host.id],
  );
  if (existing) return;

  const [[site]] = await poolConn.query(`SELECT id FROM sites WHERE organisation_id = ? LIMIT 1`, [host.organisation_id]);
  const [[category]] = await poolConn.query(`SELECT id FROM visitor_categories WHERE organisation_id = ? LIMIT 1`, [host.organisation_id]);
  if (!site) return;

  const visitorId = generateId('vis');
  await poolConn.query(
    `INSERT INTO visitors (id, organisation_id, full_name, phone, company) VALUES (?, ?, ?, ?, ?)`,
    [visitorId, host.organisation_id, 'Sarah Banda', '+260972222001', 'Partner Co'],
  );

  const visitId = generateId('visit');
  await poolConn.query(
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
  await poolConn.query(
    `INSERT INTO visit_events (id, visit_id, event_type, actor_user_id, details) VALUES (?, ?, 'registered', ?, ?)`,
    [generateId('evt'), visitId, hostUser.id, JSON.stringify({ status: 'pending_approval' })],
  );
}

async function seedExecutiveDemoVisits(poolConn = pool) {
  const executiveEmails = ['dceo@demo.org', 'ceo@demo.org'];
  for (const email of executiveEmails) {
    const [[hostUser]] = await poolConn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!hostUser?.id) continue;

    const [[host]] = await poolConn.query(
      'SELECT id, organisation_id FROM hosts WHERE user_id = ? LIMIT 1',
      [hostUser.id],
    );
    if (!host?.id) continue;

    const [[existingAppt]] = await poolConn.query(
      `SELECT a.id FROM appointments a
       INNER JOIN visits vis ON vis.id = a.visit_id
       WHERE vis.host_id = ? AND DATE(a.scheduled_at) = CURDATE() LIMIT 1`,
      [host.id],
    );
    if (existingAppt?.id) continue;

    const [[site]] = await poolConn.query('SELECT id FROM sites WHERE organisation_id = ? LIMIT 1', [host.organisation_id]);
    const [[category]] = await poolConn.query(
      `SELECT id, classification FROM visitor_categories WHERE organisation_id = ? ORDER BY classification DESC LIMIT 1`,
      [host.organisation_id],
    );
    if (!site?.id) continue;

    const demoVisitors = email.includes('dceo')
      ? [
          { name: 'Ambassador Ngoma', company: 'Foreign Affairs', hourOffset: 2, status: 'approved', purpose: 'Policy briefing' },
          { name: 'Dr. Mwila', company: 'Health Board', hourOffset: 4, status: 'pending_approval', purpose: 'Board review', vip: true },
        ]
      : [
          { name: 'James Mulenga', company: 'Investor Group', hourOffset: 3, status: 'approved', purpose: 'Investment update' },
        ];

    for (const demo of demoVisitors) {
      const visitorId = generateId('vis');
      await poolConn.query(
        `INSERT INTO visitors (id, organisation_id, full_name, phone, company) VALUES (?, ?, ?, ?, ?)`,
        [visitorId, host.organisation_id, demo.name, '+260971234567', demo.company],
      );

      const visitId = generateId('visit');
      const scheduledAt = new Date();
      scheduledAt.setHours(9 + demo.hourOffset, 0, 0, 0);

      await poolConn.query(
        `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, category_id, purpose, status, pass_code, expected_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visitId,
          host.organisation_id,
          site.id,
          visitorId,
          host.id,
          demo.vip ? category?.id : category?.id,
          demo.purpose,
          demo.status,
          Math.random().toString(36).slice(2, 8).toUpperCase(),
          scheduledAt,
          hostUser.id,
        ],
      );

      await createAppointmentForVisit(poolConn, {
        organisationId: host.organisation_id,
        visitId,
        hostId: host.id,
        scheduledAt,
        title: demo.purpose,
        createdBy: hostUser.id,
      });

      await poolConn.query(
        `INSERT INTO visit_events (id, visit_id, event_type, actor_user_id, details) VALUES (?, ?, 'registered', ?, ?)`,
        [generateId('evt'), visitId, hostUser.id, JSON.stringify({ status: demo.status })],
      );
    }
  }

  console.log('[seed] Executive demo appointments created.');
}

export async function seedSampleVisits(poolConn = pool, { force = false } = {}) {
  if (IS_PRODUCTION && !force) return;

  const [[existing]] = await poolConn.query('SELECT id FROM visits LIMIT 1');
  if (existing) return;

  const [[org]] = await poolConn.query('SELECT id FROM organisations LIMIT 1');
  const [[site]] = await poolConn.query('SELECT id FROM sites WHERE organisation_id = ? LIMIT 1', [org?.id]);
  const [[station]] = site?.id
    ? await poolConn.query('SELECT id FROM stations WHERE site_id = ? LIMIT 1', [site.id])
    : [[]];
  const [[host]] = await poolConn.query(
    `SELECT id FROM hosts WHERE organisation_id = ? ORDER BY user_id IS NOT NULL DESC, created_at ASC LIMIT 1`,
    [org?.id],
  );
  const [[category]] = await poolConn.query('SELECT id FROM visitor_categories WHERE organisation_id = ? LIMIT 1', [org?.id]);

  if (!org?.id || !site?.id) return;

  const visitors = [
    { name: 'John Chanda', phone: '+260971111001', company: 'ABC Ltd' },
    { name: 'Mary Phiri', phone: '+260971111002', company: 'XYZ Corp' },
  ];

  for (const v of visitors) {
    const visitorId = generateId('vis');
    await poolConn.query(
      `INSERT INTO visitors (id, organisation_id, full_name, phone, company) VALUES (?, ?, ?, ?, ?)`,
      [visitorId, org.id, v.name, v.phone, v.company],
    );

    const visitId = generateId('visit');
    const status = v.name.includes('John') ? 'approved' : 'pending_approval';
    await poolConn.query(
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

    await poolConn.query(
      `INSERT INTO visit_events (id, visit_id, event_type, details) VALUES (?, ?, 'registered', ?)`,
      [generateId('evt'), visitId, JSON.stringify({ status })],
    );
  }

  console.log('[seed] Sample visits created.');
}
