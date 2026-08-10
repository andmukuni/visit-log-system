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
import {
  requireHostContext,
  loadVisitForHost,
  hostVisitFilter,
  canTransition,
} from '../scopeService.js';
import { assertCanAssignCategory, permissionsFromRequest } from '../classificationService.js';
import { createAppointmentForVisit, upsertVisitorContactDetails } from '../accessSchema.js';
import { filterAssignableCategories } from '../../shared/visitorPrivacy.js';
import {
  HOST_AVAILABILITY,
  normalizeHostAvailability,
  setHostAvailability,
} from '../hostAvailability.js';

function visitSelectSql(extraWhere = '', orderBy = 'vis.created_at DESC') {
  return `
    SELECT vis.*, v.full_name, v.phone, v.email, v.company,
           vc.name AS category_name, h.name AS host_name
    FROM visits vis
    INNER JOIN visitors v ON v.id = vis.visitor_id
    LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
    LEFT JOIN hosts h ON h.id = vis.host_id
    WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')}
    ${extraWhere}
    ORDER BY ${orderBy}
    LIMIT 200
  `;
}

export function createHostRouter() {
  const router = express.Router();

  async function getHostContext(req) {
    const userId = req.adminClaims?.sub;
    const userEmail = req.adminClaims?.email || '';
    return requireHostContext(pool, userId, userEmail, req.adminClaims);
  }

  router.get('/dashboard', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const orgId = ctx.scope.organisation_id;
      const hostId = ctx.host?.id;
      const userId = req.adminClaims.sub;
      const baseParams = [orgId, hostId, userId];

      const countFor = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM visits vis
           WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')} ${extra}`,
          baseParams,
        );
        return Number(row?.count || 0);
      };

      const [recentActivity] = await pool.query(
        `SELECT ve.id, ve.event_type, ve.created_at, v.full_name AS visitor_name, vis.status AS visit_status
         FROM visit_events ve
         INNER JOIN visits vis ON vis.id = ve.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         WHERE vis.organisation_id = ? AND ${hostVisitFilter('vis')}
         ORDER BY ve.created_at DESC
         LIMIT 8`,
        baseParams,
      );

      res.json({
        ok: true,
        data: {
          pendingApprovals: await countFor(`AND vis.status IN ('pending_approval', 'pre_registered')`),
          approvedToday: await countFor(`AND vis.status = 'approved'`),
          onSite: await countFor(`AND vis.status = 'checked_in'`),
          completed: await countFor(`AND vis.status IN ('completed', 'checked_out')`),
          host: ctx.host
            ? {
              id: ctx.host.id,
              name: ctx.host.name,
              email: ctx.host.email,
              availability: normalizeHostAvailability(ctx.host.availability),
            }
            : null,
          recentActivity,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/availability', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.host?.id) {
        return res.status(400).json({ ok: false, message: 'No host profile linked to this account.' });
      }

      const next = normalizeHostAvailability(req.body?.availability);
      await setHostAvailability(pool, ctx.host.id, next);
      res.json({
        ok: true,
        message: next === HOST_AVAILABILITY.available
          ? 'You are marked available.'
          : 'You are marked not available.',
        data: { id: ctx.host.id, availability: next },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/reference-data', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
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

      res.json({
        ok: true,
        data: {
          categories: filterAssignableCategories(categories, permissions),
          sites,
          host: ctx.host,
          defaultSiteId: ctx.scope.site_id,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/visitors', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { status, search } = req.query;
      let extra = '';
      const params = [ctx.scope.organisation_id, ctx.host.id, req.adminClaims.sub];

      if (status) {
        extra += ' AND vis.status = ?';
        params.push(status);
      }
      if (search) {
        extra += ' AND (v.full_name LIKE ? OR v.phone LIKE ? OR v.company LIKE ?)';
        const q = `%${search}%`;
        params.push(q, q, q);
      }

      const [rows] = await pool.query(visitSelectSql(extra), params);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/approvals', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const [rows] = await pool.query(
        visitSelectSql(`AND vis.status IN ('pending_approval', 'pre_registered')`, 'vis.created_at ASC'),
        [ctx.scope.organisation_id, ctx.host.id, req.adminClaims.sub],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/on-site', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const [rows] = await pool.query(
        visitSelectSql(`AND vis.status = 'checked_in'`, 'vis.checked_in_at DESC'),
        [ctx.scope.organisation_id, ctx.host.id, req.adminClaims.sub],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/visits/:id', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const loaded = await loadVisitForHost(pool, req.params.id, {
        host: ctx.host,
        userId: req.adminClaims.sub,
        elevated: ctx.elevated,
        scope: ctx.scope,
      });
      if (!loaded.ok) return res.status(loaded.status).json({ ok: false, message: loaded.message });

      const [[visit]] = await pool.query(
        `SELECT vis.*, v.full_name, v.phone, v.email, v.company, vc.name AS category_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE vis.id = ?`,
        [req.params.id],
      );

      const [events] = await pool.query(
        `SELECT ve.*, u.name AS actor_name FROM visit_events ve
         LEFT JOIN users u ON u.id = ve.actor_user_id
         WHERE ve.visit_id = ? ORDER BY ve.created_at ASC`,
        [req.params.id],
      );

      const [approvals] = await pool.query(
        `SELECT va.*, u.name AS approver_name FROM visit_approvals va
         LEFT JOIN users u ON u.id = va.approver_user_id
         WHERE va.visit_id = ? ORDER BY va.created_at ASC`,
        [req.params.id],
      );

      res.json({ ok: true, data: { visit, events, approvals } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/invite', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const userId = req.adminClaims.sub;
      const {
        fullName,
        phone,
        email,
        company,
        categoryId,
        purpose,
        expectedAt,
        siteId,
        idType,
        idNumber,
        confidentialNotes,
        expectedVehiclePlate,
        expectedVehicleDriver,
      } = req.body;

      if (!fullName?.trim()) {
        return res.status(400).json({ ok: false, message: 'Visitor name is required.' });
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
        return res.status(400).json({ ok: false, message: 'Site is required for the invitation.' });
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
            fullName.trim(),
            phone?.trim() || null,
            email?.trim() || null,
            company?.trim() || null,
          ],
        );
      }

      let status = 'pre_registered';
      if (categoryId) {
        const [[cat]] = await pool.query(
          `SELECT requires_approval FROM visitor_categories WHERE id = ? AND organisation_id = ?`,
          [categoryId, ctx.scope.organisation_id],
        );
        if (cat?.requires_approval) status = 'pending_approval';
        else status = expectedAt ? 'expected' : 'approved';
      } else {
        status = 'pending_approval';
      }

      const visitId = generateId('visit');
      const passCode = generatePassCode();
      const inviteToken = generateInviteToken();

      await upsertVisitorContactDetails(pool, visitorId, {
        idType,
        idNumber,
        confidentialNotes,
      });

      await pool.query(
        `INSERT INTO visits (id, organisation_id, site_id, visitor_id, host_id, category_id, purpose, status, expected_at, pass_code, invite_token, created_by, confidential_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visitId,
          ctx.scope.organisation_id,
          resolvedSiteId,
          visitorId,
          ctx.host.id,
          categoryId || null,
          purpose?.trim() || null,
          status,
          expectedAt || null,
          passCode,
          inviteToken,
          userId,
          confidentialNotes?.trim() || null,
        ],
      );

      await createAppointmentForVisit(pool, {
        organisationId: ctx.scope.organisation_id,
        visitId,
        hostId: ctx.host.id,
        scheduledAt: expectedAt || null,
        title: `Appointment: ${fullName.trim()}`,
        createdBy: userId,
      });

      if (expectedVehiclePlate?.trim()) {
        await pool.query(
          `INSERT INTO expected_vehicles (id, organisation_id, visit_id, plate_number, driver_name, status)
           VALUES (?, ?, ?, ?, ?, 'expected')`,
          [
            generateId('ev'),
            ctx.scope.organisation_id,
            visitId,
            expectedVehiclePlate.trim().toUpperCase(),
            expectedVehicleDriver?.trim() || null,
          ],
        );
      }

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'pre_registered',
        actorUserId: userId,
        details: { status, source: 'host_invite' },
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'pre_registered', actorUserId: userId });

      await writeAuditLog(pool, {
        organisationId: ctx.scope.organisation_id,
        actorUserId: userId,
        action: 'host.invite',
        targetType: 'visit',
        targetId: visitId,
      });

      const [[visit]] = await pool.query(
        `SELECT vis.*, v.full_name, v.phone FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id WHERE vis.id = ?`,
        [visitId],
      );

      res.status(201).json({
        ok: true,
        data: {
          ...visit,
          inviteUrl: `/visit/invite/${inviteToken}`,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/visits/:id/approve', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const userId = req.adminClaims.sub;
      const { reason } = req.body;
      const visitId = req.params.id;

      const loaded = await loadVisitForHost(pool, visitId, {
        host: ctx.host,
        userId,
        elevated: ctx.elevated,
        scope: ctx.scope,
      });
      if (!loaded.ok) return res.status(loaded.status).json({ ok: false, message: loaded.message });

      const visit = loaded.visit;
      const nextStatus = visit.expected_at ? 'expected' : 'approved';
      if (!canTransition(visit.status, nextStatus) && !canTransition(visit.status, 'approved')) {
        return res.status(400).json({ ok: false, message: 'Visit is not pending approval.' });
      }

      await pool.query(
        `UPDATE visits SET status = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [nextStatus, visitId],
      );

      await pool.query(
        `INSERT INTO visit_approvals (id, visit_id, approver_user_id, decision, reason) VALUES (?, ?, ?, 'approved', ?)`,
        [generateId('appr'), visitId, userId, reason || null],
      );

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'approved',
        actorUserId: userId,
        reason: reason || null,
        details: { approverRole: 'host' },
      });

      await writeAuditLog(pool, {
        organisationId: visit.organisation_id,
        actorUserId: userId,
        action: 'host.approve',
        targetType: 'visit',
        targetId: visitId,
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'approved', actorUserId: userId });

      res.json({ ok: true, message: 'Visit approved.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/visits/:id/reject', async (req, res) => {
    try {
      const ctx = await getHostContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const userId = req.adminClaims.sub;
      const { reason } = req.body;
      if (!reason?.trim()) {
        return res.status(400).json({ ok: false, message: 'Rejection reason is required.' });
      }

      const visitId = req.params.id;
      const loaded = await loadVisitForHost(pool, visitId, {
        host: ctx.host,
        userId,
        elevated: ctx.elevated,
        scope: ctx.scope,
      });
      if (!loaded.ok) return res.status(loaded.status).json({ ok: false, message: loaded.message });

      const visit = loaded.visit;
      if (!canTransition(visit.status, 'rejected')) {
        return res.status(400).json({ ok: false, message: 'Visit cannot be rejected in its current status.' });
      }

      await pool.query(`UPDATE visits SET status = 'rejected', updated_at = NOW() WHERE id = ?`, [visitId]);
      await pool.query(
        `INSERT INTO visit_approvals (id, visit_id, approver_user_id, decision, reason) VALUES (?, ?, ?, 'rejected', ?)`,
        [generateId('appr'), visitId, userId, reason.trim()],
      );
      await writeVisitEvent(pool, {
        visitId,
        eventType: 'rejected',
        actorUserId: userId,
        reason: reason.trim(),
        details: { approverRole: 'host' },
      });

      await writeAuditLog(pool, {
        organisationId: visit.organisation_id,
        actorUserId: userId,
        action: 'host.reject',
        targetType: 'visit',
        targetId: visitId,
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'rejected', actorUserId: userId });

      res.json({ ok: true, message: 'Visit rejected.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
