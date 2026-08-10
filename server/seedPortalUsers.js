import crypto from 'crypto';
import pool from './db.js';
import { hashPassword } from './auth.js';
import { generateId, seedOfficeHierarchy } from './visitorSchema.js';
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

const EMPLOYEE_APPT_MARKER = '[seed:employee-schedule]';

const EMPLOYEE_APPT_VISITORS = [
  { name: 'John Chanda', company: 'ABC Holdings', purpose: 'Quarterly review' },
  { name: 'Mary Phiri', company: 'Zenith Partners', purpose: 'Contract signing' },
  { name: 'David Mwale', company: 'Summit Legal', purpose: 'Legal consultation' },
  { name: 'Sarah Banda', company: 'Partner Co', purpose: 'Partnership discussion' },
  { name: 'James Mulenga', company: 'Investor Group', purpose: 'Investment update' },
  { name: 'Ambassador Ngoma', company: 'Foreign Affairs', purpose: 'Policy briefing' },
  { name: 'Dr. Mwila', company: 'Health Board', purpose: 'Board review' },
  { name: 'Linda Zulu', company: 'Tech Solutions', purpose: 'Product demo' },
  { name: 'Michael Bweupe', company: 'Logistics Ltd', purpose: 'Supply chain review' },
  { name: 'Patricia Lungu', company: 'Finance Corp', purpose: 'Budget planning' },
];

const EMPLOYEE_APPT_STATUSES = ['expected', 'approved', 'pending_approval', 'pre_registered'];
const EMPLOYEE_APPT_HOURS = [9, 10, 11, 14, 15, 16];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

function startOfNextCalendarWeek(from = new Date()) {
  const base = startOfDay(from);
  const day = base.getDay();
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
  return addDays(base, daysUntilNextMonday);
}

function buildEmployeeAppointmentDates(from = new Date()) {
  const today = startOfDay(from);
  const nextMonday = startOfNextCalendarWeek(from);
  const dates = [today];
  for (let i = 0; i < 7; i += 1) {
    dates.push(addDays(nextMonday, i));
  }
  return dates;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

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

  await seedOfficeHierarchy(poolConn);

  const [[site]] = await poolConn.query('SELECT id FROM sites WHERE organisation_id = ? LIMIT 1', [org.id]);
  const [[station]] = site?.id
    ? await poolConn.query('SELECT id FROM stations WHERE site_id = ? LIMIT 1', [site.id])
    : [[]];
  const [[dept]] = await poolConn.query('SELECT id FROM departments WHERE organisation_id = ? LIMIT 1', [org.id]);
  const [[execDept]] = await poolConn.query(
    `SELECT id FROM departments WHERE organisation_id = ? AND (code = 'EXEC' OR LOWER(name) LIKE '%executive%') LIMIT 1`,
    [org.id],
  );
  const [[defaultOffice]] = await poolConn.query(
    'SELECT id, department_id FROM offices WHERE organisation_id = ? ORDER BY office_number ASC LIMIT 1',
    [org.id],
  );
  const [[ceoOffice]] = await poolConn.query(
    `SELECT id, department_id FROM offices
     WHERE organisation_id = ? AND (office_number LIKE 'CEO%' OR LOWER(name) LIKE '%ceo%')
     ORDER BY office_number ASC LIMIT 1`,
    [org.id],
  );
  const [[dceoOffice]] = await poolConn.query(
    `SELECT id, department_id FROM offices
     WHERE organisation_id = ? AND (office_number LIKE 'DCEO%' OR LOWER(name) LIKE '%dceo%')
     ORDER BY office_number ASC LIMIT 1`,
    [org.id],
  );

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

    let office = defaultOffice;
    let departmentId = dept?.id || defaultOffice?.department_id || null;
    if (portalUser.roleSlug === 'ceo' || portalUser.roleSlug === 'ceo_secretary') {
      office = ceoOffice || defaultOffice;
      departmentId = office?.department_id || execDept?.id || departmentId;
    } else if (portalUser.roleSlug === 'dceo' || portalUser.roleSlug === 'dceo_secretary') {
      office = dceoOffice || ceoOffice || defaultOffice;
      departmentId = office?.department_id || execDept?.id || departmentId;
    }

    await poolConn.query(
      `INSERT INTO user_scopes (user_id, organisation_id, site_id, station_id, department_id, office_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         site_id = VALUES(site_id),
         station_id = VALUES(station_id),
         department_id = VALUES(department_id),
         office_id = VALUES(office_id)`,
      [userId, org.id, site?.id || null, station?.id || null, departmentId, office?.id || null],
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
        await poolConn.query(
          'UPDATE hosts SET user_id = ?, name = ?, department_id = ?, site_id = ?, office_id = ? WHERE id = ?',
          [userId, portalUser.name, departmentId, site?.id || null, office?.id || null, existingHost.id],
        );
      } else {
        await poolConn.query(
          `INSERT INTO hosts (id, organisation_id, department_id, site_id, office_id, user_id, name, email, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [generateId('host'), org.id, departmentId, site?.id || null, office?.id || null, userId, portalUser.name, email],
        );
      }
    }
  }

  console.log(`[seed] Portal users ready (${created} created, ${updated} updated). Password: demo1234`);
  if (process.env.SEED_DEMO_VISITS === '1') {
    await seedHostDemoVisit(poolConn);
    await seedExecutiveDemoVisits(poolConn);
    await seedEmployeeAppointments(poolConn);
  }
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

async function repairExecutiveSelfScheduledVisits(poolConn = pool) {
  const [result] = await poolConn.query(
    `UPDATE visits vis
     INNER JOIN hosts h ON h.id = vis.host_id
     INNER JOIN users u ON u.id = h.user_id
     SET vis.status = 'expected',
         vis.approved_at = COALESCE(vis.approved_at, NOW()),
         vis.updated_at = NOW()
     WHERE vis.created_by = u.id
       AND vis.status IN ('pending_approval', 'pre_registered')`,
  );
  if (result.affectedRows > 0) {
    console.log(`[seed] Repaired ${result.affectedRows} executive self-scheduled visit(s) to expected.`);
  }
}

async function seedExecutiveDemoVisits(poolConn = pool) {
  await repairExecutiveSelfScheduledVisits(poolConn);

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
          { name: 'Dr. Mwila', company: 'Health Board', hourOffset: 4, status: 'expected', purpose: 'Board review', vip: true },
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

export async function seedEmployeeAppointments(poolConn = pool, { force = false } = {}) {
  if (IS_PRODUCTION && !force) {
    console.log('[seed] Skipping employee appointment seed in production (pass force: true to override).');
    return { skipped: true };
  }

  const [[org]] = await poolConn.query(`SELECT id FROM organisations WHERE slug = 'demo-org' LIMIT 1`);
  const orgIds = [];
  if (org?.id) orgIds.push(org.id);

  const [linkedOrgs] = await poolConn.query(
    `SELECT DISTINCT h.organisation_id AS id
     FROM hosts h
     INNER JOIN users u ON u.id = h.user_id
     WHERE u.email LIKE '%@demo.org'`,
  );
  for (const row of linkedOrgs) {
    if (row?.id && !orgIds.includes(row.id)) orgIds.push(row.id);
  }

  if (!orgIds.length) {
    const [[fallbackOrg]] = await poolConn.query('SELECT id FROM organisations LIMIT 1');
    if (fallbackOrg?.id) orgIds.push(fallbackOrg.id);
  }

  const [hosts] = await poolConn.query(
    `SELECT h.id, h.organisation_id, h.name, h.email, h.user_id
     FROM hosts h
     WHERE h.status = 'active'
       AND h.organisation_id IN (${orgIds.map(() => '?').join(',')})
     ORDER BY h.organisation_id, h.name`,
    orgIds,
  );
  if (!hosts.length) {
    console.warn('[seed] No active hosts found for demo organisation.');
    return { skipped: true, reason: 'no_hosts' };
  }

  const siteByOrg = new Map();
  const [sites] = await poolConn.query(
    `SELECT id, organisation_id FROM sites WHERE organisation_id IN (${orgIds.map(() => '?').join(',')})`,
    orgIds,
  );
  for (const site of sites) {
    if (!siteByOrg.has(site.organisation_id)) siteByOrg.set(site.organisation_id, site.id);
  }

  const categoryByOrg = new Map();
  const [categories] = await poolConn.query(
    `SELECT id, organisation_id, classification FROM visitor_categories WHERE organisation_id IN (${orgIds.map(() => '?').join(',')}) ORDER BY classification DESC`,
    orgIds,
  );
  for (const category of categories) {
    if (!categoryByOrg.has(category.organisation_id)) categoryByOrg.set(category.organisation_id, category.id);
  }

  if (!siteByOrg.size) {
    console.warn('[seed] No sites found for target organisations.');
    return { skipped: true, reason: 'no_site' };
  }

  const [[fallbackActor]] = await poolConn.query(
    `SELECT id FROM users WHERE email = 'orgadmin@demo.org' LIMIT 1`,
  );
  const targetDates = buildEmployeeAppointmentDates();

  if (force) {
    const [seedVisits] = await poolConn.query(
      `SELECT id, visitor_id FROM visits WHERE organisation_id IN (${orgIds.map(() => '?').join(',')}) AND purpose LIKE ?`,
      [...orgIds, `${EMPLOYEE_APPT_MARKER}%`],
    );
    const visitIds = seedVisits.map((row) => row.id).filter(Boolean);
    const visitorIds = seedVisits.map((row) => row.visitor_id).filter(Boolean);

    if (visitIds.length) {
      await poolConn.query(
        `DELETE FROM appointments WHERE visit_id IN (${visitIds.map(() => '?').join(',')})`,
        visitIds,
      );
      await poolConn.query(
        `DELETE FROM visit_events WHERE visit_id IN (${visitIds.map(() => '?').join(',')})`,
        visitIds,
      );
      await poolConn.query(
        `DELETE FROM visits WHERE id IN (${visitIds.map(() => '?').join(',')})`,
        visitIds,
      );
      if (visitorIds.length) {
        await poolConn.query(
          `DELETE FROM visitors WHERE id IN (${visitorIds.map(() => '?').join(',')})`,
          visitorIds,
        );
      }
    }
  }

  let created = 0;
  let skipped = 0;
  let visitorIndex = 0;

  for (const host of hosts) {
    const actorUserId = host.user_id || fallbackActor?.id || null;
    const siteId = siteByOrg.get(host.organisation_id);
    const categoryId = categoryByOrg.get(host.organisation_id);
    if (!siteId) continue;

    for (const date of targetDates) {
      const slotsForDay = 2;
      for (let slot = 0; slot < slotsForDay; slot += 1) {
        const scheduledAt = new Date(date);
        const hour = EMPLOYEE_APPT_HOURS[(visitorIndex + slot) % EMPLOYEE_APPT_HOURS.length];
        scheduledAt.setHours(hour, (slot * 15) % 60, 0, 0);

        const [[existing]] = await poolConn.query(
          `SELECT a.id
           FROM appointments a
           INNER JOIN visits vis ON vis.id = a.visit_id
           WHERE vis.host_id = ?
             AND vis.purpose LIKE ?
             AND DATE(a.scheduled_at) = DATE(?)
             AND HOUR(a.scheduled_at) = ?
           LIMIT 1`,
          [host.id, `${EMPLOYEE_APPT_MARKER}%`, scheduledAt, hour],
        );
        if (existing?.id && !force) {
          skipped += 1;
          continue;
        }

        const visitor = EMPLOYEE_APPT_VISITORS[visitorIndex % EMPLOYEE_APPT_VISITORS.length];
        visitorIndex += 1;
        const status = EMPLOYEE_APPT_STATUSES[visitorIndex % EMPLOYEE_APPT_STATUSES.length];
        const purpose = `${EMPLOYEE_APPT_MARKER} — ${visitor.purpose}`;

        const visitorId = generateId('vis');
        await poolConn.query(
          `INSERT INTO visitors (id, organisation_id, full_name, phone, company, email)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            visitorId,
            host.organisation_id,
            visitor.name,
            `+26097${String(1000000 + visitorIndex).slice(-7)}`,
            visitor.company,
            `${visitor.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
          ],
        );

        const visitId = generateId('visit');
        await poolConn.query(
          `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, category_id, purpose, status, pass_code, expected_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            visitId,
            host.organisation_id,
            siteId,
            visitorId,
            host.id,
            categoryId || null,
            purpose,
            status,
            Math.random().toString(36).slice(2, 8).toUpperCase(),
            scheduledAt,
            actorUserId,
          ],
        );

        await createAppointmentForVisit(poolConn, {
          organisationId: host.organisation_id,
          visitId,
          hostId: host.id,
          scheduledAt,
          title: visitor.purpose,
          createdBy: actorUserId,
        });

        await poolConn.query(
          `INSERT INTO visit_events (id, visit_id, event_type, actor_user_id, details)
           VALUES (?, ?, 'registered', ?, ?)`,
          [
            generateId('evt'),
            visitId,
            actorUserId,
            JSON.stringify({ status, source: 'employee_schedule_seed', date: formatDateKey(date) }),
          ],
        );

        created += 1;
      }
    }
  }

  console.log(
    `[seed] Employee appointments ready (${created} created, ${skipped} skipped) for ${hosts.length} host(s) across ${targetDates.length} day(s).`,
  );
  return { skipped: false, created, skipped, hosts: hosts.length, days: targetDates.length };
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
