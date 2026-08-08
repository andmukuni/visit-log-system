import express from 'express';
import pool from '../db.js';
import { isSuperAdmin } from '../scopeService.js';
import { getEmailProviderStatus } from '../adapters/emailAdapter.js';
import { getSmsProviderStatus } from '../adapters/smsAdapter.js';
import { getDeliveryStats } from '../notificationService.js';
import { fetchVisitsTodayYesterday, fetchWeeklyVisits, fetchWeeklyWalkingVisits, fetchWeeklyDriveInVisits, buildWeeklyTrend } from '../dashboardStats.js';

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
                vis.reference_number, vis.status AS visit_status,
                CONCAT(v.first_name, ' ', v.last_name) AS visitor_name
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
        SELECT vis.id, vis.reference_number, vis.status, vis.created_at, vis.check_in_at, vis.check_out_at,
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
          OR vis.reference_number LIKE ?
          OR h.name LIKE ?
          OR o.name LIKE ?
          OR s.name LIKE ?
        )`;
        const term = `%${search}%`;
        params.push(term, term, term, term, term);
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

      let sql = `
        SELECT v.id, v.full_name, v.phone, v.email, v.company, v.created_at,
               o.name AS organisation_name,
               (SELECT COUNT(*) FROM visits vis WHERE vis.visitor_id = v.id) AS visit_count,
               (SELECT MAX(vis.created_at) FROM visits vis WHERE vis.visitor_id = v.id) AS last_visit_at
        FROM visitors v
        INNER JOIN organisations o ON o.id = v.organisation_id
        WHERE 1=1
      `;
      const params = [];

      if (search) {
        sql += ` AND (
          v.full_name LIKE ?
          OR v.phone LIKE ?
          OR v.email LIKE ?
          OR v.company LIKE ?
          OR o.name LIKE ?
        )`;
        const term = `%${search}%`;
        params.push(term, term, term, term, term);
      }

      sql += ' ORDER BY last_visit_at DESC, v.created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/vehicles', async (req, res) => {
    try {
      const limit = Math.min(200, Number(req.query.limit) || 100);
      const search = String(req.query.search || req.query.q || '').trim();
      const status = String(req.query.status || '').trim();

      let sql = `
        SELECT veh.id, veh.plate_number, veh.vehicle_type, veh.make, veh.colour,
               veh.driver_name, veh.status, veh.entered_at, veh.exited_at, veh.created_at,
               o.name AS organisation_name
        FROM vehicles veh
        INNER JOIN organisations o ON o.id = veh.organisation_id
        WHERE 1=1
      `;
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
          OR o.name LIKE ?
        )`;
        const term = `%${search}%`;
        params.push(term, term, term, term);
      }

      sql += ' ORDER BY veh.created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/organisations', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT o.*,
                sub.plan_name, sub.status AS subscription_status,
                (SELECT COUNT(*) FROM sites s WHERE s.organisation_id = o.id) AS site_count,
                (SELECT COUNT(*) FROM user_scopes us WHERE us.organisation_id = o.id) AS user_count
         FROM organisations o
         LEFT JOIN subscriptions sub ON sub.organisation_id = o.id
         ORDER BY o.name ASC`,
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/organisations/:id', async (req, res) => {
    try {
      const { status } = req.body || {};
      if (!status) return res.status(400).json({ ok: false, message: 'Status is required.' });

      await pool.query('UPDATE organisations SET status = ?, updated_at = NOW() WHERE id = ?', [
        status,
        req.params.id,
      ]);
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
      const email = getEmailProviderStatus();
      const sms = getSmsProviderStatus();
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
