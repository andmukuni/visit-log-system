import crypto from 'crypto';
import { generateId } from './visitorSchema.js';

const DEMO_MARKER = 'demo-seed-v1';

const EXTRA_ORGANISATIONS = [
  { name: 'Acme Corporation', slug: 'acme-corp', city: 'Lusaka' },
  { name: 'Greenfield Logistics', slug: 'greenfield-ltd', city: 'Ndola' },
  { name: 'Nova Holdings', slug: 'nova-holdings', city: 'Kitwe' },
];

const VISITOR_NAMES = [
  'John Chanda', 'Mary Phiri', 'David Banda', 'Sarah Mumba', 'James Zulu',
  'Linda Tembo', 'Michael Ngoma', 'Patricia Mwila', 'Robert Sinkala', 'Catherine Muleya',
  'Emmanuel Musonda', 'Faith Chileshe', 'George Mwape', 'Helen Kapumba', 'Isaac Lungu',
  'Julia Mwansa', 'Kevin Phiri', 'Laura Bwezani', 'Martin Chilufya', 'Nancy Mwamba',
];

const COMPANIES = ['ABC Ltd', 'XYZ Corp', 'Delta Services', 'Prime Supplies', 'Tech Partners', 'Global Freight'];

const VEHICLE_MAKES = ['Toyota', 'Nissan', 'Ford', 'Isuzu', 'Mitsubishi', 'Honda'];
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Pickup', 'Van', 'Truck'];
const VEHICLE_COLOURS = ['White', 'Silver', 'Black', 'Blue', 'Red', 'Grey'];
const PLATE_PREFIXES = ['ABC', 'CAB', 'BAX', 'LUS', 'NDL', 'KTW'];

const WEEKLY_WEIGHTS = [3, 5, 4, 8, 6, 2, 7];
const SITE_SHARE_WEIGHTS = [52, 28, 13, 7];

const DEMO_ORG_EXTRA_SITES = [
  { name: 'Regional Office', code: 'RO', address: 'Kitwe, Zambia' },
  { name: 'Distribution Centre', code: 'DC', address: 'Livingstone, Zambia' },
];

const DEMO_SITE_SHARE_ORDER = ['Head Office', 'Warehouse Branch', 'Regional Office', 'Distribution Centre'];

const AUDIT_ACTIONS = [
  'user.login',
  'visit.created',
  'visit.approved',
  'visit.checked_in',
  'visit.checked_out',
  'settings.updated',
  'report.exported',
  'organisation.updated',
];

function pick(list, index) {
  return list[index % list.length];
}

function passCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function daysAgo(days, hour = 10) {
  const date = new Date();
  date.setHours(hour, 30, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function shouldSeedDriveIn(dayOffset, index, visitorIndex) {
  // Roughly half of illustration visits arrive by vehicle, with slight day-to-day variation.
  return (dayOffset + index + visitorIndex) % 3 !== 1;
}

function demoPlateNumber(index) {
  const prefix = pick(PLATE_PREFIXES, index);
  const number = String(1000 + (index % 9000)).padStart(4, '0');
  return `${prefix} ${number}`;
}

async function resolveGateStationId(pool, siteId, fallbackStationId) {
  if (!siteId) return fallbackStationId || null;
  const [[gate]] = await pool.query(
    `SELECT id FROM stations WHERE site_id = ? AND type = 'gate' LIMIT 1`,
    [siteId],
  );
  return gate?.id || fallbackStationId || null;
}

function sortSitesForShare(sites) {
  return [...sites].sort((left, right) => {
    const leftIndex = DEMO_SITE_SHARE_ORDER.indexOf(left.name);
    const rightIndex = DEMO_SITE_SHARE_ORDER.indexOf(right.name);
    if (leftIndex === -1 && rightIndex === -1) return left.name.localeCompare(right.name);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function buildSiteAssignmentPlan(sites, totalVisits) {
  if (!sites?.length || totalVisits <= 0) return [];
  if (sites.length === 1) return Array.from({ length: totalVisits }, () => sites[0]);

  const weights = SITE_SHARE_WEIGHTS.slice(0, sites.length);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const counts = weights.map((weight) => Math.floor((weight / weightSum) * totalVisits));
  let remainder = totalVisits - counts.reduce((sum, count) => sum + count, 0);

  for (let index = 0; remainder > 0; index += 1) {
    counts[index % sites.length] += 1;
    remainder -= 1;
  }

  const buckets = counts.map((count, index) => Array.from({ length: count }, () => sites[index]));
  const plan = [];
  let added = true;

  while (added) {
    added = false;
    for (const bucket of buckets) {
      if (bucket.length) {
        plan.push(bucket.shift());
        added = true;
      }
    }
  }

  return plan;
}

async function ensureDemoOrganisationSites(pool, orgId, existingSites) {
  const sitesByName = new Map(existingSites.map((site) => [site.name, site]));
  let changed = false;

  for (const siteDef of DEMO_ORG_EXTRA_SITES) {
    if (sitesByName.has(siteDef.name)) continue;

    const siteId = generateId('site');
    await pool.query(
      `INSERT INTO sites (id, organisation_id, name, code, address, status) VALUES (?, ?, ?, ?, ?, 'active')`,
      [siteId, orgId, siteDef.name, siteDef.code, siteDef.address],
    );
    await pool.query(
      `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, 'reception', 'active')`,
      [generateId('stn'), siteId, `${siteDef.name} Reception`],
    );
    sitesByName.set(siteDef.name, { id: siteId, name: siteDef.name });
    changed = true;
  }

  if (!changed) return sortSitesForShare(existingSites);

  const [rows] = await pool.query(
    'SELECT id, name FROM sites WHERE organisation_id = ? ORDER BY name',
    [orgId],
  );
  return sortSitesForShare(rows);
}

async function resolveSiteStationId(pool, siteId, fallbackStationId) {
  if (!siteId) return fallbackStationId || null;
  const [[station]] = await pool.query(
    'SELECT id FROM stations WHERE site_id = ? LIMIT 1',
    [siteId],
  );
  return station?.id || fallbackStationId || null;
}

async function seedDriveInVehicle(pool, {
  visitId,
  orgId,
  visitorName,
  createdAt,
  checkedInAt,
  checkedOutAt,
  status,
  stationId,
  actorUserId,
  plateIndex,
}) {
  const vehicleId = generateId('veh');
  const plateNumber = demoPlateNumber(plateIndex);
  const enteredAt = checkedInAt || createdAt;
  let vehicleStatus = 'on_site';

  if (status === 'pending_approval' || status === 'approved') {
    vehicleStatus = 'arrived_at_gate';
  } else if (['checked_out', 'completed'].includes(status)) {
    vehicleStatus = 'on_site';
  }

  await pool.query(
    `INSERT INTO vehicles (
      id, organisation_id, visit_id, plate_number, vehicle_type, make, colour,
      driver_name, status, entry_station_id, entered_at, exited_at, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vehicleId,
      orgId,
      visitId,
      plateNumber,
      pick(VEHICLE_TYPES, plateIndex),
      pick(VEHICLE_MAKES, plateIndex),
      pick(VEHICLE_COLOURS, plateIndex),
      visitorName,
      vehicleStatus,
      stationId,
      ['checked_in', 'checked_out', 'completed', 'in_meeting'].includes(status) ? enteredAt : null,
      ['checked_out', 'completed'].includes(status) ? checkedOutAt : null,
      actorUserId,
      createdAt,
    ],
  );

  return vehicleId;
}

export async function seedDashboardIllustration(pool, { force = false } = {}) {
  const [[markerRow]] = await pool.query(
    'SELECT id FROM visits WHERE purpose LIKE ? LIMIT 1',
    [`%${DEMO_MARKER}%`],
  );

  if (markerRow && !force) {
    console.log('[seed:demo] Dashboard illustration data already present — use --force to re-seed.');
    return { skipped: true };
  }

  if (force && markerRow) {
    console.log('[seed:demo] Removing previous illustration visits…');
    await pool.query(
      `DELETE veh FROM vehicles veh
       INNER JOIN visits v ON v.id = veh.visit_id
       WHERE v.purpose LIKE ?`,
      [`%${DEMO_MARKER}%`],
    );
    await pool.query(
      `DELETE ve FROM visit_events ve
       INNER JOIN visits v ON v.id = ve.visit_id
       WHERE v.purpose LIKE ?`,
      [`%${DEMO_MARKER}%`],
    );
    await pool.query(
      `DELETE va FROM visit_approvals va
       INNER JOIN visits v ON v.id = va.visit_id
       WHERE v.purpose LIKE ?`,
      [`%${DEMO_MARKER}%`],
    );
    await pool.query('DELETE FROM visits WHERE purpose LIKE ?', [`%${DEMO_MARKER}%`]);
    await pool.query(
      `DELETE vis FROM visitors vis
       LEFT JOIN visits v ON v.visitor_id = vis.id
       WHERE v.id IS NULL AND vis.full_name IN (${VISITOR_NAMES.map(() => '?').join(',')})`,
      VISITOR_NAMES,
    );
  }

  const [[demoOrg]] = await pool.query(`SELECT id FROM organisations WHERE slug = 'demo-org' LIMIT 1`);
  if (!demoOrg?.id) {
    throw new Error('Demo organisation not found. Run server bootstrap first (npm run server:dev).');
  }

  const demoSites = await ensureDemoOrganisationSites(pool, demoOrg.id, (
    await pool.query(
      'SELECT id, name FROM sites WHERE organisation_id = ? ORDER BY name',
      [demoOrg.id],
    )
  )[0]);
  const [demoHosts] = await pool.query(
    'SELECT id, name FROM hosts WHERE organisation_id = ? LIMIT 5',
    [demoOrg.id],
  );
  const [[demoCategory]] = await pool.query(
    'SELECT id FROM visitor_categories WHERE organisation_id = ? LIMIT 1',
    [demoOrg.id],
  );
  const [[demoStation]] = await pool.query(
    'SELECT id FROM stations WHERE site_id = ? LIMIT 1',
    [demoSites[0]?.id],
  );
  const [adminUsers] = await pool.query(
    `SELECT id, name FROM users WHERE role = 'admin' OR email LIKE '%@demo.org' LIMIT 5`,
  );
  const actorUserId = adminUsers[0]?.id || null;

  const orgProfiles = [];

  orgProfiles.push({
    orgId: demoOrg.id,
    sites: sortSitesForShare(demoSites),
    hosts: demoHosts,
    categoryId: demoCategory?.id,
    stationId: demoStation?.id,
    visitMultiplier: 1,
  });

  for (const orgDef of EXTRA_ORGANISATIONS) {
    const [[existing]] = await pool.query('SELECT id FROM organisations WHERE slug = ? LIMIT 1', [orgDef.slug]);
    let orgId = existing?.id;

    if (!orgId) {
      orgId = generateId('org');
      await pool.query(
        `INSERT INTO organisations (id, name, slug, status, timezone) VALUES (?, ?, ?, 'active', 'Africa/Lusaka')`,
        [orgId, orgDef.name, orgDef.slug],
      );

      const siteId = generateId('site');
      const deptId = generateId('dept');
      const hostId = generateId('host');
      const catId = generateId('cat');
      const stationId = generateId('stn');

      await pool.query(
        `INSERT INTO sites (id, organisation_id, name, code, address, status) VALUES (?, ?, ?, ?, ?, 'active')`,
        [siteId, orgId, `${orgDef.name} HQ`, 'HQ', orgDef.city],
      );
      await pool.query(
        `INSERT INTO departments (id, organisation_id, name, code) VALUES (?, ?, ?, 'GEN')`,
        [deptId, orgId, 'General'],
      );
      await pool.query(
        `INSERT INTO hosts (id, organisation_id, department_id, name, email, phone, status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')`,
        [hostId, orgId, deptId, `${orgDef.name} Reception`, `reception@${orgDef.slug}.demo`, '+260970000000'],
      );
      await pool.query(
        `INSERT INTO visitor_categories (id, organisation_id, name, slug, requires_approval, default_duration_minutes, classification)
         VALUES (?, ?, 'Guest', 'guest', 1, 120, 'standard')`,
        [catId, orgId],
      );
      await pool.query(
        `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, 'Main Reception', 'reception', 'active')`,
        [stationId, siteId],
      );
      await pool.query(
        `INSERT INTO subscriptions (id, organisation_id, plan_name, status, max_sites, max_users)
         VALUES (?, ?, 'professional', 'active', 5, 50)`,
        [generateId('sub'), orgId],
      );

      orgProfiles.push({
        orgId,
        sites: [{ id: siteId, name: `${orgDef.name} HQ` }],
        hosts: [{ id: hostId, name: `${orgDef.name} Reception` }],
        categoryId: catId,
        stationId,
        visitMultiplier: orgDef.slug === 'acme-corp' ? 0.55 : orgDef.slug === 'greenfield-ltd' ? 0.25 : 0.15,
      });
    } else {
      const [sites] = await pool.query('SELECT id, name FROM sites WHERE organisation_id = ? LIMIT 1', [orgId]);
      const [hosts] = await pool.query('SELECT id, name FROM hosts WHERE organisation_id = ? LIMIT 1', [orgId]);
      const [[category]] = await pool.query('SELECT id FROM visitor_categories WHERE organisation_id = ? LIMIT 1', [orgId]);
      const [[station]] = sites[0]?.id
        ? await pool.query('SELECT id FROM stations WHERE site_id = ? LIMIT 1', [sites[0].id])
        : [[]];
      orgProfiles.push({
        orgId,
        sites,
        hosts,
        categoryId: category?.id,
        stationId: station?.id,
        visitMultiplier: orgDef.slug === 'acme-corp' ? 0.55 : orgDef.slug === 'greenfield-ltd' ? 0.25 : 0.15,
      });
    }
  }

  let visitorIndex = 0;
  let visitsCreated = 0;
  let driveInCreated = 0;
  const gateStationCache = new Map();
  const siteStationCache = new Map();

  for (const profile of orgProfiles) {
    if (!profile.sites?.length || !profile.hosts?.length) continue;

    const totalForOrg = profile.orgId === demoOrg.id
      ? WEEKLY_WEIGHTS.reduce((sum, weight) => sum + weight, 0)
      : Math.max(3, Math.round(WEEKLY_WEIGHTS.reduce((sum, weight) => sum + weight, 0) * profile.visitMultiplier));

    const sitePlan = buildSiteAssignmentPlan(profile.sites, totalForOrg);
    let sitePlanIndex = 0;
    let assigned = 0;

    for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
      const dayWeight = WEEKLY_WEIGHTS[(dayOffset + 6) % 7];
      const dayCount = profile.orgId === demoOrg.id
        ? dayWeight
        : Math.max(dayOffset === 0 ? 1 : 0, Math.round(dayWeight * profile.visitMultiplier));

      for (let i = 0; i < dayCount && assigned < totalForOrg; i += 1) {
        const visitorId = generateId('vis');
        const visitId = generateId('visit');
        const visitorName = pick(VISITOR_NAMES, visitorIndex);
        visitorIndex += 1;

        await pool.query(
          `INSERT INTO visitors (id, organisation_id, full_name, phone, email, company)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            visitorId,
            profile.orgId,
            visitorName,
            `+26097${String(1000000 + visitorIndex).slice(-7)}`,
            `${visitorName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
            pick(COMPANIES, visitorIndex),
          ],
        );

        let status = 'completed';
        let checkedInAt = null;
        let checkedOutAt = null;
        let approvedAt = null;

        if (dayOffset === 0) {
          if (i === 0) status = 'checked_in';
          else if (i === 1) status = 'pending_approval';
          else if (i === 2) status = 'approved';
          else status = pick(['completed', 'checked_out', 'checked_in'], i);
        } else {
          status = pick(['completed', 'checked_out', 'approved'], i + dayOffset);
        }

        const createdAt = daysAgo(dayOffset, 8 + (i % 8));
        if (['checked_in', 'checked_out', 'completed', 'in_meeting'].includes(status)) {
          checkedInAt = new Date(createdAt);
          checkedInAt.setHours(checkedInAt.getHours() + 1);
          approvedAt = createdAt;
        }
        if (['checked_out', 'completed'].includes(status)) {
          checkedOutAt = new Date(createdAt);
          checkedOutAt.setHours(checkedOutAt.getHours() + 3);
        }
        if (status === 'pending_approval') {
          approvedAt = null;
          checkedInAt = null;
        }

        const selectedSite = sitePlan[sitePlanIndex] || profile.sites[0];
        sitePlanIndex += 1;
        const selectedSiteId = selectedSite?.id || profile.sites[0]?.id;
        let selectedStationId = profile.stationId;
        if (selectedSiteId) {
          let cachedStationId = siteStationCache.get(selectedSiteId);
          if (cachedStationId === undefined) {
            cachedStationId = await resolveSiteStationId(pool, selectedSiteId, profile.stationId);
            siteStationCache.set(selectedSiteId, cachedStationId);
          }
          selectedStationId = cachedStationId;
        }

        await pool.query(
          `INSERT INTO visits (
            id, organisation_id, site_id, station_id, visitor_id, host_id, category_id,
            purpose, status, pass_code, created_by, created_at, approved_at, checked_in_at, checked_out_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            visitId,
            profile.orgId,
            selectedSiteId,
            selectedStationId,
            visitorId,
            profile.hosts[0].id,
            profile.categoryId,
            `${DEMO_MARKER} — ${pick(['Client meeting', 'Delivery', 'Interview', 'Maintenance', 'Audit review'], visitorIndex)}`,
            status,
            passCode(),
            actorUserId,
            createdAt,
            approvedAt,
            checkedInAt,
            checkedOutAt,
          ],
        );

        await pool.query(
          `INSERT INTO visit_events (id, visit_id, event_type, actor_user_id, details, created_at)
           VALUES (?, ?, 'registered', ?, ?, ?)`,
          [
            generateId('evt'),
            visitId,
            actorUserId,
            JSON.stringify({ status, marker: DEMO_MARKER }),
            createdAt,
          ],
        );

        if (shouldSeedDriveIn(dayOffset, i, visitorIndex)) {
          const siteId = selectedSiteId;
          let gateStationId = gateStationCache.get(siteId);
          if (gateStationId === undefined) {
            gateStationId = await resolveGateStationId(pool, siteId, profile.stationId);
            gateStationCache.set(siteId, gateStationId);
          }

          await seedDriveInVehicle(pool, {
            visitId,
            orgId: profile.orgId,
            visitorName,
            createdAt,
            checkedInAt,
            checkedOutAt,
            status,
            stationId: gateStationId,
            actorUserId,
            plateIndex: visitorIndex,
          });
          driveInCreated += 1;
        }

        assigned += 1;
        visitsCreated += 1;
      }
    }
  }

  const [[pendingBefore]] = await pool.query(
    `SELECT COUNT(*) AS count FROM visits WHERE status = 'pending_approval' AND organisation_id = ?`,
    [demoOrg.id],
  );
  if (Number(pendingBefore?.count || 0) < 2) {
    const pendingSitePlan = buildSiteAssignmentPlan(demoSites, 2);
    for (let i = 0; i < 2; i += 1) {
      const visitorId = generateId('vis');
      const visitId = generateId('visit');
      const createdAt = daysAgo(0, 11 + i);
      await pool.query(
        `INSERT INTO visitors (id, organisation_id, full_name, phone, company) VALUES (?, ?, ?, ?, ?)`,
        [visitorId, demoOrg.id, pick(VISITOR_NAMES, visitorIndex + i), '+260971234567', 'Pending Co'],
      );
      await pool.query(
        `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, category_id, purpose, status, pass_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)`,
        [
          visitId,
          demoOrg.id,
          pendingSitePlan[i]?.id || demoSites[0].id,
          visitorId,
          demoHosts[0].id,
          demoCategory?.id,
          `${DEMO_MARKER} — Awaiting host approval`,
          passCode(),
          createdAt,
        ],
      );
      visitsCreated += 1;
    }
  }

  const [[openIncidents]] = await pool.query(
    `SELECT COUNT(*) AS count FROM incidents WHERE organisation_id = ? AND status = 'open'`,
    [demoOrg.id],
  );
  if (Number(openIncidents?.count || 0) < 2) {
    const incidents = [
      { title: 'Unescorted visitor in restricted zone', severity: 'medium' },
      { title: 'Tailgating reported at warehouse gate', severity: 'high' },
    ];
    for (const incident of incidents) {
      await pool.query(
        `INSERT INTO incidents (id, organisation_id, site_id, incident_type, severity, status, title, narrative, reported_by)
         VALUES (?, ?, ?, 'security', ?, 'open', ?, ?, ?)`,
        [
          generateId('inc'),
          demoOrg.id,
          demoSites[1]?.id || demoSites[0].id,
          incident.severity,
          incident.title,
          `${DEMO_MARKER} — illustration incident for dashboard KPIs.`,
          actorUserId,
        ],
      );
    }
  }

  const [[auditCount]] = await pool.query(
    `SELECT COUNT(*) AS count FROM audit_logs WHERE created_at >= CURDATE()`,
  );
  if (Number(auditCount?.count || 0) < 12) {
    for (let i = 0; i < 18; i += 1) {
      const org = pick(orgProfiles, i);
      const createdAt = daysAgo(i % 3, 7 + (i % 10));
      await pool.query(
        `INSERT INTO audit_logs (id, organisation_id, actor_user_id, action, target_type, target_id, result, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId('audit'),
          org.orgId,
          actorUserId,
          pick(AUDIT_ACTIONS, i),
          'visit',
          null,
          i % 9 === 0 ? 'denied' : 'success',
          JSON.stringify({ marker: DEMO_MARKER, note: 'Dashboard illustration entry' }),
          '127.0.0.1',
          createdAt,
        ],
      );
    }
  }

  const [[orgCount]] = await pool.query(`SELECT COUNT(*) AS count FROM organisations`);
  const [[visitCount]] = await pool.query(`SELECT COUNT(*) AS count FROM visits`);
  const [[todayCount]] = await pool.query(
    `SELECT COUNT(*) AS count FROM visits WHERE created_at >= CURDATE()`,
  );

  console.log('[seed:demo] Dashboard illustration data ready.');
  console.log(`[seed:demo] Organisations: ${orgCount?.count || 0}, Visits total: ${visitCount?.count || 0}, Visits today: ${todayCount?.count || 0}, Drive-in vehicles: ${driveInCreated}`);

  return {
    skipped: false,
    organisations: Number(orgCount?.count || 0),
    visits: Number(visitCount?.count || 0),
    visitsToday: Number(todayCount?.count || 0),
    driveInVehicles: driveInCreated,
  };
}
