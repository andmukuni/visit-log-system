import express from 'express';
import pool from '../db.js';
import { generateId } from '../visitorSchema.js';
import { isSuperAdmin } from '../scopeService.js';
import { writeAuditLog } from '../auditService.js';
import { permissionsFromRequest } from '../classificationService.js';
import { VISIT_SELECT_FIELDS, VISIT_JOINS, formatVisitResponse, applyVisitListMasking } from '../visitResponseService.js';
import { getEmailProviderStatus } from '../adapters/emailAdapter.js';
import { getSmsProviderStatus } from '../adapters/smsAdapter.js';
import { getDeliveryStats } from '../notificationService.js';
import { fetchVisitsTodayYesterday, fetchWeeklyVisits, fetchWeeklyWalkingVisits, fetchWeeklyDriveInVisits, buildWeeklyTrend } from '../dashboardStats.js';

function organisationSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const PLATFORM_ORGANISATION_SELECT = `
  SELECT o.*,
         sub.plan_name, sub.status AS subscription_status,
         (SELECT COUNT(*) FROM sites s WHERE s.organisation_id = o.id) AS site_count,
         (SELECT COUNT(*) FROM buildings b
            INNER JOIN sites s ON s.id = b.site_id
           WHERE s.organisation_id = o.id) AS building_count,
         (SELECT COUNT(*) FROM offices ofc WHERE ofc.organisation_id = o.id) AS office_count,
         (SELECT COUNT(*) FROM departments d WHERE d.organisation_id = o.id) AS department_count,
         (SELECT COUNT(*) FROM hosts h WHERE h.organisation_id = o.id) AS employee_count,
         (SELECT COUNT(*) FROM user_scopes us WHERE us.organisation_id = o.id) AS user_count
  FROM organisations o
  LEFT JOIN subscriptions sub ON sub.organisation_id = o.id
`;

const PLATFORM_VEHICLE_SELECT = `
  SELECT veh.*, o.name AS organisation_name
  FROM vehicles veh
  INNER JOIN organisations o ON o.id = veh.organisation_id
`;

const PLATFORM_VISIT_LIST_SELECT = `
  SELECT vis.id, vis.pass_code AS reference_number, vis.status, vis.purpose, vis.created_at,
         vis.checked_in_at AS check_in_at, vis.checked_out_at AS check_out_at, vis.expected_at,
         v.id AS visitor_id, v.full_name AS visitor_name, v.phone, v.email, v.company,
         h.name AS host_name,
         o.name AS organisation_name, o.id AS organisation_id,
         s.name AS site_name,
         vc.name AS category_name,
         COALESCE(vc.classification, 'standard') AS classification
  FROM visits vis
  INNER JOIN visitors v ON v.id = vis.visitor_id
  INNER JOIN organisations o ON o.id = vis.organisation_id
  LEFT JOIN hosts h ON h.id = vis.host_id
  LEFT JOIN sites s ON s.id = vis.site_id
  LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
`;

function requirePlatform(req, res, next) {
  const perms = req.adminClaims?.permissions || [];
  const legacyAdmin = req.adminClaims?.role === 'admin' && perms.length === 0;
  if (legacyAdmin || isSuperAdmin(req.adminClaims) || perms.some((p) => String(p).startsWith('platform.'))) {
    return next();
  }
  return res.status(403).json({ ok: false, message: 'Platform administrator access required.' });
}

export function createPlatformRouter() {
  const router = express.Router();
  router.use(requirePlatform);

  router.get('/dashboard', async (_req, res) => {
    try {
      const dbStart = Date.now();
      await pool.query('SELECT 1');
      const dbLatencyMs = Date.now() - dbStart;

      const [[orgCount]] = await pool.query(`SELECT COUNT(*) AS count FROM organisations`);
      const [[userCount]] = await pool.query(`SELECT COUNT(*) AS count FROM users`);
      const [[activeOrgs]] = await pool.query(`SELECT COUNT(*) AS count FROM organisations WHERE status = 'active'`);
      const [[checkedInNow]] = await pool.query(`SELECT COUNT(*) AS count FROM visits WHERE status = 'checked_in'`);
      const [[pendingApprovals]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE status IN ('pending_approval', 'pre_registered')`,
      );
      const [[openIncidents]] = await pool.query(
        `SELECT COUNT(*) AS count FROM incidents WHERE status IN ('open', 'investigating')`,
      );
      const [[auditToday]] = await pool.query(
        `SELECT COUNT(*) AS count FROM audit_logs WHERE created_at >= CURDATE()`,
      );

      const { visitsToday, visitsYesterday, visitTrend } = await fetchVisitsTodayYesterday(pool);
      const weeklyVisits = await fetchWeeklyVisits(pool);
      const weeklyWalking = await fetchWeeklyWalkingVisits(pool);
      const weeklyDriveIn = await fetchWeeklyDriveInVisits(pool);
      const deliveryStats = await getDeliveryStats(pool);

      const [recentAudit] = await pool.query(
        `SELECT al.id, al.action, al.result, al.created_at,
                u.name AS actor_name, o.name AS organisation_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         LEFT JOIN organisations o ON o.id = al.organisation_id
         ORDER BY al.created_at DESC
         LIMIT 10`,
      );

      const weeklyTrend = buildWeeklyTrend(weeklyVisits, weeklyWalking, weeklyDriveIn);

      const [visitsByOrganisation] = await pool.query(
        `SELECT o.name AS organisation_name, COUNT(*) AS total
         FROM visits vis
         INNER JOIN organisations o ON o.id = vis.organisation_id
         GROUP BY o.id, o.name
         ORDER BY total DESC
         LIMIT 6`,
      );

      res.json({
        ok: true,
        data: {
          organisations: Number(orgCount?.count || 0),
          users: Number(userCount?.count || 0),
          visitsToday,
          visitsYesterday,
          visitTrend,
          checkedInNow: Number(checkedInNow?.count || 0),
          pendingApprovals: Number(pendingApprovals?.count || 0),
          openIncidents: Number(openIncidents?.count || 0),
          auditToday: Number(auditToday?.count || 0),
          activeOrganisations: Number(activeOrgs?.count || 0),
          pendingNotifications: deliveryStats.pending,
          failedNotificationsTotal: deliveryStats.failed,
          dbLatencyMs,
          weeklyVisits,
          weeklyTrend,
          visitsByOrganisation: visitsByOrganisation.map((row) => ({
            organisation_name: row.organisation_name,
            total: Number(row.total || 0),
          })),
          recentAudit,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/calendar', async (req, res) => {
    try {
      const limit = Math.min(200, Number(req.query.limit) || 100);
      const [rows] = await pool.query(
        `SELECT a.id, a.title, a.scheduled_at, a.status,
                o.name AS organisation_name,
                u.name AS host_name,
                vis.pass_code AS reference_number, vis.status AS visit_status,
                v.full_name AS visitor_name
         FROM appointments a
         INNER JOIN organisations o ON o.id = a.organisation_id
         LEFT JOIN visits vis ON vis.id = a.visit_id
         LEFT JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN users u ON u.id = a.host_id
         WHERE a.scheduled_at IS NOT NULL
         ORDER BY a.scheduled_at ASC
         LIMIT ?`,
        [limit],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/log-book', async (req, res) => {
    try {
      const limit = Math.min(200, Number(req.query.limit) || 100);
      const search = String(req.query.search || req.query.q || '').trim();
      const status = String(req.query.status || '').trim();
      const visitType = String(req.query.type || 'walking').toLowerCase();

      let sql = `
        SELECT vis.id, vis.pass_code AS reference_number, vis.status, vis.created_at,
               vis.checked_in_at AS check_in_at, vis.checked_out_at AS check_out_at,
               v.full_name AS visitor_name,
               h.name AS host_name,
               o.name AS organisation_name,
               s.name AS site_name,
               vc.name AS category_name,
               (SELECT GROUP_CONCAT(DISTINCT veh.plate_number)
                FROM vehicles veh WHERE veh.visit_id = vis.id) AS plate_numbers
        FROM visits vis
        INNER JOIN visitors v ON v.id = vis.visitor_id
        INNER JOIN organisations o ON o.id = vis.organisation_id
        LEFT JOIN hosts h ON h.id = vis.host_id
        LEFT JOIN sites s ON s.id = vis.site_id
        LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
        WHERE 1=1
      `;
      const params = [];

      if (visitType === 'walking') {
        sql += ' AND NOT EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      } else if (visitType === 'vehicle') {
        sql += ' AND EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      }
      if (status) {
        sql += ' AND vis.status = ?';
        params.push(status);
      }
      if (search) {
        sql += ` AND (
          v.full_name LIKE ?
          OR vis.pass_code LIKE ?
          OR vis.id LIKE ?
          OR h.name LIKE ?
          OR o.name LIKE ?
          OR s.name LIKE ?
        )`;
        const term = `%${search}%`;
        params.push(term, term, term, term, term, term);
      }

      sql += ' ORDER BY vis.created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/visitors', async (req, res) => {
    try {
      const limit = Math.min(200, Number(req.query.limit) || 100);
      const search = String(req.query.search || req.query.q || '').trim();
      const status = String(req.query.status || '').trim();

      let sql = `${PLATFORM_VISIT_LIST_SELECT} WHERE 1=1`;
      const params = [];

      if (status) {
        sql += ' AND vis.status = ?';
        params.push(status);
      }
      if (search) {
        sql += ` AND (
          v.full_name LIKE ?
          OR v.phone LIKE ?
          OR v.email LIKE ?
          OR v.company LIKE ?
          OR vis.purpose LIKE ?
          OR h.name LIKE ?
          OR o.name LIKE ?
          OR vis.pass_code LIKE ?
          OR vis.id LIKE ?
        )`;
        const term = `%${search}%`;
        params.push(term, term, term, term, term, term, term, term, term);
      }

      sql += ' ORDER BY vis.created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      const permissions = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, permissions) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/visits/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub || null;
      const visitId = req.params.id;

      const [[visit]] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS},
                o.name AS organisation_name,
                s.name AS site_name
         FROM visits vis
         ${VISIT_JOINS}
         INNER JOIN organisations o ON o.id = vis.organisation_id
         LEFT JOIN sites s ON s.id = vis.site_id
         WHERE vis.id = ?
         LIMIT 1`,
        [visitId],
      );

      if (!visit) {
        return res.status(404).json({ ok: false, message: 'Visit not found.' });
      }

      const permissions = permissionsFromRequest(req);
      const formattedVisit = await formatVisitResponse(pool, visit, permissions, { actorUserId: userId });

      const [events] = await pool.query(
        `SELECT ve.*, u.name AS actor_name
         FROM visit_events ve
         LEFT JOIN users u ON u.id = ve.actor_user_id
         WHERE ve.visit_id = ?
         ORDER BY ve.created_at ASC`,
        [visitId],
      );

      const [approvals] = await pool.query(
        `SELECT va.*, u.name AS approver_name
         FROM visit_approvals va
         LEFT JOIN users u ON u.id = va.approver_user_id
         WHERE va.visit_id = ?
         ORDER BY va.created_at ASC`,
        [visitId],
      );

      const [visitorHistory] = await pool.query(
        `${PLATFORM_VISIT_LIST_SELECT}
         WHERE v.id = ? AND vis.id <> ?
         ORDER BY vis.created_at DESC
         LIMIT 10`,
        [visit.visitor_id, visitId],
      );

      res.json({
        ok: true,
        data: {
          visit: formattedVisit,
          events,
          approvals,
          visitorHistory,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/vehicles', async (req, res) => {
    try {
      const limit = Math.min(200, Number(req.query.limit) || 100);
      const search = String(req.query.search || req.query.q || '').trim();
      const status = String(req.query.status || '').trim();

      let sql = `${PLATFORM_VEHICLE_SELECT} WHERE 1=1`;
      const params = [];

      if (status) {
        sql += ' AND veh.status = ?';
        params.push(status);
      }
      if (search) {
        sql += ` AND (
          veh.plate_number LIKE ?
          OR veh.driver_name LIKE ?
          OR veh.make LIKE ?
          OR veh.colour LIKE ?
          OR o.name LIKE ?
        )`;
        const term = `%${search}%`;
        params.push(term, term, term, term, term);
      }

      sql += ' ORDER BY veh.created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/vehicles', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub || null;
      const organisationId = String(req.body?.organisation_id || '').trim();
      const plateNumber = String(req.body?.plate_number || req.body?.plateNumber || '').trim();
      const vehicleType = String(req.body?.vehicle_type || req.body?.vehicleType || '').trim() || null;
      const make = String(req.body?.make || '').trim() || null;
      const colour = String(req.body?.colour || req.body?.color || '').trim() || null;
      const driverName = String(req.body?.driver_name || req.body?.driverName || '').trim() || null;
      const status = String(req.body?.status || 'on_site').trim() || 'on_site';

      if (!organisationId) {
        return res.status(400).json({ ok: false, message: 'Organisation is required.' });
      }
      if (!plateNumber) {
        return res.status(400).json({ ok: false, message: 'Plate number is required.' });
      }

      const [[org]] = await pool.query(
        'SELECT id, name FROM organisations WHERE id = ? LIMIT 1',
        [organisationId],
      );
      if (!org) {
        return res.status(404).json({ ok: false, message: 'Organisation not found.' });
      }

      const id = generateId('veh');
      await pool.query(
        `INSERT INTO vehicles (id, organisation_id, plate_number, vehicle_type, make, colour, driver_name, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, organisationId, plateNumber.toUpperCase(), vehicleType, make, colour, driverName, status, userId],
      );

      await writeAuditLog(pool, {
        organisationId,
        actorUserId: userId,
        action: 'platform.vehicle.create',
        targetType: 'vehicle',
        targetId: id,
      });

      const [[row]] = await pool.query(`${PLATFORM_VEHICLE_SELECT} WHERE veh.id = ?`, [id]);
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/vehicles/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub || null;
      const targetId = req.params.id;
      const [[existing]] = await pool.query('SELECT * FROM vehicles WHERE id = ? LIMIT 1', [targetId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Vehicle not found.' });
      }

      const organisationId = req.body?.organisation_id != null
        ? String(req.body.organisation_id).trim()
        : existing.organisation_id;
      const plateNumber = req.body?.plate_number != null || req.body?.plateNumber != null
        ? String(req.body.plate_number || req.body.plateNumber).trim().toUpperCase()
        : existing.plate_number;
      const vehicleType = req.body?.vehicle_type != null || req.body?.vehicleType != null
        ? String(req.body.vehicle_type || req.body.vehicleType).trim() || null
        : existing.vehicle_type;
      const make = req.body?.make != null ? String(req.body.make).trim() || null : existing.make;
      const colour = req.body?.colour != null || req.body?.color != null
        ? String(req.body.colour || req.body.color).trim() || null
        : existing.colour;
      const driverName = req.body?.driver_name != null || req.body?.driverName != null
        ? String(req.body.driver_name || req.body.driverName).trim() || null
        : existing.driver_name;
      const status = req.body?.status != null
        ? String(req.body.status).trim() || existing.status
        : existing.status;

      if (!organisationId) {
        return res.status(400).json({ ok: false, message: 'Organisation is required.' });
      }
      if (!plateNumber) {
        return res.status(400).json({ ok: false, message: 'Plate number is required.' });
      }

      const [[org]] = await pool.query(
        'SELECT id FROM organisations WHERE id = ? LIMIT 1',
        [organisationId],
      );
      if (!org) {
        return res.status(404).json({ ok: false, message: 'Organisation not found.' });
      }

      await pool.query(
        `UPDATE vehicles
         SET organisation_id = ?, plate_number = ?, vehicle_type = ?, make = ?, colour = ?,
             driver_name = ?, status = ?
         WHERE id = ?`,
        [organisationId, plateNumber, vehicleType, make, colour, driverName, status, targetId],
      );

      await writeAuditLog(pool, {
        organisationId,
        actorUserId: userId,
        action: 'platform.vehicle.update',
        targetType: 'vehicle',
        targetId,
      });

      const [[row]] = await pool.query(`${PLATFORM_VEHICLE_SELECT} WHERE veh.id = ?`, [targetId]);
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/vehicles/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub || null;
      const targetId = req.params.id;
      const [[existing]] = await pool.query('SELECT * FROM vehicles WHERE id = ? LIMIT 1', [targetId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Vehicle not found.' });
      }

      if (existing.status === 'on_site') {
        return res.status(409).json({
          ok: false,
          message: 'Cannot delete a vehicle that is currently on site. Check it out first.',
        });
      }

      await pool.query('DELETE FROM vehicle_entries WHERE vehicle_id = ?', [targetId]);
      await pool.query('DELETE FROM vehicles WHERE id = ?', [targetId]);

      await writeAuditLog(pool, {
        organisationId: existing.organisation_id,
        actorUserId: userId,
        action: 'platform.vehicle.delete',
        targetType: 'vehicle',
        targetId,
      });

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/organisations', async (_req, res) => {
    try {
      const [rows] = await pool.query(`${PLATFORM_ORGANISATION_SELECT} ORDER BY o.name ASC`);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/organisations', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const slugInput = String(req.body?.slug || '').trim();
      const timezone = String(req.body?.timezone || 'Africa/Lusaka').trim() || 'Africa/Lusaka';
      const status = String(req.body?.status || 'active').trim() || 'active';

      if (!name) {
        return res.status(400).json({ ok: false, message: 'Organisation name is required.' });
      }

      const slug = organisationSlug(slugInput || name);
      if (!slug) {
        return res.status(400).json({ ok: false, message: 'A valid organisation slug is required.' });
      }

      const [[existingSlug]] = await pool.query(
        'SELECT id FROM organisations WHERE slug = ? LIMIT 1',
        [slug],
      );
      if (existingSlug) {
        return res.status(409).json({ ok: false, message: 'Organisation slug already exists.' });
      }

      const id = generateId('org');
      await pool.query(
        `INSERT INTO organisations (id, name, slug, status, timezone)
         VALUES (?, ?, ?, ?, ?)`,
        [id, name, slug, status, timezone],
      );

      const [[row]] = await pool.query(`${PLATFORM_ORGANISATION_SELECT} WHERE o.id = ?`, [id]);
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/organisations/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const [[existing]] = await pool.query('SELECT * FROM organisations WHERE id = ? LIMIT 1', [targetId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Organisation not found.' });
      }

      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const timezone = req.body?.timezone != null
        ? String(req.body.timezone).trim() || existing.timezone
        : existing.timezone;
      const status = req.body?.status != null
        ? String(req.body.status).trim() || existing.status
        : existing.status;

      let slug = existing.slug;
      if (req.body?.slug != null) {
        slug = organisationSlug(req.body.slug);
        if (!slug) {
          return res.status(400).json({ ok: false, message: 'A valid organisation slug is required.' });
        }
        const [[slugTaken]] = await pool.query(
          'SELECT id FROM organisations WHERE slug = ? AND id <> ? LIMIT 1',
          [slug, targetId],
        );
        if (slugTaken) {
          return res.status(409).json({ ok: false, message: 'Organisation slug already exists.' });
        }
      }

      if (!name) {
        return res.status(400).json({ ok: false, message: 'Organisation name is required.' });
      }

      await pool.query(
        'UPDATE organisations SET name = ?, slug = ?, status = ?, timezone = ?, updated_at = NOW() WHERE id = ?',
        [name, slug, status, timezone, targetId],
      );

      const [[row]] = await pool.query(`${PLATFORM_ORGANISATION_SELECT} WHERE o.id = ?`, [targetId]);
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/organisations/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const [[existing]] = await pool.query('SELECT id, name FROM organisations WHERE id = ? LIMIT 1', [targetId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Organisation not found.' });
      }

      const [[siteCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM sites WHERE organisation_id = ?',
        [targetId],
      );
      const [[userCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM user_scopes WHERE organisation_id = ?',
        [targetId],
      );
      const [[visitCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ?',
        [targetId],
      );

      const blocked = Number(siteCount?.count || 0) > 0
        || Number(userCount?.count || 0) > 0
        || Number(visitCount?.count || 0) > 0;
      if (blocked) {
        return res.status(409).json({
          ok: false,
          message: 'Cannot delete an organisation that has sites, users, or visit records. Suspend it instead.',
        });
      }

      await pool.query('DELETE FROM subscriptions WHERE organisation_id = ?', [targetId]);
      await pool.query('DELETE FROM organisations WHERE id = ?', [targetId]);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/subscriptions', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT sub.*, o.name AS organisation_name, o.slug AS organisation_slug
         FROM subscriptions sub
         INNER JOIN organisations o ON o.id = sub.organisation_id
         ORDER BY o.name ASC`,
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/health', async (_req, res) => {
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      const dbLatencyMs = Date.now() - start;

      const deliveryStats = await getDeliveryStats(pool);
      const email = await getEmailProviderStatus();
      const sms = await getSmsProviderStatus();
      const [[totalNotifications]] = await pool.query(`SELECT COUNT(*) AS count FROM notifications`);

      res.json({
        ok: true,
        data: {
          api: 'healthy',
          database: 'connected',
          dbLatencyMs,
          pendingNotificationDeliveries: deliveryStats.pending,
          failedNotificationDeliveries: deliveryStats.failed,
          deliveredExternalNotifications: deliveryStats.deliveredExternal,
          totalNotifications: Number(totalNotifications?.count || 0),
          emailProvider: email.provider,
          emailConfigured: email.configured,
          emailFrom: email.from,
          smsProvider: sms.provider,
          smsConfigured: sms.configured,
          smsFrom: sms.from,
          environment: process.env.NODE_ENV || 'development',
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const limit = Math.min(100, Number(req.query.limit) || 50);
      const [rows] = await pool.query(
        `SELECT al.id, al.organisation_id, al.action, al.target_type, al.result, al.created_at,
                u.name AS actor_name, o.name AS organisation_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         LEFT JOIN organisations o ON o.id = al.organisation_id
         ORDER BY al.created_at DESC
         LIMIT ?`,
        [limit],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/users', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.created_at,
                GROUP_CONCAT(DISTINCT ar.slug) AS role_slugs
         FROM users u
         LEFT JOIN user_admin_roles uar ON uar.user_id = u.id
         LEFT JOIN admin_roles ar ON ar.id = uar.role_id
         WHERE u.role = 'admin' OR ar.slug IN ('platform_admin', 'super_admin')
         GROUP BY u.id
         ORDER BY u.created_at DESC`,
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
