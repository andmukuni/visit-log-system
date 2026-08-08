import express from 'express';
import pool from '../db.js';
import { requireHostContext, hostVisitFilter } from '../scopeService.js';
import { permissionsFromRequest } from '../classificationService.js';
import { formatVisitListResponse, formatVisitResponse, VISIT_JOINS, VISIT_SELECT_FIELDS } from '../visitResponseService.js';

function executiveVisitSql(extraWhere = '', orderBy = 'vis.expected_at ASC, vis.created_at DESC') {
  return `
    SELECT ${VISIT_SELECT_FIELDS}
    FROM visits vis
    ${VISIT_JOINS}
    WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')}
    ${extraWhere}
    ORDER BY ${orderBy}
    LIMIT 200
  `;
}

export function createExecutiveRouter() {
  const router = express.Router();

  async function getExecutiveContext(req) {
    const userId = req.adminClaims?.sub;
    const userEmail = req.adminClaims?.email || '';
    return requireHostContext(pool, userId, userEmail, req.adminClaims);
  }

  router.get('/dashboard', async (req, res) => {
    try {
      const ctx = await getExecutiveContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const orgId = ctx.scope.organisation_id;
      const hostId = ctx.host?.id;
      const userId = req.adminClaims.sub;
      const baseParams = [orgId, hostId, userId];

      const countVisits = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM visits vis
           WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')} ${extra}`,
          baseParams,
        );
        return Number(row?.count || 0);
      };

      const countAppointments = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count
           FROM appointments a
           INNER JOIN visits vis ON vis.id = a.visit_id
           WHERE a.organisation_id = ? AND ${hostVisitFilter('vis')} ${extra}`,
          baseParams,
        );
        return Number(row?.count || 0);
      };

      const [todaySchedule] = await pool.query(
        `SELECT a.id AS appointment_id, a.title, a.scheduled_at, a.status AS appointment_status,
                vis.id AS visit_id, vis.status AS visit_status, vis.purpose,
                v.full_name AS visitor_name, v.company, v.phone,
                COALESCE(vc.classification, 'standard') AS classification, vc.name AS category_name
         FROM appointments a
         INNER JOIN visits vis ON vis.id = a.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE a.organisation_id = ? AND ${hostVisitFilter('vis')}
           AND DATE(a.scheduled_at) = CURDATE()
         ORDER BY a.scheduled_at ASC
         LIMIT 12`,
        baseParams,
      );

      const [[nextAppointment]] = await pool.query(
        `SELECT a.id AS appointment_id, a.title, a.scheduled_at, a.status AS appointment_status,
                vis.id AS visit_id, vis.status AS visit_status,
                v.full_name AS visitor_name, v.company,
                COALESCE(vc.classification, 'standard') AS classification
         FROM appointments a
         INNER JOIN visits vis ON vis.id = a.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE a.organisation_id = ? AND ${hostVisitFilter('vis')}
           AND a.scheduled_at >= NOW()
           AND vis.status NOT IN ('cancelled', 'checked_out', 'completed', 'rejected')
         ORDER BY a.scheduled_at ASC
         LIMIT 1`,
        baseParams,
      );

      const [recentVisitors] = await pool.query(
        `SELECT vis.id, vis.status, vis.expected_at, vis.checked_in_at, v.full_name, v.company,
                COALESCE(vc.classification, 'standard') AS classification
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')}
         ORDER BY COALESCE(vis.expected_at, vis.created_at) DESC
         LIMIT 6`,
        baseParams,
      );

      const permissions = permissionsFromRequest(req);
      const [[roleRow]] = await pool.query(
        `SELECT ar.slug FROM user_admin_roles uar
         INNER JOIN admin_roles ar ON ar.id = uar.role_id
         WHERE uar.user_id = ? AND ar.slug IN ('ceo', 'dceo')
         LIMIT 1`,
        [userId],
      );
      const roleSlug = String(roleRow?.slug || '').toLowerCase();

      res.json({
        ok: true,
        data: {
          executive: {
            name: ctx.host?.name || req.adminClaims?.name || 'Executive',
            email: ctx.host?.email || req.adminClaims?.email || '',
            title: roleSlug === 'ceo' ? 'CEO' : roleSlug === 'dceo' ? 'DCEO' : 'Executive',
          },
          kpis: {
            todayAppointments: todaySchedule.length,
            weekAppointments: await countAppointments(
              'AND a.scheduled_at >= CURDATE() AND a.scheduled_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
            ),
            onSiteNow: await countVisits(`AND vis.status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting')`),
            pendingApprovals: await countVisits(`AND vis.status IN ('pending_approval', 'pre_registered')`),
            vipToday: todaySchedule.filter((row) => ['vip', 'vvip'].includes(String(row.classification || '').toLowerCase())).length,
            completedThisWeek: await countVisits(
              `AND vis.status IN ('completed', 'checked_out')
               AND vis.updated_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`,
            ),
          },
          nextAppointment: nextAppointment || null,
          todaySchedule,
          recentVisitors,
          permissions,
        },
      });
    } catch (error) {
      console.error('[executive/dashboard]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to load executive dashboard.' });
    }
  });

  router.get('/appointments', async (req, res) => {
    try {
      const ctx = await getExecutiveContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const orgId = ctx.scope.organisation_id;
      const hostId = ctx.host?.id;
      const userId = req.adminClaims.sub;
      const window = String(req.query.window || 'upcoming').toLowerCase();

      let dateFilter = 'AND a.scheduled_at >= CURDATE()';
      if (window === 'today') dateFilter = 'AND DATE(a.scheduled_at) = CURDATE()';
      if (window === 'past') dateFilter = 'AND a.scheduled_at < NOW()';

      const [rows] = await pool.query(
        `SELECT a.id, a.title, a.scheduled_at, a.status,
                vis.id AS visit_id, vis.status AS visit_status, vis.purpose, vis.pass_code,
                v.full_name AS visitor_name, v.company, v.phone,
                COALESCE(vc.classification, 'standard') AS classification, vc.name AS category_name
         FROM appointments a
         INNER JOIN visits vis ON vis.id = a.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE a.organisation_id = ? AND ${hostVisitFilter('vis')}
         ${dateFilter}
         ORDER BY a.scheduled_at ASC
         LIMIT 100`,
        [orgId, hostId, userId],
      );

      return res.json({ ok: true, data: rows });
    } catch (error) {
      console.error('[executive/appointments]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to load appointments.' });
    }
  });

  router.get('/visits', async (req, res) => {
    try {
      const ctx = await getExecutiveContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const orgId = ctx.scope.organisation_id;
      const hostId = ctx.host?.id;
      const userId = req.adminClaims.sub;
      const status = String(req.query.status || '').trim();
      const search = String(req.query.search || '').trim().toLowerCase();

      let extraWhere = '';
      const params = [orgId, hostId, userId];

      if (status) {
        extraWhere += ' AND vis.status = ?';
        params.push(status);
      }
      if (search) {
        extraWhere += ' AND (LOWER(v.full_name) LIKE ? OR LOWER(v.company) LIKE ? OR LOWER(vis.purpose) LIKE ?)';
        const like = `%${search}%`;
        params.push(like, like, like);
      }

      const [rows] = await pool.query(executiveVisitSql(extraWhere), params);
      const permissions = permissionsFromRequest(req);
      const data = await formatVisitListResponse(pool, rows, permissions, {
        actorUserId: userId,
      });

      return res.json({ ok: true, data });
    } catch (error) {
      console.error('[executive/visits]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to load visits.' });
    }
  });

  router.get('/visits/:id', async (req, res) => {
    try {
      const ctx = await getExecutiveContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const orgId = ctx.scope.organisation_id;
      const hostId = ctx.host?.id;
      const userId = req.adminClaims.sub;

      const [[row]] = await pool.query(
        `${executiveVisitSql(' AND vis.id = ?', 'vis.created_at DESC').replace('LIMIT 200', 'LIMIT 1')}`,
        [orgId, hostId, userId, req.params.id],
      );

      if (!row) {
        return res.status(404).json({ ok: false, message: 'Visit not found.' });
      }

      const permissions = permissionsFromRequest(req);
      const visit = await formatVisitResponse(pool, row, permissions, { actorUserId: userId });

      const [events] = await pool.query(
        `SELECT ve.*, u.name AS actor_name FROM visit_events ve
         LEFT JOIN users u ON u.id = ve.actor_user_id
         WHERE ve.visit_id = ? ORDER BY ve.created_at ASC`,
        [req.params.id],
      );

      return res.json({ ok: true, data: { visit, events } });
    } catch (error) {
      console.error('[executive/visits/:id]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to load visit.' });
    }
  });

  return router;
}
