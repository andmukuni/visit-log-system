import express from 'express';
import pool from '../db.js';
import { getUserScope, requireUserScope, canTransition } from '../scopeService.js';
import { generatePassCode, writeVisitEvent } from '../auditService.js';
import { notifyVisitEvent } from '../notificationService.js';
import { assertCanAssignCategory, permissionsFromRequest } from '../classificationService.js';
import { VISIT_JOINS, VISIT_SELECT_FIELDS } from '../visitResponseService.js';
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
import { generateId } from '../visitorSchema.js';
import { createAppointmentForVisit, upsertVisitorContactDetails } from '../accessSchema.js';
import {
  assertTargetInReceptionZones,
  buildReceptionSearchClause,
  hostZoneFilterClause,
  officeZoneFilterClause,
  requireReceptionZoneContext,
  resolveHostZoneId,
  visitZoneFilterClause,
  visitZoneMatchExpr,
} from '../receptionistService.js';
import { applyVisitAccessPolicy, applyVisitAccessPolicyToRows, auditFullRecordViewed } from '../visitorAccessPolicy.js';
import { resolveHostZoneIds } from '../hostPortalService.js';

const HOST_OCCUPIED_STATUSES = ['waiting', 'in_meeting', 'reception_check_in', 'checked_in'];

function siteFilterClause(scope, alias = 'vis') {
  if (!scope?.site_id) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.site_id = ?`, params: [scope.site_id] };
}

/** Extra joins needed for receptionist zone scoping (host office + visit office). */
const ZONE_OFFICE_JOINS = `
  LEFT JOIN offices ofc ON ofc.id = h.office_id
  LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
`;

function receptionVisitFilters(scope, zoneIds) {
  const site = siteFilterClause(scope);
  const zone = visitZoneFilterClause(zoneIds);
  return { site, zone };
}

/** Receptionist viewer context for the centralized access policy (no admin/host/security facet on these routes — requireReceptionZoneContext already gates on an active receptionist profile). */
function buildReceptionViewer(scope, zoneReq, permissions) {
  return {
    userId: scope?.user_id || null,
    permissions,
    isElevated: false,
    scope,
    hostContext: null,
    receptionContext: { receptionistId: zoneReq.receptionistId, zoneIds: zoneReq.zoneIds },
    securityContext: null,
  };
}

function calendarSelectSql(zoneMatchSql) {
  return `
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
          WHERE ev.visit_id = vis.id AND ev.status = 'expected') AS expected_plates,
         ${zoneMatchSql} AS zone_match
  FROM visits vis
  INNER JOIN visitors v ON v.id = vis.visitor_id
  LEFT JOIN appointments a ON a.visit_id = vis.id
  LEFT JOIN hosts h ON h.id = vis.host_id
  LEFT JOIN departments d ON d.id = h.department_id
  LEFT JOIN sites s ON s.id = vis.site_id
  LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
  ${ZONE_OFFICE_JOINS}
`;
}

async function fetchCheckInAppointments(scope, visitType = 'walk-in', zoneIds = null) {
  if (!scope?.organisation_id) return [];

  const statusPlaceholders = CHECK_IN_ELIGIBLE_STATUSES.map(() => '?').join(', ');
  const { sql: siteSql, params: siteParams } = siteFilterClause(scope);
  const { sql: zoneMatchSql, params: zoneMatchParams } = visitZoneMatchExpr(zoneIds);
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
  // original appointment/expected date is not today. Visits outside the
  // receptionist's zone still appear (zone_match feeds the access policy,
  // which shapes them as a restricted name+time-only row).
  const [rows] = await pool.query(
    `SELECT ${VISIT_SELECT_FIELDS},
            d.name AS department_name,
            a.id AS appointment_id,
            a.title AS appointment_title,
            COALESCE(a.scheduled_at, vis.expected_at) AS scheduled_at,
            (SELECT GROUP_CONCAT(DISTINCT veh.plate_number)
             FROM vehicles veh WHERE veh.visit_id = vis.id) AS plate_numbers,
            ${zoneMatchSql} AS zone_match
     FROM visits vis ${VISIT_JOINS}
     LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
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
    [...params, ...zoneMatchParams],
  );

  return rows;
}

export function createReceptionRouter() {
  const router = express.Router();

  router.get('/dashboard', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

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
      const { site, zone } = receptionVisitFilters(scope, zoneReq.zoneIds);
      const baseParams = [orgId, ...site.params, ...zone.params];
      const chartScopeSql = `${siteId ? ' AND vis.site_id = ?' : ''}${zone.sql}`;
      const chartScopeParams = [
        ...(siteId ? [siteId] : []),
        ...zone.params,
      ];
      const chartJoins = `
        LEFT JOIN hosts h ON h.id = vis.host_id
        ${ZONE_OFFICE_JOINS}
      `;
      const visitFrom = `
        FROM visits vis
        LEFT JOIN hosts h ON h.id = vis.host_id
        ${ZONE_OFFICE_JOINS}
      `;

      const countVisits = async (extra = '') => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count ${visitFrom}
           WHERE vis.organisation_id = ?${site.sql}${zone.sql} ${extra}`,
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
         ${visitFrom}
         WHERE vis.organisation_id = ?${site.sql}${zone.sql}
           AND vis.host_id IS NOT NULL
           AND vis.status IN (${HOST_OCCUPIED_STATUSES.map(() => '?').join(', ')})`,
        [...baseParams, ...HOST_OCCUPIED_STATUSES],
      );

      const checkInRows = await fetchCheckInAppointments(scope, 'walk-in', zoneReq.zoneIds);

      const scheduledToday = await countVisits(
        `AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
         AND DATE(COALESCE(vis.expected_at, vis.created_at)) = CURDATE()`,
      );

      const chartOpts = { joins: chartJoins };
      const weeklyVisits = await fetchWeeklyVisits(pool, orgId, chartScopeSql, chartScopeParams, chartOpts);
      const weeklyWalking = await fetchWeeklyWalkingVisits(pool, orgId, chartScopeSql, chartScopeParams, chartOpts);
      const weeklyDriveIn = await fetchWeeklyDriveInVisits(pool, orgId, chartScopeSql, chartScopeParams, chartOpts);
      const { visitTrend, visitsToday } = await fetchVisitsTodayYesterday(
        pool,
        orgId,
        chartScopeSql,
        chartScopeParams,
        chartOpts,
      );
      const eventsByType = await fetchSecurityEventsByType(
        pool,
        orgId,
        chartScopeSql,
        chartScopeParams,
        chartOpts,
      );

      const recentParams = [orgId];
      let recentSiteFilter = '';
      if (siteId) {
        recentSiteFilter = ' AND vis.site_id = ?';
        recentParams.push(siteId);
      }

      const { sql: recentZoneMatchSql, params: recentZoneMatchParams } = visitZoneMatchExpr(zoneReq.zoneIds);
      const [recentActivityRaw] = await pool.query(
        `SELECT ve.id, ve.visit_id, ve.event_type, ve.created_at,
                v.full_name AS visitor_name, vis.status AS visit_status,
                ${recentZoneMatchSql} AS zone_match
         FROM visit_events ve
         INNER JOIN visits vis ON vis.id = ve.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN offices ofc ON ofc.id = h.office_id
         LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
         WHERE vis.organisation_id = ?${recentSiteFilter}
         ORDER BY ve.created_at DESC
         LIMIT 10`,
        [...recentParams, ...recentZoneMatchParams],
      );
      // Activity feed rows aren't full visit records — shape them by hand
      // rather than forcing them through the visit DTO builders.
      const recentActivity = recentActivityRaw.map((row) => (row.zone_match
        ? { id: row.id, visit_id: row.visit_id, event_type: row.event_type, created_at: row.created_at, visitor_name: row.visitor_name, visit_status: row.visit_status, _accessLevel: 'full' }
        : { id: row.id, visit_id: row.visit_id, created_at: row.created_at, visitor_name: row.visitor_name, _accessLevel: 'restricted' }));

      const perms = permissionsFromRequest(req);
      const viewer = buildReceptionViewer(scope, zoneReq, perms);
      res.json({
        ok: true,
        data: {
          expectedToday,
          pendingApprovals,
          checkedInAtDesk,
          waitingForHost,
          hostsOccupied: Number(hostsOccupiedRow?.count || 0),
          scheduledToday,
          checkInAppointments: applyVisitAccessPolicyToRows(checkInRows, viewer, { zoneMatchColumn: 'zone_match' }),
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
            zoneIds: zoneReq.zoneIds,
            receptionistId: zoneReq.receptionistId,
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
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const visitType = String(req.query.type || 'walk-in').toLowerCase();
      const rows = await fetchCheckInAppointments(scope, visitType, zoneReq.zoneIds);
      const perms = permissionsFromRequest(req);
      const viewer = buildReceptionViewer(scope, zoneReq, perms);
      res.json({ ok: true, data: applyVisitAccessPolicyToRows(rows, viewer, { zoneMatchColumn: 'zone_match' }) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/calendar', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const from = String(req.query.start || req.query.from || '').trim();
      const to = String(req.query.end || req.query.to || '').trim();
      const { site } = receptionVisitFilters(scope, zoneReq.zoneIds);
      const { sql: zoneMatchSql, params: zoneMatchParams } = visitZoneMatchExpr(zoneReq.zoneIds);
      const params = [scope.organisation_id, ...site.params];

      let dateFilter = `AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) >= CURDATE()
        AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;

      if (from && to) {
        dateFilter = 'AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) >= ? AND COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) < ?';
        params.push(from, to);
      }

      // Cross-zone visits still appear here (Expected Visitors) — the access
      // policy shapes them as a restricted name+time-only row instead of
      // hiding them outright.
      const [rows] = await pool.query(
        `${calendarSelectSql(zoneMatchSql)}
         WHERE vis.organisation_id = ?${site.sql}
           AND vis.status NOT IN ('cancelled', 'rejected', 'denied')
           ${dateFilter}
         ORDER BY COALESCE(a.scheduled_at, vis.expected_at, vis.created_at) ASC
         LIMIT 500`,
        [...params, ...zoneMatchParams],
      );

      const perms = permissionsFromRequest(req);
      const viewer = buildReceptionViewer(scope, zoneReq, perms);
      res.json({ ok: true, data: applyVisitAccessPolicyToRows(rows, viewer, { zoneMatchColumn: 'zone_match' }) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/host-availability', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const departmentId = String(req.query.departmentId || '').trim();
      const { sql: zoneSql, params: zoneParams } = hostZoneFilterClause(zoneReq.zoneIds, 'o');
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
      hostFilter += zoneSql;
      params.push(...zoneParams);

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
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const includeReady = String(req.query.includeReady || '1') === '1';
      const statuses = includeReady
        ? ['waiting', 'pending_approval', 'reception_check_in', 'checked_in']
        : ['waiting', 'pending_approval'];

      const { site } = receptionVisitFilters(scope, zoneReq.zoneIds);
      const { sql: zoneMatchSql, params: zoneMatchParams } = visitZoneMatchExpr(zoneReq.zoneIds);
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
                END AS host_availability,
                ${zoneMatchSql} AS zone_match
         FROM visits vis ${VISIT_JOINS}
         LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
         LEFT JOIN appointments a ON a.visit_id = vis.id
         LEFT JOIN visit_events ve ON ve.visit_id = vis.id AND ve.event_type = 'waiting'
         WHERE vis.organisation_id = ?${site.sql}
           AND vis.status IN (${placeholders})
         ORDER BY COALESCE(ve.created_at, vis.checked_in_at, vis.updated_at) ASC
         LIMIT 200`,
        [scope.organisation_id, ...site.params, ...statuses, ...zoneMatchParams],
      );

      const perms = permissionsFromRequest(req);
      const viewer = buildReceptionViewer(scope, zoneReq, perms);
      // Restricted rows never get action buttons on the client — the write
      // path (assertTargetInReceptionZones) still blocks any mutation attempt
      // on an out-of-zone host/office regardless.
      res.json({ ok: true, data: applyVisitAccessPolicyToRows(rows, viewer, { zoneMatchColumn: 'zone_match' }) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/occupancy', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const { site } = receptionVisitFilters(scope, zoneReq.zoneIds);
      const { sql: zoneMatchSql, params: zoneMatchParams } = visitZoneMatchExpr(zoneReq.zoneIds);
      const params = [scope.organisation_id, ...site.params];

      const [rows] = await pool.query(
        `SELECT vis.id, vis.status, vis.checked_in_at, vis.badge_number, vis.pass_code,
                vis.zone_id, vis.host_id, vis.expected_at,
                v.full_name, v.phone, v.company, h.name AS host_name, vc.name AS category_name,
                COALESCE(vc.classification, 'standard') AS classification,
                ${zoneMatchSql} AS zone_match
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         ${ZONE_OFFICE_JOINS}
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE vis.organisation_id = ?${site.sql}
           AND vis.status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting')
         ORDER BY vis.checked_in_at DESC`,
        [...params, ...zoneMatchParams],
      );

      const perms = permissionsFromRequest(req);
      const viewer = buildReceptionViewer(scope, zoneReq, perms);
      res.json({ ok: true, data: applyVisitAccessPolicyToRows(rows, viewer, { zoneMatchColumn: 'zone_match' }) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/reference-data', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({
          ok: true,
          data: { hosts: [], categories: [], badges: [], departments: [], offices: [] },
        });
      }

      const orgId = scope.organisation_id;
      const { sql: hostZoneSql, params: hostZoneParams } = hostZoneFilterClause(zoneReq.zoneIds, 'ofc');
      const { sql: officeZoneSql, params: officeZoneParams } = officeZoneFilterClause(zoneReq.zoneIds, 'ofc');

      const [hosts] = await pool.query(
        `SELECT h.id, h.name, h.email, h.department_id, h.office_id, h.user_id,
                COALESCE(NULLIF(h.zone_id, ''), ofc.zone_id) AS zone_id
         FROM hosts h
         LEFT JOIN offices ofc ON ofc.id = h.office_id
         WHERE h.organisation_id = ? AND h.status = 'active'${hostZoneSql}
         ORDER BY h.name`,
        [orgId, ...hostZoneParams],
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
        `SELECT ofc.id, ofc.name, ofc.office_number, ofc.department_id, ofc.site_id, ofc.zone_id, d.name AS department_name
         FROM offices ofc
         LEFT JOIN departments d ON d.id = ofc.department_id
         WHERE ofc.organisation_id = ? AND ofc.status = 'active'${officeZoneSql}
         ORDER BY d.name, ofc.office_number, ofc.name`,
        [orgId, ...officeZoneParams],
      );
      const dojah = await getDojahIntegrationStatus();

      res.json({
        ok: true,
        data: {
          scope: {
            ...scope,
            zone_ids: zoneReq.zoneIds,
            receptionist_id: zoneReq.receptionistId,
          },
          hosts,
          categories,
          badges,
          departments,
          offices,
          integrations: { dojah },
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  async function loadReceptionVisit(visitId, scope, zoneIds) {
    const { site, zone } = receptionVisitFilters(scope, zoneIds);
    const [[visit]] = await pool.query(
      `SELECT ${VISIT_SELECT_FIELDS}
       FROM visits vis
       ${VISIT_JOINS}
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.id = ? AND vis.organisation_id = ?${site.sql}${zone.sql}
       LIMIT 1`,
      [visitId, scope.organisation_id, ...site.params, ...zone.params],
    );
    if (!visit) {
      return { ok: false, status: 404, message: 'Visit not found in your zone.' };
    }
    return { ok: true, visit };
  }

  async function transitionVisitScoped(req, res, { toStatus, eventType }) {
    const userId = req.adminClaims?.sub;
    const visitId = req.params.id;
    const zoneReq = await requireReceptionZoneContext(pool, userId);
    if (!zoneReq.ok) {
      return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
    }

    const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
    if (!scopeResult.ok) {
      return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
    }

    const loaded = await loadReceptionVisit(visitId, scopeResult.scope, zoneReq.zoneIds);
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

  router.get('/visits', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const { site } = receptionVisitFilters(scope, zoneReq.zoneIds);
      const zoneMatch = visitZoneMatchExpr(zoneReq.zoneIds);
      const search = String(req.query.search || req.query.q || '').trim();
      const status = String(req.query.status || '').trim();
      const limit = Math.min(200, Number(req.query.limit) || 100);

      // Param order must follow SQL emission order: SELECT expr, then WHERE.
      const params = [...zoneMatch.params, scope.organisation_id, ...site.params];

      let filters = '';
      if (status) {
        filters += ' AND vis.status = ?';
        params.push(status);
      }
      if (search) {
        // Cross-zone rows are matchable on visitor name only — searching a
        // company/host/pass code must never confirm a protected field of a
        // visit outside this desk's zone.
        const searchClause = buildReceptionSearchClause(zoneMatch, search);
        filters += searchClause.sql;
        params.push(...searchClause.params);
      }
      params.push(limit);

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS}, ${zoneMatch.sql} AS zone_match
         FROM visits vis
         ${VISIT_JOINS}
         LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
         WHERE vis.organisation_id = ?${site.sql}${filters}
         ORDER BY vis.created_at DESC
         LIMIT ?`,
        params,
      );

      const perms = permissionsFromRequest(req);
      const viewer = buildReceptionViewer(scope, zoneReq, perms);
      res.json({ ok: true, data: applyVisitAccessPolicyToRows(rows, viewer, { zoneMatchColumn: 'zone_match' }) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  /** Site-scoped only (no zone exclusion) — used for the read/detail path, where
   *  cross-zone visits must still resolve (visible-but-restricted), unlike the
   *  mutation paths above which keep the hard zone filter via loadReceptionVisit. */
  async function loadReceptionVisitForRead(visitId, scope) {
    const { sql: siteSql, params: siteParams } = siteFilterClause(scope);
    const [[visit]] = await pool.query(
      `SELECT ${VISIT_SELECT_FIELDS}
       FROM visits vis
       ${VISIT_JOINS}
       LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
       WHERE vis.id = ? AND vis.organisation_id = ?${siteSql}
       LIMIT 1`,
      [visitId, scope.organisation_id, ...siteParams],
    );
    if (!visit) {
      return { ok: false, status: 404, message: 'Visit not found.' };
    }
    return { ok: true, visit };
  }

  router.get('/visits/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }

      const loaded = await loadReceptionVisitForRead(req.params.id, scopeResult.scope);
      if (!loaded.ok) {
        return res.status(loaded.status).json({ ok: false, message: loaded.message });
      }

      const perms = permissionsFromRequest(req);
      const viewer = buildReceptionViewer(scopeResult.scope, zoneReq, perms);
      const hostZoneIds = await resolveHostZoneIds(pool, loaded.visit.host_id);
      const visitZoneMatch = hostZoneIds.some((id) => zoneReq.zoneIds.includes(id));
      const visit = applyVisitAccessPolicy(loaded.visit, viewer, { visitZoneMatch });
      const visitId = loaded.visit.id;

      if (visit?._accessLevel === 'restricted') {
        return res.json({ ok: true, data: { visit, events: [], approvals: [], visitorHistory: [] } });
      }

      await auditFullRecordViewed(pool, {
        organisationId: scopeResult.scope.organisation_id,
        actorUserId: userId,
        visitId,
      });

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

      const { site } = receptionVisitFilters(scopeResult.scope, zoneReq.zoneIds);
      const [visitorHistory] = await pool.query(
        `SELECT vis.id, vis.pass_code AS reference_number, vis.status, vis.purpose, vis.created_at,
                h.name AS host_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN offices ofc ON ofc.id = h.office_id
         LEFT JOIN offices vis_ofc ON vis_ofc.id = vis.office_id
         WHERE v.id = ? AND vis.id <> ? AND vis.organisation_id = ?${site.sql}
         ORDER BY vis.created_at DESC
         LIMIT 10`,
        [loaded.visit.visitor_id, visitId, scopeResult.scope.organisation_id, ...site.params],
      );

      res.json({
        ok: true,
        data: {
          visit,
          events,
          approvals,
          visitorHistory,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

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

      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }

      const loaded = await loadReceptionVisit(visitId, scopeResult.scope, zoneReq.zoneIds);
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

      const visitZoneId = visit.zone_id || await resolveHostZoneId(pool, visit.host_id);

      const orgId = visit.organisation_id;
      let nextHostId = hostId;
      let nextDepartmentId = departmentId;
      let nextOfficeId = officeId;
      const { sql: hostZoneSql, params: hostZoneParams } = hostZoneFilterClause(zoneReq.zoneIds, 'ofc');

      if (officeId) {
        const zoneCheck = await assertTargetInReceptionZones(pool, {
          officeId,
          organisationId: orgId,
          zoneIds: zoneReq.zoneIds,
        });
        if (!zoneCheck.ok) {
          return res.status(zoneCheck.status).json({ ok: false, message: zoneCheck.message });
        }

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
            `SELECT h.id FROM hosts h
             LEFT JOIN offices ofc ON ofc.id = h.office_id
             WHERE h.organisation_id = ? AND h.office_id = ? AND h.status = 'active'${hostZoneSql}
             ORDER BY h.name LIMIT 1`,
            [orgId, office.id, ...hostZoneParams],
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
            `SELECT h.id FROM hosts h
             LEFT JOIN offices ofc ON ofc.id = h.office_id
             WHERE h.organisation_id = ? AND h.department_id = ? AND h.status = 'active'${hostZoneSql}
             ORDER BY h.name LIMIT 1`,
            [orgId, department.id, ...hostZoneParams],
          );
          if (deptHost) nextHostId = deptHost.id;
        }
      }

      if (nextHostId) {
        const zoneCheck = await assertTargetInReceptionZones(pool, {
          hostId: nextHostId,
          organisationId: orgId,
          zoneIds: zoneReq.zoneIds,
        });
        if (!zoneCheck.ok) {
          return res.status(zoneCheck.status).json({ ok: false, message: zoneCheck.message });
        }

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
          message: 'Select a host in your zone so the request appears on their approvals list.',
        });
      }

      const nextZoneId = await resolveHostZoneId(pool, nextHostId) || visitZoneId || zoneReq.zoneIds[0];

      await pool.query(
        `UPDATE visits
         SET status = 'pending_approval',
             host_id = ?,
             department_id = COALESCE(?, department_id),
             office_id = COALESCE(?, office_id),
             zone_id = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [nextHostId, nextDepartmentId, nextOfficeId, nextZoneId, visitId],
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
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }

      const loaded = await loadReceptionVisit(visitId, scopeResult.scope, zoneReq.zoneIds);
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

  router.post('/register', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const zoneReq = await requireReceptionZoneContext(pool, userId);
      if (!zoneReq.ok) {
        return res.status(zoneReq.status).json({ ok: false, message: zoneReq.message });
      }

      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }
      const scope = scopeResult.scope;
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
      } = req.body || {};

      if (!fullName?.trim()) {
        return res.status(400).json({ ok: false, message: 'Visitor name is required.' });
      }
      if (!hostId) {
        return res.status(400).json({ ok: false, message: 'Host is required.' });
      }

      const zoneCheck = await assertTargetInReceptionZones(pool, {
        hostId,
        organisationId: scope.organisation_id,
        zoneIds: zoneReq.zoneIds,
      });
      if (!zoneCheck.ok) {
        return res.status(zoneCheck.status).json({ ok: false, message: zoneCheck.message });
      }

      const visitZoneId = await resolveHostZoneId(pool, hostId);
      if (!visitZoneId) {
        return res.status(400).json({
          ok: false,
          message: 'Selected host has no zone assigned. Contact your administrator.',
        });
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
        visitorId = existing?.id || null;
      }

      if (!visitorId) {
        visitorId = generateId('vis');
        await pool.query(
          `INSERT INTO visitors (id, organisation_id, full_name, phone, email, company)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            visitorId,
            scope.organisation_id,
            fullName.trim(),
            phone?.trim() || null,
            email?.trim() || null,
            company?.trim() || null,
          ],
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
        actorUserId: userId,
        organisationId: scope.organisation_id,
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
      const [[hostRow]] = await pool.query(
        'SELECT office_id, department_id FROM hosts WHERE id = ? LIMIT 1',
        [hostId],
      );

      await pool.query(
        `INSERT INTO visits (
           id, organisation_id, site_id, station_id, visitor_id, host_id, category_id,
           purpose, status, expected_at, pass_code, created_by, confidential_notes,
           office_id, department_id, zone_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visitId,
          scope.organisation_id,
          scope.site_id,
          scope.station_id,
          visitorId,
          hostId,
          categoryId || null,
          purpose?.trim() || null,
          initialStatus,
          expectedAt || null,
          passCode,
          userId,
          confidentialNotes?.trim() || null,
          hostRow?.office_id || null,
          hostRow?.department_id || null,
          visitZoneId,
        ],
      );

      await createAppointmentForVisit(pool, {
        organisationId: scope.organisation_id,
        visitId,
        hostId,
        scheduledAt: expectedAt || null,
        title: `Visit: ${fullName.trim()}`,
        createdBy: userId,
      });

      await writeVisitEvent(pool, {
        visitId,
        eventType: initialStatus,
        actorUserId: userId,
        stationId: scope.station_id,
      });
      await notifyVisitEvent(pool, { visitId, eventType: initialStatus, actorUserId: userId });

      res.status(201).json({
        ok: true,
        data: { id: visitId, pass_code: passCode, status: initialStatus, zone_id: visitZoneId },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
