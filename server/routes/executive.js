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
import { createAppointmentForVisit, upsertHostContact, upsertVisitorContactDetails } from '../accessSchema.js';

function normalizeNrc(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}/${digits.slice(6)}`;
  return `${digits.slice(0, 6)}/${digits.slice(6, 8)}/${digits.slice(8)}`;
}

function isCompleteNrc(value) {
  return /^\d{6}\/\d{2}\/\d{1}$/.test(normalizeNrc(value));
}

function maskNrc(value) {
  const nrc = normalizeNrc(value);
  if (!isCompleteNrc(nrc)) return null;
  return `${nrc.slice(0, 2)}****/${nrc.slice(7, 9)}/${nrc.slice(10)}`;
}

function normalizePhoneRequired(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 9) return '';
  return String(value || '').trim();
}
import { formatVisitListResponse, formatVisitResponse, applyVisitListMasking, VISIT_JOINS, VISIT_SELECT_FIELDS } from '../visitResponseService.js';
import {
  canAssignVipClassification,
  filterAssignableCategories,
} from '../../shared/visitorPrivacy.js';
import { permissionMatches } from '../../shared/rbacPermissions.js';

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
                vis.id AS visit_id, vis.status AS visit_status, vis.purpose,
                v.full_name AS visitor_name, v.company,
                COALESCE(vc.classification, 'standard') AS classification, vc.name AS category_name
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
            completedThisMonth: await countVisits(
              `AND vis.status IN ('completed', 'checked_out')
               AND vis.updated_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
            ),
          },
          nextAppointment: nextAppointment
            ? applyVisitListMasking([nextAppointment], permissions)[0]
            : null,
          todaySchedule: applyVisitListMasking(todaySchedule, permissions),
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
      const baseParams = [orgId, hostId, userId];
      const permissions = permissionsFromRequest(req);

      const appointmentSelect = `
        SELECT a.id, a.title, a.scheduled_at, a.status,
               vis.id AS visit_id, vis.status AS visit_status, vis.purpose, vis.pass_code,
               v.full_name AS visitor_name, v.company, v.phone, v.email,
               h.name AS host_name,
               s.name AS site_name,
               COALESCE(vc.classification, 'standard') AS classification,
               vc.name AS category_name,
               COALESCE(vc.default_duration_minutes, 60) AS duration_minutes
        FROM appointments a
        INNER JOIN visits vis ON vis.id = a.visit_id
        INNER JOIN visitors v ON v.id = vis.visitor_id
        LEFT JOIN hosts h ON h.id = vis.host_id
        LEFT JOIN sites s ON s.id = vis.site_id
        LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
        WHERE a.organisation_id = ? AND ${hostVisitFilter('vis')}
      `;

      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const isListMode = req.query.tab != null
        || req.query.page != null
        || req.query.search != null
        || req.query.list === '1';

      if (!isListMode) {
        const window = String(req.query.window || 'upcoming').toLowerCase();
        let dateFilter = 'AND a.scheduled_at >= CURDATE()';
        if (window === 'today') dateFilter = 'AND DATE(a.scheduled_at) = CURDATE()';
        if (window === 'past') dateFilter = 'AND a.scheduled_at < NOW()';
        if (from && to) {
          dateFilter = 'AND a.scheduled_at >= ? AND a.scheduled_at < ?';
        }

        const queryParams = [...baseParams];
        if (from && to) {
          queryParams.push(`${from} 00:00:00`, `${to} 00:00:00`);
        }

        const [rows] = await pool.query(
          `${appointmentSelect}
           ${dateFilter}
           ORDER BY a.scheduled_at ASC
           LIMIT 100`,
          queryParams,
        );

        return res.json({ ok: true, data: applyVisitListMasking(rows, permissions) });
      }

      const tab = String(req.query.tab || 'all').toLowerCase();
      const search = String(req.query.search || '').trim().toLowerCase();
      const classification = String(req.query.classification || '').trim().toLowerCase();
      const statusFilter = String(req.query.status || '').trim().toLowerCase();
      const dateRange = String(req.query.range || '').trim().toLowerCase();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize) || 7));

      let filters = '';
      const filterParams = [];

      if (tab === 'awaiting') {
        filters += ` AND vis.status IN ('pending_approval', 'pre_registered')`;
      } else if (tab === 'today') {
        filters += ` AND DATE(a.scheduled_at) = CURDATE()`;
      } else if (tab === 'week') {
        filters += ` AND a.scheduled_at >= CURDATE() AND a.scheduled_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
      } else if (tab === 'month') {
        filters += ` AND YEAR(a.scheduled_at) = YEAR(CURDATE()) AND MONTH(a.scheduled_at) = MONTH(CURDATE())`;
      } else if (tab === 'completed') {
        filters += ` AND vis.status IN ('completed', 'checked_out')`;
      } else if (tab === 'cancelled') {
        filters += ` AND vis.status IN ('cancelled', 'rejected')`;
      }

      if (dateRange === 'today') {
        filters += ` AND DATE(a.scheduled_at) = CURDATE()`;
      } else if (dateRange === 'week') {
        filters += ` AND a.scheduled_at >= CURDATE() AND a.scheduled_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
      } else if (dateRange === 'month') {
        filters += ` AND YEAR(a.scheduled_at) = YEAR(CURDATE()) AND MONTH(a.scheduled_at) = MONTH(CURDATE())`;
      }

      if (classification) {
        filters += ` AND LOWER(COALESCE(vc.classification, 'standard')) = ?`;
        filterParams.push(classification);
      }

      if (statusFilter) {
        filters += ` AND LOWER(vis.status) = ?`;
        filterParams.push(statusFilter);
      }

      if (search) {
        filters += ` AND (
          LOWER(v.full_name) LIKE ?
          OR LOWER(v.company) LIKE ?
          OR LOWER(vis.purpose) LIKE ?
          OR LOWER(a.title) LIKE ?
          OR LOWER(h.name) LIKE ?
          OR LOWER(v.phone) LIKE ?
        )`;
        const like = `%${search}%`;
        filterParams.push(like, like, like, like, like, like);
      }

      const countSql = `
        SELECT COUNT(*) AS count
        FROM appointments a
        INNER JOIN visits vis ON vis.id = a.visit_id
        INNER JOIN visitors v ON v.id = vis.visitor_id
        LEFT JOIN hosts h ON h.id = vis.host_id
        LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
        WHERE a.organisation_id = ? AND ${hostVisitFilter('vis')}
        ${filters}
      `;

      const [[totalRow]] = await pool.query(countSql, [...baseParams, ...filterParams]);
      const total = Number(totalRow?.count || 0);
      const offset = (page - 1) * pageSize;

      const [rows] = await pool.query(
        `${appointmentSelect}
         ${filters}
         ORDER BY a.scheduled_at DESC
         LIMIT ? OFFSET ?`,
        [...baseParams, ...filterParams, pageSize, offset],
      );

      const countByTab = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count
           FROM appointments a
           INNER JOIN visits vis ON vis.id = a.visit_id
           WHERE a.organisation_id = ? AND ${hostVisitFilter('vis')}
           ${extra}`,
          baseParams,
        );
        return Number(row?.count || 0);
      };

      const countVisits = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM visits vis
           WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')} ${extra}`,
          baseParams,
        );
        return Number(row?.count || 0);
      };

      const stats = {
        today: await countByTab('AND DATE(a.scheduled_at) = CURDATE()'),
        week: await countByTab(
          'AND a.scheduled_at >= CURDATE() AND a.scheduled_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
        ),
        awaiting: await countByTab(`AND vis.status IN ('pending_approval', 'pre_registered')`),
        all: await countByTab(''),
        onSiteNow: await countVisits(`AND vis.status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting')`),
        completedThisMonth: await countVisits(
          `AND vis.status IN ('completed', 'checked_out')
           AND vis.updated_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
        ),
      };

      return res.json({
        ok: true,
        data: {
          rows: applyVisitListMasking(rows, permissions),
          total,
          page,
          pageSize,
          stats,
        },
      });
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
      const permissions = permissionsFromRequest(req);
      const [categories] = await pool.query(
        `SELECT id, name, slug, classification, requires_approval, default_duration_minutes
         FROM visitor_categories WHERE organisation_id = ? ORDER BY name`,
        [orgId],
      );
      const [sites] = await pool.query(
        `SELECT id, name, code FROM sites WHERE organisation_id = ? AND status = 'active' ORDER BY name`,
        [orgId],
      );

      const canAssignVip = canAssignVipClassification(permissions);

      return res.json({
        ok: true,
        data: {
          categories: filterAssignableCategories(categories, permissions),
          sites,
          host: ctx.host,
          defaultSiteId: ctx.scope.site_id,
          canAssignVip,
          canCreateAppointments: permissionMatches(permissions, 'executive.appointments'),
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
        idType,
        idNumber,
      } = req.body || {};

      if (!visitorName?.trim()) {
        return res.status(400).json({ ok: false, message: 'Visitor name is required.' });
      }
      const phoneNorm = normalizePhoneRequired(phone);
      if (!phoneNorm) {
        return res.status(400).json({ ok: false, message: 'A valid mobile phone number is required.' });
      }
      const nrc = normalizeNrc(idNumber);
      if (!isCompleteNrc(nrc)) {
        return res.status(400).json({ ok: false, message: 'A complete NRC is required (e.g. 123456/78/9).' });
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
      const [[existing]] = await pool.query(
        `SELECT id FROM visitors WHERE organisation_id = ? AND phone = ? LIMIT 1`,
        [ctx.scope.organisation_id, phoneNorm],
      );
      visitorId = existing?.id || null;

      const maskedNrc = maskNrc(nrc);
      if (!visitorId) {
        visitorId = generateId('vis');
        await pool.query(
          `INSERT INTO visitors (id, organisation_id, full_name, phone, email, company, id_type, id_number_masked)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            visitorId,
            ctx.scope.organisation_id,
            visitorName.trim(),
            phoneNorm,
            email?.trim() || null,
            company?.trim() || null,
            idType || 'nrc',
            maskedNrc,
          ],
        );
      } else {
        await pool.query(
          `UPDATE visitors
           SET full_name = ?,
               email = COALESCE(?, email),
               company = COALESCE(?, company),
               id_type = COALESCE(?, id_type),
               id_number_masked = COALESCE(?, id_number_masked),
               updated_at = NOW()
           WHERE id = ?`,
          [
            visitorName.trim(),
            email?.trim() || null,
            company?.trim() || null,
            idType || 'nrc',
            maskedNrc,
            visitorId,
          ],
        );
      }

      await upsertVisitorContactDetails(pool, visitorId, {
        idType: idType || 'nrc',
        idNumber: nrc,
      });

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
        phone: phoneNorm,
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

      return res.status(201).json({
        ok: true,
        data: applyVisitListMasking([appointment], permissionsFromRequest(req))[0],
      });
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
      const permissions = permissionsFromRequest(req);

      let sql = `
        SELECT hc.id, hc.full_name, hc.email, hc.phone, hc.company, hc.visitor_id, hc.use_count, hc.last_used_at, hc.created_at,
               COALESCE((
                 SELECT LOWER(COALESCE(vc2.classification, 'standard'))
                 FROM visits vis2
                 LEFT JOIN visitor_categories vc2 ON vc2.id = vis2.category_id
                 WHERE vis2.visitor_id = hc.visitor_id AND vis2.host_id = hc.host_id
                 ORDER BY CASE LOWER(COALESCE(vc2.classification, 'standard'))
                   WHEN 'vvip' THEN 3 WHEN 'vip' THEN 2 ELSE 1 END DESC,
                   vis2.created_at DESC
                 LIMIT 1
               ), 'standard') AS classification
        FROM host_contacts hc
        WHERE hc.organisation_id = ? AND hc.host_id = ?
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
      return res.json({ ok: true, data: applyVisitListMasking(rows, permissions) });
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
      const baseParams = [orgId, hostId, userId];
      const permissions = permissionsFromRequest(req);

      const visitSelect = `
        SELECT ${VISIT_SELECT_FIELDS}, s.name AS site_name
        FROM visits vis
        ${VISIT_JOINS}
        LEFT JOIN sites s ON s.id = vis.site_id
        WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')}
      `;

      const isListMode = req.query.tab != null
        || req.query.page != null
        || req.query.search != null
        || req.query.list === '1';

      if (!isListMode) {
        const status = String(req.query.status || '').trim();
        const search = String(req.query.search || '').trim().toLowerCase();

        let extraWhere = '';
        const params = [...baseParams];

        if (status) {
          extraWhere += ' AND vis.status = ?';
          params.push(status);
        }
        if (search) {
          extraWhere += ' AND (LOWER(v.full_name) LIKE ? OR LOWER(v.company) LIKE ? OR LOWER(vis.purpose) LIKE ?)';
          const like = `%${search}%`;
          params.push(like, like, like);
        }

        const [rows] = await pool.query(
          `${visitSelect}${extraWhere} ORDER BY vis.expected_at DESC, vis.created_at DESC LIMIT 200`,
          params,
        );
        const data = await formatVisitListResponse(pool, rows, permissions, {
          actorUserId: userId,
        });

        return res.json({ ok: true, data });
      }

      const tab = String(req.query.tab || 'all').toLowerCase();
      const search = String(req.query.search || '').trim().toLowerCase();
      const classification = String(req.query.classification || req.query.type || '').trim().toLowerCase();
      const statusFilter = String(req.query.status || '').trim().toLowerCase();
      const dateRange = String(req.query.range || '').trim().toLowerCase();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize) || 7));

      let filters = '';
      const filterParams = [];

      if (tab === 'awaiting') {
        filters += ` AND vis.status IN ('pending_approval', 'pre_registered')`;
      } else if (tab === 'today') {
        filters += ` AND DATE(vis.expected_at) = CURDATE()`;
      } else if (tab === 'week') {
        filters += ` AND vis.expected_at >= CURDATE() AND vis.expected_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
      } else if (tab === 'on_site') {
        filters += ` AND vis.status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting')`;
      } else if (tab === 'completed') {
        filters += ` AND vis.status IN ('completed', 'checked_out')`;
      } else if (tab === 'cancelled') {
        filters += ` AND vis.status IN ('cancelled', 'rejected')`;
      }

      if (dateRange === 'today') {
        filters += ` AND DATE(vis.expected_at) = CURDATE()`;
      } else if (dateRange === 'week') {
        filters += ` AND vis.expected_at >= CURDATE() AND vis.expected_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
      } else if (dateRange === 'month') {
        filters += ` AND YEAR(vis.expected_at) = YEAR(CURDATE()) AND MONTH(vis.expected_at) = MONTH(CURDATE())`;
      }

      if (classification) {
        filters += ` AND LOWER(COALESCE(vc.classification, 'standard')) = ?`;
        filterParams.push(classification);
      }

      if (statusFilter) {
        filters += ` AND LOWER(vis.status) = ?`;
        filterParams.push(statusFilter);
      }

      if (search) {
        filters += ` AND (
          LOWER(v.full_name) LIKE ?
          OR LOWER(v.company) LIKE ?
          OR LOWER(vis.purpose) LIKE ?
          OR LOWER(h.name) LIKE ?
          OR LOWER(v.phone) LIKE ?
          OR LOWER(vis.pass_code) LIKE ?
        )`;
        const like = `%${search}%`;
        filterParams.push(like, like, like, like, like, like);
      }

      const countSql = `
        SELECT COUNT(*) AS count
        FROM visits vis
        ${VISIT_JOINS}
        WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')}
        ${filters}
      `;

      const [[totalRow]] = await pool.query(countSql, [...baseParams, ...filterParams]);
      const total = Number(totalRow?.count || 0);
      const offset = (page - 1) * pageSize;

      const [rows] = await pool.query(
        `${visitSelect}
         ${filters}
         ORDER BY COALESCE(vis.expected_at, vis.created_at) DESC
         LIMIT ? OFFSET ?`,
        [...baseParams, ...filterParams, pageSize, offset],
      );

      const formattedRows = await formatVisitListResponse(pool, rows, permissions, {
        actorUserId: userId,
      });

      const countVisits = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM visits vis
           WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')} ${extra}`,
          baseParams,
        );
        return Number(row?.count || 0);
      };

      const stats = {
        today: await countVisits('AND DATE(vis.expected_at) = CURDATE()'),
        week: await countVisits(
          'AND vis.expected_at >= CURDATE() AND vis.expected_at < DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
        ),
        awaiting: await countVisits(`AND vis.status IN ('pending_approval', 'pre_registered')`),
        onSite: await countVisits(`AND vis.status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting')`),
        all: await countVisits(''),
        completedThisMonth: await countVisits(
          `AND vis.status IN ('completed', 'checked_out')
           AND vis.updated_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
        ),
      };

      return res.json({
        ok: true,
        data: {
          rows: formattedRows,
          total,
          page,
          pageSize,
          stats,
        },
      });
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
