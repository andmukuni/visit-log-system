import express from 'express';
import pool from '../db.js';
import { generateId } from '../visitorSchema.js';
import {
  writeAuditLog,
  writeVisitEvent,
  generatePassCode,
} from '../auditService.js';
import { generateInviteToken } from '../platformSchema.js';
import { notifyVisitEvent } from '../notificationService.js';
import { requireHostContext, hostVisitFilter } from '../scopeService.js';
import { assertCanAssignCategory, permissionsFromRequest } from '../classificationService.js';
import { createAppointmentForVisit, upsertHostContact } from '../accessSchema.js';
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

      if (!hostId) {
        return res.status(403).json({
          ok: false,
          message: 'No host profile is linked to this account. Contact your administrator.',
        });
      }

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
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();

      let dateFilter = 'AND a.scheduled_at >= CURDATE()';
      if (window === 'today') dateFilter = 'AND DATE(a.scheduled_at) = CURDATE()';
      if (window === 'past') dateFilter = 'AND a.scheduled_at < NOW()';
      if (from && to) {
        dateFilter = 'AND a.scheduled_at >= ? AND a.scheduled_at < ?';
      }

      const queryParams = [orgId, hostId, userId];
      if (from && to) {
        queryParams.push(`${from} 00:00:00`, `${to} 00:00:00`);
      }

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
        queryParams,
      );

      return res.json({ ok: true, data: rows });
    } catch (error) {
      console.error('[executive/appointments]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to load appointments.' });
    }
  });

  router.get('/reference-data', async (req, res) => {
    try {
      const ctx = await getExecutiveContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const orgId = ctx.scope.organisation_id;
      const [categories] = await pool.query(
        `SELECT id, name, slug, requires_approval, default_duration_minutes
         FROM visitor_categories WHERE organisation_id = ? ORDER BY name`,
        [orgId],
      );
      const [sites] = await pool.query(
        `SELECT id, name, code FROM sites WHERE organisation_id = ? AND status = 'active' ORDER BY name`,
        [orgId],
      );

      return res.json({
        ok: true,
        data: {
          categories,
          sites,
          host: ctx.host,
          defaultSiteId: ctx.scope.site_id,
        },
      });
    } catch (error) {
      console.error('[executive/reference-data]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to load reference data.' });
    }
  });

  router.post('/appointments', async (req, res) => {
    try {
      const ctx = await getExecutiveContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const userId = req.adminClaims.sub;
      const {
        title,
        visitorName,
        phone,
        email,
        company,
        categoryId,
        purpose,
        scheduledAt,
        siteId,
      } = req.body || {};

      if (!visitorName?.trim()) {
        return res.status(400).json({ ok: false, message: 'Visitor name is required.' });
      }
      if (!scheduledAt) {
        return res.status(400).json({ ok: false, message: 'Appointment time is required.' });
      }

      const scheduledDate = new Date(scheduledAt);
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid appointment time.' });
      }
      if (scheduledDate.getTime() < Date.now()) {
        return res.status(400).json({ ok: false, message: 'Appointments cannot be scheduled in the past.' });
      }

      if (categoryId) {
        const classCheck = await assertCanAssignCategory(pool, {
          categoryId,
          organisationId: ctx.scope.organisation_id,
          permissions: permissionsFromRequest(req),
        });
        if (!classCheck.ok) {
          return res.status(classCheck.status).json({ ok: false, message: classCheck.message });
        }
      }

      const resolvedSiteId = siteId || ctx.scope.site_id;
      if (!resolvedSiteId) {
        return res.status(400).json({ ok: false, message: 'Location is required for the appointment.' });
      }

      const [[site]] = await pool.query(
        `SELECT id FROM sites WHERE id = ? AND organisation_id = ?`,
        [resolvedSiteId, ctx.scope.organisation_id],
      );
      if (!site) {
        return res.status(400).json({ ok: false, message: 'Invalid site for this organisation.' });
      }

      let visitorId = null;
      if (phone) {
        const [[existing]] = await pool.query(
          `SELECT id FROM visitors WHERE organisation_id = ? AND phone = ? LIMIT 1`,
          [ctx.scope.organisation_id, phone.trim()],
        );
        visitorId = existing?.id;
      }

      if (!visitorId) {
        visitorId = generateId('vis');
        await pool.query(
          `INSERT INTO visitors (id, organisation_id, full_name, phone, email, company)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            visitorId,
            ctx.scope.organisation_id,
            visitorName.trim(),
            phone?.trim() || null,
            email?.trim() || null,
            company?.trim() || null,
          ],
        );
      }

      // Executive self-scheduling is host-approved; reception/secretary bookings use other routes.
      const status = 'expected';

      const visitId = generateId('visit');
      const passCode = generatePassCode();
      const inviteToken = generateInviteToken();
      const meetingTitle = title?.trim() || purpose?.trim() || `Meeting with ${visitorName.trim()}`;

      await pool.query(
        `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, category_id, purpose, status, expected_at, pass_code, invite_token, created_by, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          visitId,
          ctx.scope.organisation_id,
          resolvedSiteId,
          visitorId,
          ctx.host.id,
          categoryId || null,
          purpose?.trim() || meetingTitle,
          status,
          scheduledAt,
          passCode,
          inviteToken,
          userId,
        ],
      );

      const appointmentId = await createAppointmentForVisit(pool, {
        organisationId: ctx.scope.organisation_id,
        visitId,
        hostId: ctx.host.id,
        scheduledAt,
        title: meetingTitle,
        createdBy: userId,
      });

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'pre_registered',
        actorUserId: userId,
        details: { status, source: 'executive_calendar' },
      });

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'approved',
        actorUserId: userId,
        details: { status, source: 'executive_calendar', selfApproved: true },
      });
      await notifyVisitEvent(pool, { visitId, eventType: 'approved', actorUserId: userId });

      await writeAuditLog(pool, {
        organisationId: ctx.scope.organisation_id,
        actorUserId: userId,
        action: 'executive.appointment.create',
        targetType: 'appointment',
        targetId: appointmentId,
      });

      await upsertHostContact(pool, {
        organisationId: ctx.scope.organisation_id,
        hostId: ctx.host.id,
        visitorId,
        fullName: visitorName,
        email,
        phone,
        company,
      });

      const [[appointment]] = await pool.query(
        `SELECT a.id, a.title, a.scheduled_at, a.status,
                vis.id AS visit_id, vis.status AS visit_status, vis.purpose,
                v.full_name AS visitor_name, v.company, v.phone,
                COALESCE(vc.classification, 'standard') AS classification
         FROM appointments a
         INNER JOIN visits vis ON vis.id = a.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE a.id = ?`,
        [appointmentId],
      );

      return res.status(201).json({ ok: true, data: appointment });
    } catch (error) {
      console.error('[executive/appointments POST]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to create appointment.' });
    }
  });

  router.get('/contacts', async (req, res) => {
    try {
      const ctx = await getExecutiveContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const hostId = ctx.host?.id;
      if (!hostId) {
        return res.status(403).json({
          ok: false,
          message: 'No host profile is linked to this account. Contact your administrator.',
        });
      }

      const orgId = ctx.scope.organisation_id;
      const search = String(req.query.q || req.query.search || '').trim().toLowerCase();
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));

      let sql = `
        SELECT id, full_name, email, phone, company, visitor_id, use_count, last_used_at, created_at
        FROM host_contacts
        WHERE organisation_id = ? AND host_id = ?
      `;
      const params = [orgId, hostId];

      if (search) {
        sql += ` AND (
          LOWER(full_name) LIKE ?
          OR LOWER(company) LIKE ?
          OR LOWER(COALESCE(email, '')) LIKE ?
          OR COALESCE(phone, '') LIKE ?
        )`;
        const like = `%${search}%`;
        params.push(like, like, like, `%${String(req.query.q || req.query.search || '').trim()}%`);
      }

      sql += ` ORDER BY last_used_at DESC, use_count DESC, full_name ASC LIMIT ?`;
      params.push(limit);

      const [rows] = await pool.query(sql, params);
      return res.json({ ok: true, data: rows });
    } catch (error) {
      console.error('[executive/contacts]', error.message);
      return res.status(500).json({ ok: false, message: 'Unable to load contacts.' });
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
