import express from 'express';
import pool from '../db.js';
import { generateId } from '../visitorSchema.js';
import { getUserScope, writeAuditLog, writeVisitEvent, generatePassCode } from '../auditService.js';
import {
  requireUserScope,
  loadVisitScoped,
  canTransition,
} from '../scopeService.js';
import { findWatchlistMatches } from '../watchlistService.js';
import { notifyVisitEvent } from '../notificationService.js';
import { VISIT_SELECT_FIELDS, VISIT_JOINS, applyVisitListMasking, formatVisitResponse } from '../visitResponseService.js';
import { assertCanAssignCategory, permissionsFromRequest } from '../classificationService.js';
import {
  createAppointmentForVisit,
  upsertVisitorContactDetails,
  canTransitionVehicle,
} from '../accessSchema.js';
import { fetchVisitsTodayYesterday, fetchWeeklyVisits, fetchWeeklyWalkingVisits, fetchWeeklyDriveInVisits, buildWeeklyTrend } from '../dashboardStats.js';

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function createStationRouter() {
  const router = express.Router();

  router.get('/dashboard', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const siteId = scope?.site_id;

      if (!orgId) {
        return res.json({
          ok: true,
          data: {
            visitorsToday: 0,
            vehiclesToday: 0,
            currentlyInside: 0,
            pendingApprovals: 0,
            overdueVisits: 0,
            recentActivity: [],
            scope: null,
          },
        });
      }

      const start = todayStart();
      const params = [orgId];
      let siteFilter = '';
      if (siteId) {
        siteFilter = ' AND site_id = ?';
        params.push(siteId);
      }

      const [[visitorsToday]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ?${siteFilter} AND created_at >= ?`,
        [...params, start],
      );

      const [[vehiclesToday]] = await pool.query(
        `SELECT COUNT(*) AS count FROM vehicles WHERE organisation_id = ? AND created_at >= ?`,
        [orgId, start],
      );

      const [[currentlyInside]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ?${siteFilter} AND status = 'checked_in'`,
        params,
      );

      const [[pendingApprovals]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ?${siteFilter} AND status IN ('pending_approval', 'pre_registered')`,
        params,
      );

      const [[overdueVisits]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ?${siteFilter} AND status = 'overdue'`,
        params,
      );

      const [[deniedRejected]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ?${siteFilter} AND status IN ('rejected', 'denied') AND created_at >= ?`,
        [...params, start],
      );

      const [recentActivity] = await pool.query(
        `SELECT ve.id, ve.event_type, ve.created_at, v.full_name AS visitor_name, vis.status AS visit_status
         FROM visit_events ve
         INNER JOIN visits vis ON vis.id = ve.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         WHERE vis.organisation_id = ?${siteFilter.replace('site_id', 'vis.site_id')}
         ORDER BY ve.created_at DESC
         LIMIT 10`,
        params,
      );

      res.json({
        ok: true,
        data: {
          visitorsToday: Number(visitorsToday?.count || 0),
          vehiclesToday: Number(vehiclesToday?.count || 0),
          currentlyInside: Number(currentlyInside?.count || 0),
          pendingApprovals: Number(pendingApprovals?.count || 0),
          overdueVisits: Number(overdueVisits?.count || 0),
          deniedRejected: Number(deniedRejected?.count || 0),
          recentActivity,
          scope: {
            organisationId: orgId,
            organisationName: scope.organisation_name,
            siteId: scope.site_id,
            siteName: scope.site_name,
            stationId: scope.station_id,
            stationName: scope.station_name,
          },
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/occupancy', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const params = [scope.organisation_id];
      let siteFilter = '';
      if (scope.site_id) {
        siteFilter = ' AND vis.site_id = ?';
        params.push(scope.site_id);
      }

      const [rows] = await pool.query(
        `SELECT vis.id, vis.status, vis.checked_in_at, vis.badge_number, vis.pass_code,
                v.full_name, v.phone, v.company, h.name AS host_name, vc.name AS category_name,
                COALESCE(vc.classification, 'standard') AS classification
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE vis.organisation_id = ?${siteFilter}
           AND vis.status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting')
         ORDER BY vis.checked_in_at DESC`,
        params,
      );

      const perms = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, perms) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/reference-data', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: { hosts: [], categories: [], badges: [] } });
      }

      const orgId = scope.organisation_id;
      const [hosts] = await pool.query(
        `SELECT id, name, email, department_id FROM hosts WHERE organisation_id = ? AND status = 'active' ORDER BY name`,
        [orgId],
      );
      const [categories] = await pool.query(
        `SELECT id, name, slug, requires_approval, default_duration_minutes, classification
         FROM visitor_categories WHERE organisation_id = ? ORDER BY name`,
        [orgId],
      );
      const [badges] = await pool.query(
        `SELECT id, badge_number, status FROM badges WHERE organisation_id = ? AND status = 'available' ORDER BY badge_number`,
        [orgId],
      );

      res.json({
        ok: true,
        data: {
          scope,
          hosts,
          categories,
          badges,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}

export function createVisitsRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const { status, search, date } = req.query;
      const params = [scope.organisation_id];
      let where = 'vis.organisation_id = ?';

      if (scope.site_id) {
        where += ' AND vis.site_id = ?';
        params.push(scope.site_id);
      }
      if (status) {
        where += ' AND vis.status = ?';
        params.push(status);
      }
      if (date) {
        where += ' AND DATE(vis.created_at) = ?';
        params.push(date);
      }
      if (search) {
        where += ' AND (v.full_name LIKE ? OR v.phone LIKE ? OR v.company LIKE ? OR h.name LIKE ? OR vis.badge_number LIKE ?)';
        const q = `%${search}%`;
        params.push(q, q, q, q, q);
      }

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS}
         FROM visits vis ${VISIT_JOINS}
         WHERE ${where}
         ORDER BY vis.created_at DESC
         LIMIT 200`,
        params,
      );

      const perms = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, perms) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id || !scope?.site_id) {
        return res.status(400).json({ ok: false, message: 'User scope not configured.' });
      }

      const {
        fullName,
        phone,
        email,
        company,
        hostId,
        categoryId,
        purpose,
        expectedAt,
        idType,
        idNumber,
        confidentialNotes,
        expectedVehiclePlate,
        expectedVehicleDriver,
      } = req.body;

      if (!fullName?.trim()) {
        return res.status(400).json({ ok: false, message: 'Visitor name is required.' });
      }

      const perms = permissionsFromRequest(req);
      if (categoryId) {
        const classCheck = await assertCanAssignCategory(pool, {
          categoryId,
          organisationId: scope.organisation_id,
          permissions: perms,
        });
        if (!classCheck.ok) {
          return res.status(classCheck.status).json({ ok: false, message: classCheck.message });
        }
      }

      let visitorId = null;
      if (phone) {
        const [[existing]] = await pool.query(
          `SELECT id FROM visitors WHERE organisation_id = ? AND phone = ? LIMIT 1`,
          [scope.organisation_id, phone.trim()],
        );
        visitorId = existing?.id;
      }

      if (!visitorId) {
        visitorId = generateId('vis');
        await pool.query(
          `INSERT INTO visitors (id, organisation_id, full_name, phone, email, company)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [visitorId, scope.organisation_id, fullName.trim(), phone?.trim() || null, email?.trim() || null, company?.trim() || null],
        );
      } else {
        await pool.query(
          `UPDATE visitors SET full_name = ?, email = COALESCE(?, email), company = COALESCE(?, company), updated_at = NOW()
           WHERE id = ?`,
          [fullName.trim(), email?.trim() || null, company?.trim() || null, visitorId],
        );
      }

      await upsertVisitorContactDetails(pool, visitorId, {
        idType,
        idNumber,
        confidentialNotes,
      });

      let initialStatus = 'pending_approval';
      if (categoryId) {
        const [[cat]] = await pool.query(
          `SELECT requires_approval FROM visitor_categories WHERE id = ?`,
          [categoryId],
        );
        if (cat && !cat.requires_approval) initialStatus = expectedAt ? 'expected' : 'approved';
      }

      const visitId = generateId('visit');
      const passCode = generatePassCode();

      await pool.query(
        `INSERT INTO visits (id, organisation_id, site_id, station_id, visitor_id, host_id, category_id, purpose, status, expected_at, pass_code, created_by, confidential_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visitId,
          scope.organisation_id,
          scope.site_id,
          scope.station_id,
          visitorId,
          hostId || null,
          categoryId || null,
          purpose?.trim() || null,
          initialStatus,
          expectedAt || null,
          passCode,
          userId,
          confidentialNotes?.trim() || null,
        ],
      );

      await createAppointmentForVisit(pool, {
        organisationId: scope.organisation_id,
        visitId,
        hostId: hostId || null,
        scheduledAt: expectedAt || null,
        title: `Visit: ${fullName.trim()}`,
        createdBy: userId,
      });

      if (expectedVehiclePlate?.trim()) {
        await pool.query(
          `INSERT INTO expected_vehicles (id, organisation_id, visit_id, plate_number, driver_name, status)
           VALUES (?, ?, ?, ?, ?, 'expected')`,
          [
            generateId('ev'),
            scope.organisation_id,
            visitId,
            expectedVehiclePlate.trim().toUpperCase(),
            expectedVehicleDriver?.trim() || null,
          ],
        );
      }

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'registered',
        actorUserId: userId,
        stationId: scope.station_id,
        details: { status: initialStatus },
      });

      await writeAuditLog(pool, {
        organisationId: scope.organisation_id,
        actorUserId: userId,
        action: 'visit.register',
        targetType: 'visit',
        targetId: visitId,
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'pre_registered', actorUserId: userId });

      const [[visit]] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS} FROM visits vis ${VISIT_JOINS} WHERE vis.id = ?`,
        [visitId],
      );

      res.status(201).json({
        ok: true,
        data: await formatVisitResponse(pool, visit, perms, { actorUserId: userId }),
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/approve', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const { reason } = req.body;
      const visitId = req.params.id;

      const [[visit]] = await pool.query(`SELECT * FROM visits WHERE id = ?`, [visitId]);
      if (!visit) return res.status(404).json({ ok: false, message: 'Visit not found.' });
      if (!['pending_approval', 'pre_registered'].includes(visit.status)) {
        return res.status(400).json({ ok: false, message: 'Visit is not pending approval.' });
      }

      await pool.query(
        `UPDATE visits SET status = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [visit.expected_at ? 'expected' : 'approved', visitId],
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
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'approved', actorUserId: userId });

      res.json({ ok: true, message: 'Visit approved.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/reject', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const { reason } = req.body;
      if (!reason?.trim()) {
        return res.status(400).json({ ok: false, message: 'Rejection reason is required.' });
      }

      const visitId = req.params.id;
      const [[visit]] = await pool.query(`SELECT * FROM visits WHERE id = ?`, [visitId]);
      if (!visit) return res.status(404).json({ ok: false, message: 'Visit not found.' });

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
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'rejected', actorUserId: userId });

      res.json({ ok: true, message: 'Visit rejected.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/check-in', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const userId = req.adminClaims?.sub;
      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }
      const { scope, elevated } = scopeResult;

      const { badgeNumber } = req.body;
      const visitId = req.params.id;

      const loaded = await loadVisitScoped(pool, visitId, scope, { elevated });
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }
      const visit = loaded.visit;

      if (visit.status === 'checked_in') {
        return res.status(400).json({ ok: false, message: 'Visitor is already checked in.' });
      }
      if (!canTransition(visit.status, 'reception_check_in') && !canTransition(visit.status, 'checked_in')) {
        return res.status(400).json({ ok: false, message: 'Visit must be approved or expected before check-in.' });
      }

      const [[visitor]] = await pool.query('SELECT full_name, phone, email FROM visitors WHERE id = ?', [visit.visitor_id]);
      const watchlistMatches = await findWatchlistMatches(pool, visit.organisation_id, {
        fullName: visitor?.full_name,
        phone: visitor?.phone,
        email: visitor?.email,
      });
      if (watchlistMatches.length) {
        await writeAuditLog(pool, {
          organisationId: visit.organisation_id,
          actorUserId: userId,
          action: 'watchlist.matched',
          targetType: 'visit',
          targetId: visitId,
          result: 'blocked',
          details: { matchCount: watchlistMatches.length },
        });
        return res.status(403).json({
          ok: false,
          message: 'Watchlist match — check-in blocked pending security review.',
          watchlistMatch: true,
        });
      }

      await conn.beginTransaction();

      const [[activeDuplicate]] = await conn.query(
        `SELECT id FROM visits WHERE visitor_id = ? AND status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting') AND id != ? LIMIT 1 FOR UPDATE`,
        [visit.visitor_id, visitId],
      );
      if (activeDuplicate) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: 'Visitor already has an active check-in.' });
      }

      let assignedBadge = badgeNumber?.trim();
      if (assignedBadge) {
        const [[badge]] = await conn.query(
          `SELECT * FROM badges WHERE organisation_id = ? AND badge_number = ? AND status = 'available' LIMIT 1 FOR UPDATE`,
          [visit.organisation_id, assignedBadge],
        );
        if (!badge) {
          await conn.rollback();
          return res.status(400).json({ ok: false, message: 'Badge not available.' });
        }
        await conn.query(
          `UPDATE badges SET status = 'issued', visit_id = ?, issued_at = NOW() WHERE id = ?`,
          [visitId, badge.id],
        );
      }

      await conn.query(
        `UPDATE visits SET status = 'reception_check_in', checked_in_at = NOW(), badge_number = ?, station_id = COALESCE(?, station_id), updated_at = NOW() WHERE id = ?`,
        [assignedBadge || visit.badge_number, scope?.station_id, visitId],
      );

      await conn.commit();

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'checked_in',
        actorUserId: userId,
        stationId: scope?.station_id,
        details: { badgeNumber: assignedBadge },
      });

      await writeAuditLog(pool, {
        organisationId: visit.organisation_id,
        actorUserId: userId,
        action: 'visit.checkin',
        targetType: 'visit',
        targetId: visitId,
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'checked_in', actorUserId: userId });

      res.json({ ok: true, message: 'Visitor checked in.' });
    } catch (error) {
      try { await conn.rollback(); } catch { /* ignore */ }
      res.status(500).json({ ok: false, message: error.message });
    } finally {
      conn.release();
    }
  });

  router.post('/:id/check-out', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const visitId = req.params.id;

      const [[visit]] = await pool.query(`SELECT * FROM visits WHERE id = ?`, [visitId]);
      if (!visit) return res.status(404).json({ ok: false, message: 'Visit not found.' });
      if (visit.status !== 'checked_in' && visit.status !== 'reception_check_in'
        && visit.status !== 'waiting' && visit.status !== 'in_meeting') {
        return res.status(400).json({ ok: false, message: 'Visitor is not checked in.' });
      }

      await pool.query(
        `UPDATE visits SET status = 'checked_out', checked_out_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [visitId],
      );

      if (visit.badge_number) {
        await pool.query(
          `UPDATE badges SET status = 'available', visit_id = NULL, returned_at = NOW()
           WHERE organisation_id = ? AND badge_number = ?`,
          [visit.organisation_id, visit.badge_number],
        );
      }

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'checked_out',
        actorUserId: userId,
        stationId: scope?.station_id,
      });

      await writeAuditLog(pool, {
        organisationId: visit.organisation_id,
        actorUserId: userId,
        action: 'visit.checkout',
        targetType: 'visit',
        targetId: visitId,
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'checked_out', actorUserId: userId });

      res.json({ ok: true, message: 'Visitor checked out.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/lookup', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const { query } = req.body;
      if (!query?.trim()) {
        return res.status(400).json({ ok: false, message: 'Search query required.' });
      }

      const q = `%${query.trim()}%`;
      const params = [scope?.organisation_id, q, q, q, q];
      let siteFilter = '';
      if (scope?.site_id) {
        siteFilter = ' AND vis.site_id = ?';
        params.push(scope.site_id);
      }

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS}
         FROM visits vis ${VISIT_JOINS}
         WHERE vis.organisation_id = ? AND (v.full_name LIKE ? OR v.phone LIKE ? OR vis.badge_number LIKE ? OR vis.pass_code LIKE ?)${siteFilter}
         ORDER BY vis.created_at DESC
         LIMIT 20`,
        params,
      );

      const perms = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, perms) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  async function transitionVisit(req, res, { toStatus, eventType, extraAudit = null }) {
    try {
      const userId = req.adminClaims?.sub;
      const visitId = req.params.id;
      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }

      const loaded = await loadVisitScoped(pool, visitId, scopeResult.scope, { elevated: scopeResult.elevated });
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const visit = loaded.visit;
      if (!canTransition(visit.status, toStatus)) {
        return res.status(400).json({
          ok: false,
          message: `Cannot transition from ${visit.status} to ${toStatus}.`,
        });
      }

      await pool.query('UPDATE visits SET status = ?, updated_at = NOW() WHERE id = ?', [toStatus, visitId]);
      await writeVisitEvent(pool, {
        visitId,
        eventType,
        actorUserId: userId,
        stationId: scopeResult.scope?.station_id,
      });

      if (extraAudit) {
        await writeAuditLog(pool, {
          organisationId: visit.organisation_id,
          actorUserId: userId,
          targetId: visitId,
          ...extraAudit,
        });
      }

      await notifyVisitEvent(pool, { visitId, eventType, actorUserId: userId });

      res.json({ ok: true, message: `Visit updated to ${toStatus}.` });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  router.post('/:id/gate-arrival', (req, res) => transitionVisit(req, res, {
    toStatus: 'arrived_at_gate',
    eventType: 'arrived_at_gate',
    extraAudit: { action: 'visit.gate_arrival', targetType: 'visit' },
  }));

  router.post('/:id/entered-premises', (req, res) => transitionVisit(req, res, {
    toStatus: 'entered_premises',
    eventType: 'entered_premises',
  }));

  router.post('/:id/waiting', (req, res) => transitionVisit(req, res, {
    toStatus: 'waiting',
    eventType: 'waiting',
  }));

  router.post('/:id/in-meeting', (req, res) => transitionVisit(req, res, {
    toStatus: 'in_meeting',
    eventType: 'in_meeting',
  }));

  router.post('/:id/left-premises', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const visitId = req.params.id;
      const [[visit]] = await pool.query('SELECT * FROM visits WHERE id = ?', [visitId]);
      if (!visit) return res.status(404).json({ ok: false, message: 'Visit not found.' });

      if (!canTransition(visit.status, 'left_premises') && visit.status !== 'checked_out') {
        return res.status(400).json({ ok: false, message: 'Visit must be checked out before leaving premises.' });
      }

      await pool.query("UPDATE visits SET status = 'left_premises', updated_at = NOW() WHERE id = ?", [visitId]);
      await writeVisitEvent(pool, { visitId, eventType: 'left_premises', actorUserId: userId });
      await pool.query("UPDATE visits SET status = 'completed', updated_at = NOW() WHERE id = ?", [visitId]);
      await notifyVisitEvent(pool, { visitId, eventType: 'left_premises', actorUserId: userId });
      res.json({ ok: true, message: 'Visitor marked as left premises.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/cancel', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const { reason } = req.body;
      const visitId = req.params.id;
      const [[visit]] = await pool.query('SELECT * FROM visits WHERE id = ?', [visitId]);
      if (!visit) return res.status(404).json({ ok: false, message: 'Visit not found.' });
      if (!canTransition(visit.status, 'cancelled')) {
        return res.status(400).json({ ok: false, message: 'Visit cannot be cancelled in its current state.' });
      }

      await pool.query("UPDATE visits SET status = 'cancelled', updated_at = NOW() WHERE id = ?", [visitId]);
      await writeVisitEvent(pool, { visitId, eventType: 'cancelled', actorUserId: userId, reason: reason || null });
      await notifyVisitEvent(pool, { visitId, eventType: 'cancelled', actorUserId: userId });
      res.json({ ok: true, message: 'Visit cancelled.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/:id/reschedule', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const { expectedAt, reason } = req.body;
      if (!expectedAt) {
        return res.status(400).json({ ok: false, message: 'New expected date/time is required.' });
      }

      const visitId = req.params.id;
      const [[visit]] = await pool.query('SELECT * FROM visits WHERE id = ?', [visitId]);
      if (!visit) return res.status(404).json({ ok: false, message: 'Visit not found.' });

      await pool.query(
        'UPDATE visits SET expected_at = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [expectedAt, visit.status === 'approved' ? 'expected' : visit.status, visitId],
      );
      await pool.query(
        'UPDATE appointments SET scheduled_at = ?, updated_at = NOW() WHERE visit_id = ?',
        [expectedAt, visitId],
      );
      await writeVisitEvent(pool, {
        visitId,
        eventType: 'rescheduled',
        actorUserId: userId,
        reason: reason || null,
        details: { expectedAt },
      });
      await notifyVisitEvent(pool, { visitId, eventType: 'rescheduled', actorUserId: userId, extra: { expected_at: expectedAt } });
      res.json({ ok: true, message: 'Visit rescheduled.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }

      const loaded = await loadVisitScoped(pool, req.params.id, scopeResult.scope, { elevated: scopeResult.elevated });
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const [[visit]] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS} FROM visits vis ${VISIT_JOINS} WHERE vis.id = ?`,
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

      const [expectedVehicles] = await pool.query(
        'SELECT * FROM expected_vehicles WHERE visit_id = ? ORDER BY created_at ASC',
        [req.params.id],
      );

      const perms = permissionsFromRequest(req);
      res.json({
        ok: true,
        data: {
          visit: await formatVisitResponse(pool, visit, perms, { actorUserId: userId }),
          events,
          approvals,
          expectedVehicles,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}

export function createVehiclesRouter() {
  const router = express.Router();

  router.get('/search', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const plate = String(req.query.plate || '').trim().toUpperCase();
      if (!plate) return res.status(400).json({ ok: false, message: 'Plate number required.' });

      const [known] = await pool.query(
        `SELECT * FROM vehicles WHERE organisation_id = ? AND plate_number = ? ORDER BY created_at DESC LIMIT 5`,
        [scope.organisation_id, plate],
      );
      const [expected] = await pool.query(
        `SELECT ev.*, vis.id AS visit_id, vis.status AS visit_status
         FROM expected_vehicles ev
         LEFT JOIN visits vis ON vis.id = ev.visit_id
         WHERE ev.organisation_id = ? AND ev.plate_number = ? AND ev.status = 'expected'
         ORDER BY ev.created_at DESC LIMIT 5`,
        [scope.organisation_id, plate],
      );

      res.json({ ok: true, data: { plate, knownVehicles: known, expectedVehicles: expected } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) return res.json({ ok: true, data: [] });

      const { search, status } = req.query;
      const params = [scope.organisation_id];
      let where = 'organisation_id = ?';

      if (status) {
        where += ' AND status = ?';
        params.push(status);
      }
      if (search) {
        where += ' AND (plate_number LIKE ? OR driver_name LIKE ?)';
        const q = `%${search}%`;
        params.push(q, q);
      }

      const [rows] = await pool.query(
        `SELECT * FROM vehicles WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
        params,
      );

      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/gate-capture', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.status(400).json({ ok: false, message: 'User scope not configured.' });
      }

      const body = { ...req.body };
      let { visitId } = body;
      const {
        plateNumber,
        driverName,
        passengerNames = [],
        vehicleType,
        make,
        colour,
      } = body;

      if (!plateNumber?.trim()) {
        return res.status(400).json({ ok: false, message: 'Plate number is required.' });
      }

      const plate = plateNumber.trim().toUpperCase();
      let vehicleId = null;
      let expectedVehicleId = null;

      const [[expected]] = await pool.query(
        `SELECT * FROM expected_vehicles
         WHERE organisation_id = ? AND plate_number = ? AND status = 'expected'
         ORDER BY created_at DESC LIMIT 1`,
        [scope.organisation_id, plate],
      );
      if (expected) {
        expectedVehicleId = expected.id;
        if (!visitId && expected.visit_id) visitId = expected.visit_id;
      }

      const [[existingVehicle]] = await pool.query(
        `SELECT * FROM vehicles WHERE organisation_id = ? AND plate_number = ? AND status IN ('on_site', 'arrived_at_gate', 'entry_approved') ORDER BY created_at DESC LIMIT 1`,
        [scope.organisation_id, plate],
      );

      if (existingVehicle) {
        vehicleId = existingVehicle.id;
        await pool.query(
          `UPDATE vehicles SET status = 'arrived_at_gate', driver_name = COALESCE(?, driver_name), visit_id = COALESCE(?, visit_id) WHERE id = ?`,
          [driverName?.trim() || null, visitId || null, vehicleId],
        );
      } else {
        vehicleId = generateId('veh');
        await pool.query(
          `INSERT INTO vehicles (id, organisation_id, visit_id, plate_number, vehicle_type, make, colour, driver_name, status, entry_station_id, entered_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'arrived_at_gate', ?, NOW(), ?)`,
          [
            vehicleId,
            scope.organisation_id,
            visitId || null,
            plate,
            vehicleType?.trim() || null,
            make?.trim() || null,
            colour?.trim() || null,
            driverName?.trim() || null,
            scope.station_id,
            userId,
          ],
        );
      }

      const entryId = generateId('vent');
      await pool.query(
        `INSERT INTO vehicle_entries (id, organisation_id, vehicle_id, expected_vehicle_id, visit_id, plate_number, driver_name, passenger_names, gate_station_id, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'arrived_at_gate', ?)`,
        [
          entryId,
          scope.organisation_id,
          vehicleId,
          expectedVehicleId,
          visitId || null,
          plate,
          driverName?.trim() || null,
          JSON.stringify(passengerNames || []),
          scope.station_id,
          userId,
        ],
      );

      if (expectedVehicleId) {
        await pool.query("UPDATE expected_vehicles SET status = 'arrived_at_gate' WHERE id = ?", [expectedVehicleId]);
      }

      if (visitId) {
        const [[visit]] = await pool.query('SELECT status FROM visits WHERE id = ?', [visitId]);
        if (visit && canTransition(visit.status, 'arrived_at_gate')) {
          await pool.query("UPDATE visits SET status = 'arrived_at_gate', updated_at = NOW() WHERE id = ?", [visitId]);
          await writeVisitEvent(pool, { visitId, eventType: 'arrived_at_gate', actorUserId: userId, stationId: scope.station_id });
          await notifyVisitEvent(pool, { visitId, eventType: 'arrived_at_gate', actorUserId: userId });
        }
      }

      await writeAuditLog(pool, {
        organisationId: scope.organisation_id,
        actorUserId: userId,
        action: 'vehicle.gate_capture',
        targetType: 'vehicle',
        targetId: vehicleId,
      });

      const [[vehicle]] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
      res.status(201).json({ ok: true, data: { vehicle, entryId, matchedExpected: Boolean(expectedVehicleId) } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/approve-entry', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const [[vehicle]] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
      if (!vehicle) return res.status(404).json({ ok: false, message: 'Vehicle not found.' });

      if (vehicle.status !== 'arrived_at_gate') {
        return res.status(400).json({ ok: false, message: 'Vehicle is not awaiting gate approval.' });
      }

      await pool.query(
        "UPDATE vehicles SET status = 'on_site', entered_at = COALESCE(entered_at, NOW()) WHERE id = ?",
        [req.params.id],
      );
      await pool.query(
        `UPDATE vehicle_entries SET status = 'entry_approved', approved_by = ?, approved_at = NOW()
         WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1`,
        [userId, req.params.id],
      );

      await writeAuditLog(pool, {
        organisationId: vehicle.organisation_id,
        actorUserId: userId,
        action: 'vehicle.entry_approved',
        targetType: 'vehicle',
        targetId: vehicle.id,
      });

      res.json({ ok: true, message: 'Vehicle entry approved.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/exit-gate', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const [[vehicle]] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
      if (!vehicle) return res.status(404).json({ ok: false, message: 'Vehicle not found.' });

      await pool.query(
        `UPDATE vehicles SET status = 'exited', exited_at = NOW(), exit_station_id = ? WHERE id = ?`,
        [scope?.station_id, req.params.id],
      );
      await pool.query(
        `UPDATE vehicle_entries SET status = 'exited', exited_at = NOW()
         WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1`,
        [req.params.id],
      );

      await writeAuditLog(pool, {
        organisationId: vehicle.organisation_id,
        actorUserId: userId,
        action: 'vehicle.exit_gate',
        targetType: 'vehicle',
        targetId: vehicle.id,
      });

      res.json({ ok: true, message: 'Vehicle exited at gate.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.status(400).json({ ok: false, message: 'User scope not configured.' });
      }

      const { plateNumber, vehicleType, make, colour, driverName, visitId } = req.body;
      if (!plateNumber?.trim()) {
        return res.status(400).json({ ok: false, message: 'Plate number is required.' });
      }

      const id = generateId('veh');
      await pool.query(
        `INSERT INTO vehicles (id, organisation_id, visit_id, plate_number, vehicle_type, make, colour, driver_name, status, entry_station_id, entered_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'on_site', ?, NOW(), ?)`,
        [
          id,
          scope.organisation_id,
          visitId || null,
          plateNumber.trim().toUpperCase(),
          vehicleType?.trim() || null,
          make?.trim() || null,
          colour?.trim() || null,
          driverName?.trim() || null,
          scope.station_id,
          userId,
        ],
      );

      await writeAuditLog(pool, {
        organisationId: scope.organisation_id,
        actorUserId: userId,
        action: 'vehicle.register',
        targetType: 'vehicle',
        targetId: id,
      });

      const [[vehicle]] = await pool.query(`SELECT * FROM vehicles WHERE id = ?`, [id]);
      res.status(201).json({ ok: true, data: vehicle });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/check-out', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const [[vehicle]] = await pool.query(`SELECT * FROM vehicles WHERE id = ?`, [req.params.id]);
      if (!vehicle) return res.status(404).json({ ok: false, message: 'Vehicle not found.' });

      await pool.query(
        `UPDATE vehicles SET status = 'departed', exited_at = NOW(), exit_station_id = ? WHERE id = ?`,
        [scope?.station_id, req.params.id],
      );

      await writeAuditLog(pool, {
        organisationId: vehicle.organisation_id,
        actorUserId: userId,
        action: 'vehicle.checkout',
        targetType: 'vehicle',
        targetId: vehicle.id,
      });

      res.json({ ok: true, message: 'Vehicle checked out.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}

export function createOrgAdminRouter() {
  const router = express.Router();

  router.get('/sites', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) {
        const [rows] = await pool.query(`SELECT s.*, o.name AS organisation_name FROM sites s JOIN organisations o ON o.id = s.organisation_id ORDER BY o.name, s.name`);
        return res.json({ ok: true, data: rows });
      }
      const [rows] = await pool.query(`SELECT * FROM sites WHERE organisation_id = ? ORDER BY name`, [orgId]);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/stations', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      let rows;
      if (orgId) {
        [rows] = await pool.query(
          `SELECT st.*, s.name AS site_name FROM stations st JOIN sites s ON s.id = st.site_id WHERE s.organisation_id = ? ORDER BY st.name`,
          [orgId],
        );
      } else {
        [rows] = await pool.query(
          `SELECT st.*, s.name AS site_name FROM stations st JOIN sites s ON s.id = st.site_id ORDER BY st.name`,
        );
      }
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/departments', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) {
        const [rows] = await pool.query(`SELECT * FROM departments ORDER BY name`);
        return res.json({ ok: true, data: rows });
      }
      const [rows] = await pool.query(`SELECT * FROM departments WHERE organisation_id = ? ORDER BY name`, [orgId]);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/hosts', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) {
        const [rows] = await pool.query(`SELECT h.*, d.name AS department_name FROM hosts h LEFT JOIN departments d ON d.id = h.department_id ORDER BY h.name`);
        return res.json({ ok: true, data: rows });
      }
      const [rows] = await pool.query(
        `SELECT h.*, d.name AS department_name FROM hosts h LEFT JOIN departments d ON d.id = h.department_id WHERE h.organisation_id = ? ORDER BY h.name`,
        [orgId],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/categories', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) {
        const [rows] = await pool.query(`SELECT * FROM visitor_categories ORDER BY name`);
        return res.json({ ok: true, data: rows });
      }
      const [rows] = await pool.query(`SELECT * FROM visitor_categories WHERE organisation_id = ? ORDER BY name`, [orgId]);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/badges', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) return res.json({ ok: true, data: [] });
      const [rows] = await pool.query(`SELECT * FROM badges WHERE organisation_id = ? ORDER BY badge_number`, [orgId]);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/dashboard', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;

      const [[orgCount]] = await pool.query(`SELECT COUNT(*) AS count FROM organisations`);
      const [[siteCount]] = orgId
        ? await pool.query(`SELECT COUNT(*) AS count FROM sites WHERE organisation_id = ?`, [orgId])
        : await pool.query(`SELECT COUNT(*) AS count FROM sites`);
      const [[userCount]] = await pool.query(`SELECT COUNT(*) AS count FROM users`);
      const [[visitCount]] = orgId
        ? await pool.query(`SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ?`, [orgId])
        : await pool.query(`SELECT COUNT(*) AS count FROM visits`);

      const emptyOrgMetrics = {
        visitsToday: 0,
        visitsYesterday: 0,
        visitTrend: 0,
        currentlyInside: 0,
        pendingApprovals: 0,
        overdueVisits: 0,
        stations: 0,
        hosts: 0,
        departments: 0,
        openIncidents: 0,
        auditToday: 0,
        recentActivity: [],
        recentAudit: [],
        weeklyVisits: [0, 0, 0, 0, 0, 0, 0],
        weeklyTrend: [],
        statusBreakdown: [],
        visitsBySite: [],
        recentVisits: [],
      };

      if (!orgId) {
        return res.json({
          ok: true,
          data: {
            organisations: Number(orgCount?.count || 0),
            sites: Number(siteCount?.count || 0),
            users: Number(userCount?.count || 0),
            totalVisits: Number(visitCount?.count || 0),
            scope,
            ...emptyOrgMetrics,
          },
        });
      }

      const { visitsToday, visitsYesterday, visitTrend } = await fetchVisitsTodayYesterday(pool, orgId);
      const weeklyVisits = await fetchWeeklyVisits(pool, orgId);
      const weeklyWalking = await fetchWeeklyWalkingVisits(pool, orgId);
      const weeklyDriveIn = await fetchWeeklyDriveInVisits(pool, orgId);

      const [[currentlyInside]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ? AND status = 'checked_in'`,
        [orgId],
      );
      const [[pendingApprovals]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ? AND status IN ('pending_approval', 'pre_registered')`,
        [orgId],
      );
      const [[overdueVisits]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE organisation_id = ? AND status = 'overdue'`,
        [orgId],
      );
      const [[stations]] = await pool.query(
        `SELECT COUNT(*) AS count FROM stations st INNER JOIN sites s ON s.id = st.site_id WHERE s.organisation_id = ?`,
        [orgId],
      );
      const [[hosts]] = await pool.query(
        `SELECT COUNT(*) AS count FROM hosts WHERE organisation_id = ?`,
        [orgId],
      );
      const [[departments]] = await pool.query(
        `SELECT COUNT(*) AS count FROM departments WHERE organisation_id = ?`,
        [orgId],
      );
      const [[openIncidents]] = await pool.query(
        `SELECT COUNT(*) AS count FROM incidents WHERE organisation_id = ? AND status IN ('open', 'investigating')`,
        [orgId],
      );
      const [[auditToday]] = await pool.query(
        `SELECT COUNT(*) AS count FROM audit_logs WHERE organisation_id = ? AND created_at >= CURDATE()`,
        [orgId],
      );

      const [recentActivity] = await pool.query(
        `SELECT ve.id, ve.event_type, ve.created_at, v.full_name AS visitor_name, vis.status AS visit_status
         FROM visit_events ve
         INNER JOIN visits vis ON vis.id = ve.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         WHERE vis.organisation_id = ?
         ORDER BY ve.created_at DESC
         LIMIT 10`,
        [orgId],
      );

      const [recentAudit] = await pool.query(
        `SELECT al.id, al.action, al.created_at, al.result, u.name AS actor_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.organisation_id = ?
         ORDER BY al.created_at DESC
         LIMIT 8`,
        [orgId],
      );

      const [statusRows] = await pool.query(
        `SELECT status, COUNT(*) AS count FROM visits WHERE organisation_id = ? GROUP BY status ORDER BY count DESC`,
        [orgId],
      );
      const statusBreakdown = statusRows.map((row) => ({
        status: row.status,
        count: Number(row.count || 0),
      }));

      const [visitsBySite] = await pool.query(
        `SELECT s.name AS site_name, COUNT(*) AS total
         FROM visits vis
         INNER JOIN sites s ON s.id = vis.site_id
         WHERE vis.organisation_id = ?
         GROUP BY s.id, s.name
         ORDER BY total DESC
         LIMIT 6`,
        [orgId],
      );

      const [recentVisits] = await pool.query(
        `SELECT vis.id, vis.created_at, vis.status, vis.badge_number,
                v.full_name AS visitor_name, h.name AS host_name,
                s.name AS site_name, vc.name AS category_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN sites s ON s.id = vis.site_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE vis.organisation_id = ?
         ORDER BY vis.created_at DESC
         LIMIT 15`,
        [orgId],
      );

      const weeklyTrend = buildWeeklyTrend(weeklyVisits, weeklyWalking, weeklyDriveIn);

      res.json({
        ok: true,
        data: {
          organisations: Number(orgCount?.count || 0),
          sites: Number(siteCount?.count || 0),
          users: Number(userCount?.count || 0),
          totalVisits: Number(visitCount?.count || 0),
          scope,
          visitsToday,
          visitsYesterday,
          visitTrend,
          currentlyInside: Number(currentlyInside?.count || 0),
          pendingApprovals: Number(pendingApprovals?.count || 0),
          overdueVisits: Number(overdueVisits?.count || 0),
          stations: Number(stations?.count || 0),
          hosts: Number(hosts?.count || 0),
          departments: Number(departments?.count || 0),
          openIncidents: Number(openIncidents?.count || 0),
          auditToday: Number(auditToday?.count || 0),
          recentActivity,
          recentAudit,
          weeklyVisits,
          weeklyTrend,
          statusBreakdown,
          visitsBySite: visitsBySite.map((row) => ({
            site_name: row.site_name,
            total: Number(row.total || 0),
          })),
          recentVisits,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
