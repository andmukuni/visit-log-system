import express from 'express';
import pool from '../db.js';
import { getUserScope, requireUserScope, canTransition, loadVisitScoped } from '../scopeService.js';
import { writeVisitEvent } from '../auditService.js';
import { notifyVisitEvent } from '../notificationService.js';
import { permissionsFromRequest } from '../classificationService.js';
import { applyVisitListMasking, VISIT_JOINS, VISIT_SELECT_FIELDS } from '../visitResponseService.js';
import {
  lookupReceptionDeskNrc,
  registerWalkInAtReceptionDesk,
  registerVehicleAtReceptionDesk,
} from '../receptionDeskEntry.js';
import { CHECK_IN_ELIGIBLE_STATUSES } from '../../shared/visitCheckIn.js';
import { getDojahIntegrationStatus, isDojahUnavailableError } from '../services/dojahService.js';
import {
  buildWeeklyTrend,
  fetchSecurityEventsByType,
  fetchVisitsTodayYesterday,
  fetchWeeklyVisits,
  fetchWeeklyWalkingVisits,
  fetchWeeklyDriveInVisits,
} from '../dashboardStats.js';
import { markHostUnavailableForVisit } from '../hostAvailability.js';

const HOST_OCCUPIED_STATUSES = ['waiting', 'in_meeting', 'reception_check_in', 'checked_in'];

function siteFilterClause(scope, alias = 'vis') {
  if (!scope?.site_id) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.site_id = ?`, params: [scope.site_id] };
}

const CALENDAR_SELECT = `
  SELECT a.id,
         COALESCE(a.title, vis.purpose) AS title,
         COALESCE(a.scheduled_at, vis.expected_at) AS scheduled_at,
         a.status AS appointment_status,
         vis.id AS visit_id,
         vis.status AS visit_status,
         vis.purpose,
         vis.pass_code,
         vis.expected_at,
         v.full_name AS visitor_name,
         v.company,
         v.phone,
         v.email,
         v.id_number_masked,
         h.id AS host_id,
         h.name AS host_name,
         d.name AS department_name,
         s.name AS site_name,
         COALESCE(vc.classification, 'standard') AS classification,
         vc.name AS category_name,
         COALESCE(vc.default_duration_minutes, 60) AS duration_minutes,
         (SELECT GROUP_CONCAT(DISTINCT ev.plate_number)
          FROM expected_vehicles ev
          WHERE ev.visit_id = vis.id AND ev.status = 'expected') AS expected_plates
  FROM visits vis
  INNER JOIN visitors v ON v.id = vis.visitor_id
  LEFT JOIN appointments a ON a.visit_id = vis.id
  LEFT JOIN hosts h ON h.id = vis.host_id
  LEFT JOIN departments d ON d.id = h.department_id
  LEFT JOIN sites s ON s.id = vis.site_id
  LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
`;

async function fetchCheckInAppointments(scope, visitType = 'walk-in') {
  if (!scope?.organisation_id) return [];

  const statusPlaceholders = CHECK_IN_ELIGIBLE_STATUSES.map(() => '?').join(', ');
  const { sql: siteSql, params: siteParams } = siteFilterClause(scope);
  const params = [
    scope.organisation_id,
    ...CHECK_IN_ELIGIBLE_STATUSES,
    ...siteParams,
  ];

  let typeFilter = '';
  if (visitType === 'walking' || visitType === 'walk-in') {
    typeFilter = ' AND NOT EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
  } else if (visitType === 'vehicle') {
    typeFilter = ' AND EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
  }

  // Gate arrivals stay on the desk until reception check-in, even if the
  // original appointment/expected date is not today.
  const [rows] = await pool.query(
    `SELECT ${VISIT_SELECT_FIELDS},
            d.name AS department_name,
            a.id AS appointment_id,
            a.title AS appointment_title,
            COALESCE(a.scheduled_at, vis.expected_at) AS scheduled_at,
            (SELECT GROUP_CONCAT(DISTINCT veh.plate_number)
             FROM vehicles veh WHERE veh.visit_id = vis.id) AS plate_numbers
     FROM visits vis ${VISIT_JOINS}
     LEFT JOIN departments d ON d.id = h.department_id
     LEFT JOIN appointments a ON a.visit_id = vis.id
     WHERE vis.organisation_id = ?
       AND vis.status IN (${statusPlaceholders})${siteSql}${typeFilter}
       AND (
         DATE(COALESCE(a.scheduled_at, vis.expected_at, vis.created_at)) = CURDATE()
         OR vis.status IN ('arrived_at_gate', 'entered_premises')
       )
     ORDER BY
       CASE WHEN vis.status IN ('arrived_at_gate', 'entered_premises') THEN 0 ELSE 1 END,
       COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) ASC
     LIMIT 200`,
    params,
  );

  return rows;
}

export function createReceptionRouter() {
  const router = express.Router();

  router.get('/dashboard', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;

      if (!orgId) {
        return res.json({
          ok: true,
          data: {
            expectedToday: 0,
            pendingApprovals: 0,
            checkedInAtDesk: 0,
            waitingForHost: 0,
            hostsOccupied: 0,
            checkInAppointments: [],
            weeklyTrend: [],
            visitTrend: 0,
            scheduledToday: 0,
            targets: {},
            eventsByType: [],
            recentActivity: [],
            scope: null,
          },
        });
      }

      const siteId = scope.site_id;
      const { sql: siteSql, params: siteParams } = siteFilterClause(scope);
      const baseParams = [orgId, ...siteParams];
      const chartSiteSql = siteId ? ' AND vis.site_id = ?' : '';
      const chartSiteParams = siteId ? [siteId] : [];

      const countVisits = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM visits vis
           WHERE vis.organisation_id = ?${siteSql} ${extra}`,
          baseParams,
        );
        return Number(row?.count || 0);
      };

      const expectedToday = await countVisits(
        `AND vis.status IN ('expected', 'approved', 'pre_registered')
         AND DATE(COALESCE(
           vis.expected_at,
           (SELECT a.scheduled_at FROM appointments a WHERE a.visit_id = vis.id LIMIT 1),
           vis.created_at
         )) = CURDATE()`,
      );
      const pendingApprovals = await countVisits(
        `AND vis.status IN ('pending_approval', 'pre_registered')`,
      );
      const checkedInAtDesk = await countVisits(
        `AND vis.status IN ('reception_check_in', 'checked_in', 'waiting', 'in_meeting')`,
      );
      const waitingForHost = await countVisits(`AND vis.status = 'waiting'`);

      const [[hostsOccupiedRow]] = await pool.query(
        `SELECT COUNT(DISTINCT vis.host_id) AS count
         FROM visits vis
         WHERE vis.organisation_id = ?${siteSql}
           AND vis.host_id IS NOT NULL
           AND vis.status IN (${HOST_OCCUPIED_STATUSES.map(() => '?').join(', ')})`,
        [...baseParams, ...HOST_OCCUPIED_STATUSES],
      );

      const checkInRows = await fetchCheckInAppointments(scope, 'walk-in');

      const scheduledToday = await countVisits(
        `AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
         AND DATE(COALESCE(vis.expected_at, vis.created_at)) = CURDATE()`,
      );

      const weeklyVisits = await fetchWeeklyVisits(pool, orgId, chartSiteSql, chartSiteParams);
      const weeklyWalking = await fetchWeeklyWalkingVisits(pool, orgId, chartSiteSql, chartSiteParams);
      const weeklyDriveIn = await fetchWeeklyDriveInVisits(pool, orgId, chartSiteSql, chartSiteParams);
      const { visitTrend, visitsToday } = await fetchVisitsTodayYesterday(pool, orgId, chartSiteSql, chartSiteParams);
      const eventsByType = await fetchSecurityEventsByType(pool, orgId, chartSiteSql, chartSiteParams);

      const recentParams = [orgId];
      let recentSiteFilter = '';
      if (siteId) {
        recentSiteFilter = ' AND vis.site_id = ?';
        recentParams.push(siteId);
      }

      const [recentActivity] = await pool.query(
        `SELECT ve.id, ve.visit_id, ve.event_type, ve.created_at,
                v.full_name AS visitor_name, vis.status AS visit_status
         FROM visit_events ve
         INNER JOIN visits vis ON vis.id = ve.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         WHERE vis.organisation_id = ?${recentSiteFilter}
         ORDER BY ve.created_at DESC
         LIMIT 10`,
        recentParams,
      );

      const perms = permissionsFromRequest(req);
      res.json({
        ok: true,
        data: {
          expectedToday,
          pendingApprovals,
          checkedInAtDesk,
          waitingForHost,
          hostsOccupied: Number(hostsOccupiedRow?.count || 0),
          scheduledToday,
          checkInAppointments: applyVisitListMasking(checkInRows, perms),
          visitTrend,
          visitsToday,
          weeklyTrend: buildWeeklyTrend(weeklyVisits, weeklyWalking, weeklyDriveIn),
          eventsByType,
          targets: {
            expectedToday: scheduledToday,
            checkedInAtDesk: scheduledToday,
            waitingForHost: checkedInAtDesk > 0 ? checkedInAtDesk : null,
          },
          recentActivity,
          scope: {
            organisationId: orgId,
            organisationName: scope.organisation_name,
            siteId: scope.site_id,
            siteName: scope.site_name,
          },
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/check-in/walk-in', async (req, res) => {
    try {
      const result = await registerWalkInAtReceptionDesk(pool, req, req.body || {});
      if (!result.ok) {
        return res.status(result.status || 400).json({
          ok: false,
          message: result.message,
          unavailable: result.unavailable,
          watchlistMatch: result.watchlistMatch,
        });
      }
      res.status(result.status || 201).json({ ok: true, data: result.data });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/check-in/vehicle', async (req, res) => {
    try {
      const result = await registerVehicleAtReceptionDesk(pool, req, req.body || {});
      if (!result.ok) {
        return res.status(result.status || 400).json({
          ok: false,
          message: result.message,
          watchlistMatch: result.watchlistMatch,
        });
      }
      res.status(result.status || 201).json({ ok: true, data: result.data });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/check-in/nrc-lookup', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.status(400).json({ ok: false, message: 'No organisation scope assigned.' });
      }
      const nrc = String(req.body?.nrc || '').trim();
      if (!nrc) {
        return res.status(400).json({ ok: false, message: 'NRC is required.' });
      }
      const result = await lookupReceptionDeskNrc(pool, { nrc, scope });
      if (!result.ok) {
        return res.status(result.status || 400).json({ ok: false, message: result.message });
      }
      res.json({ ok: true, data: result.data });
    } catch (error) {
      const unavailable = isDojahUnavailableError(error);
      res.status(unavailable ? 503 : (error.status || 400)).json({
        ok: false,
        message: error.message,
        unavailable,
      });
    }
  });

  router.get('/check-in-appointments', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const visitType = String(req.query.type || 'walk-in').toLowerCase();
      const rows = await fetchCheckInAppointments(scope, visitType);
      const perms = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, perms) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/calendar', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const from = String(req.query.start || req.query.from || '').trim();
      const to = String(req.query.end || req.query.to || '').trim();
      const { sql: siteSql, params: siteParams } = siteFilterClause(scope);
      const params = [scope.organisation_id, ...siteParams];

      let dateFilter = `AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) >= CURDATE()
        AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;

      if (from && to) {
        dateFilter = 'AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) >= ? AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) < ?';
        params.push(from, to);
      }

      const [rows] = await pool.query(
        `${CALENDAR_SELECT}
         WHERE vis.organisation_id = ?${siteSql}
           AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
           ${dateFilter}
         ORDER BY COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) ASC
         LIMIT 500`,
        params,
      );

      const perms = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, perms) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/host-availability', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const departmentId = String(req.query.departmentId || '').trim();
      const params = [scope.organisation_id];
      let hostFilter = " AND h.status = 'active'";
      if (scope.site_id) {
        hostFilter += ' AND (h.site_id = ? OR h.site_id IS NULL)';
        params.push(scope.site_id);
      }
      if (departmentId) {
        hostFilter += ' AND h.department_id = ?';
        params.push(departmentId);
      }

      const occupiedPlaceholders = HOST_OCCUPIED_STATUSES.map(() => '?').join(', ');

      const [rows] = await pool.query(
        `SELECT h.id, h.name, h.email, h.department_id, h.office_id, h.site_id,
                d.name AS department_name,
                o.name AS office_name,
                CASE
                  WHEN COALESCE(h.availability, 'available') = 'unavailable' THEN 'unavailable'
                  ELSE 'available'
                END AS availability,
                (
                  SELECT v.full_name
                  FROM visits vis
                  INNER JOIN visitors v ON v.id = vis.visitor_id
                  WHERE vis.host_id = h.id
                    AND vis.organisation_id = h.organisation_id
                    AND vis.status IN (${occupiedPlaceholders})
                  ORDER BY COALESCE(vis.checked_in_at, vis.updated_at) DESC
                  LIMIT 1
                ) AS current_visitor_name,
                (
                  SELECT vis.status
                  FROM visits vis
                  WHERE vis.host_id = h.id
                    AND vis.organisation_id = h.organisation_id
                    AND vis.status IN (${occupiedPlaceholders})
                  ORDER BY COALESCE(vis.checked_in_at, vis.updated_at) DESC
                  LIMIT 1
                ) AS current_visit_status,
                (
                  SELECT COALESCE(vis.checked_in_at, vis.updated_at)
                  FROM visits vis
                  WHERE vis.host_id = h.id
                    AND vis.organisation_id = h.organisation_id
                    AND vis.status IN (${occupiedPlaceholders})
                  ORDER BY COALESCE(vis.checked_in_at, vis.updated_at) DESC
                  LIMIT 1
                ) AS occupied_since
         FROM hosts h
         LEFT JOIN departments d ON d.id = h.department_id
         LEFT JOIN offices o ON o.id = h.office_id
         WHERE h.organisation_id = ?${hostFilter}
         ORDER BY h.name ASC`,
        [...HOST_OCCUPIED_STATUSES, ...HOST_OCCUPIED_STATUSES, ...HOST_OCCUPIED_STATUSES, ...params],
      );

      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/host-queue', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const includeReady = String(req.query.includeReady || '1') === '1';
      const statuses = includeReady
        ? ['waiting', 'pending_approval', 'reception_check_in', 'checked_in']
        : ['waiting', 'pending_approval'];

      const { sql: siteSql, params: siteParams } = siteFilterClause(scope);
      const placeholders = statuses.map(() => '?').join(', ');

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS},
                a.title AS appointment_title,
                a.scheduled_at AS appointment_scheduled_at,
                ve.created_at AS queued_at,
                CASE
                  WHEN vis.host_id IS NULL THEN NULL
                  WHEN COALESCE(h.availability, 'available') = 'unavailable' THEN 'unavailable'
                  ELSE 'available'
                END AS host_availability
         FROM visits vis ${VISIT_JOINS}
         LEFT JOIN appointments a ON a.visit_id = vis.id
         LEFT JOIN visit_events ve ON ve.visit_id = vis.id AND ve.event_type = 'waiting'
         WHERE vis.organisation_id = ?${siteSql}
           AND vis.status IN (${placeholders})
         ORDER BY COALESCE(ve.created_at, vis.checked_in_at, vis.updated_at) ASC
         LIMIT 200`,
        [scope.organisation_id, ...siteParams, ...statuses],
      );

      const perms = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, perms) });
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
      const { sql: siteSql, params: siteParams } = siteFilterClause(scope);
      params.push(...siteParams);

      const [rows] = await pool.query(
        `SELECT vis.id, vis.status, vis.checked_in_at, vis.badge_number, vis.pass_code,
                v.full_name, v.phone, v.company, h.name AS host_name, vc.name AS category_name,
                COALESCE(vc.classification, 'standard') AS classification
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE vis.organisation_id = ?${siteSql}
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
        return res.json({
          ok: true,
          data: { hosts: [], categories: [], badges: [], departments: [], offices: [] },
        });
      }

      const orgId = scope.organisation_id;
      const [hosts] = await pool.query(
        `SELECT id, name, email, department_id, office_id, user_id FROM hosts
         WHERE organisation_id = ? AND status = 'active' ORDER BY name`,
        [orgId],
      );
      const [categories] = await pool.query(
        `SELECT id, name, slug, requires_approval, default_duration_minutes, classification
         FROM visitor_categories WHERE organisation_id = ? ORDER BY name`,
        [orgId],
      );
      const [badges] = await pool.query(
        `SELECT id, badge_number, status FROM badges
         WHERE organisation_id = ? AND status = 'available' ORDER BY badge_number`,
        [orgId],
      );
      const [departments] = await pool.query(
        `SELECT id, name FROM departments WHERE organisation_id = ? ORDER BY name`,
        [orgId],
      );
      const [offices] = await pool.query(
        `SELECT ofc.id, ofc.name, ofc.office_number, ofc.department_id, ofc.site_id, d.name AS department_name
         FROM offices ofc
         LEFT JOIN departments d ON d.id = ofc.department_id
         WHERE ofc.organisation_id = ? AND ofc.status = 'active'
         ORDER BY d.name, ofc.office_number, ofc.name`,
        [orgId],
      );
      const dojah = await getDojahIntegrationStatus();

      res.json({
        ok: true,
        data: { scope, hosts, categories, badges, departments, offices, integrations: { dojah } },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  async function transitionVisitScoped(req, res, { toStatus, eventType }) {
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
    if (toStatus === 'in_meeting') {
      await markHostUnavailableForVisit(pool, visit);
    }
    await notifyVisitEvent(pool, { visitId, eventType, actorUserId: userId });

    res.json({ ok: true, message: `Visit updated to ${toStatus}.` });
  }

  router.post('/visits/:id/queue-host', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const visitId = req.params.id;
      const hostId = String(req.body?.hostId || req.body?.host_id || '').trim() || null;
      const departmentId = String(req.body?.departmentId || req.body?.department_id || '').trim() || null;
      const officeId = String(req.body?.officeId || req.body?.office_id || '').trim() || null;

      if (!hostId && !departmentId && !officeId) {
        return res.status(400).json({
          ok: false,
          message: 'Select a host, office, or department to queue to.',
        });
      }

      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }

      const loaded = await loadVisitScoped(pool, visitId, scopeResult.scope, { elevated: scopeResult.elevated });
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const visit = loaded.visit;
      if (!canTransition(visit.status, 'pending_approval')) {
        return res.status(400).json({
          ok: false,
          message: `Cannot queue from ${visit.status}. Check the visitor in at the desk first.`,
        });
      }

      const orgId = visit.organisation_id;
      let nextHostId = hostId;
      let nextDepartmentId = departmentId;
      let nextOfficeId = officeId;

      if (officeId) {
        const [[office]] = await pool.query(
          `SELECT id, department_id, name, office_number FROM offices
           WHERE id = ? AND organisation_id = ? AND status = 'active' LIMIT 1`,
          [officeId, orgId],
        );
        if (!office) {
          return res.status(400).json({ ok: false, message: 'Selected office was not found.' });
        }
        nextOfficeId = office.id;
        nextDepartmentId = nextDepartmentId || office.department_id || null;
        if (!nextHostId) {
          const [[officeHost]] = await pool.query(
            `SELECT id FROM hosts
             WHERE organisation_id = ? AND office_id = ? AND status = 'active'
             ORDER BY name LIMIT 1`,
            [orgId, office.id],
          );
          if (officeHost) nextHostId = officeHost.id;
        }
      }

      if (nextDepartmentId) {
        const [[department]] = await pool.query(
          'SELECT id, name FROM departments WHERE id = ? AND organisation_id = ? LIMIT 1',
          [nextDepartmentId, orgId],
        );
        if (!department) {
          return res.status(400).json({ ok: false, message: 'Selected department was not found.' });
        }
        if (!nextHostId && !nextOfficeId) {
          const [[deptHost]] = await pool.query(
            `SELECT id FROM hosts
             WHERE organisation_id = ? AND department_id = ? AND status = 'active'
             ORDER BY name LIMIT 1`,
            [orgId, department.id],
          );
          if (deptHost) nextHostId = deptHost.id;
        }
      }

      if (nextHostId) {
        const [[host]] = await pool.query(
          `SELECT id, department_id, office_id, name FROM hosts
           WHERE id = ? AND organisation_id = ? AND status = 'active' LIMIT 1`,
          [nextHostId, orgId],
        );
        if (!host) {
          return res.status(400).json({ ok: false, message: 'Selected host was not found.' });
        }
        nextHostId = host.id;
        nextDepartmentId = nextDepartmentId || host.department_id || null;
        nextOfficeId = nextOfficeId || host.office_id || null;
      }

      if (!nextHostId) {
        return res.status(400).json({
          ok: false,
          message: 'Select a host so the request appears on their approvals list.',
        });
      }

      await pool.query(
        `UPDATE visits
         SET status = 'pending_approval',
             host_id = ?,
             department_id = COALESCE(?, department_id),
             office_id = COALESCE(?, office_id),
             updated_at = NOW()
         WHERE id = ?`,
        [nextHostId, nextDepartmentId, nextOfficeId, visitId],
      );

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'pending_approval',
        actorUserId: userId,
        stationId: scopeResult.scope?.station_id,
        details: {
          hostId: nextHostId,
          departmentId: nextDepartmentId,
          officeId: nextOfficeId,
          queuedBy: 'reception',
        },
      });

      await notifyVisitEvent(pool, { visitId, eventType: 'pending_approval', actorUserId: userId });

      res.json({
        ok: true,
        message: 'Visitor sent to host for approval.',
        data: {
          hostId: nextHostId,
          departmentId: nextDepartmentId,
          officeId: nextOfficeId,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/visits/:id/in-meeting', (req, res) => transitionVisitScoped(req, res, {
    toStatus: 'in_meeting',
    eventType: 'in_meeting',
  }));

  router.post('/visits/:id/request-approval', async (req, res) => {
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
      if (!['pending_approval', 'pre_registered'].includes(visit.status)) {
        return res.status(400).json({ ok: false, message: 'Visit is not awaiting approval.' });
      }

      await notifyVisitEvent(pool, { visitId, eventType: 'pending_approval', actorUserId: userId });
      res.json({ ok: true, message: 'Approval request sent to host.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
