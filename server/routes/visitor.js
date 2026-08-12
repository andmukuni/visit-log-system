import express from 'express';
import pool from '../db.js';
import { generateId } from '../visitorSchema.js';
import { getUserScope, writeAuditLog, writeVisitEvent, generatePassCode } from '../auditService.js';
import {
  requireUserScope,
  resolveGateEntryPlacement,
  loadVisitScoped,
  canTransition,
  isSuperAdmin,
  hostVisitFilter,
} from '../scopeService.js';
import { resolveViewerAccessContext, applyVisitAccessPolicyToRows } from '../visitorAccessPolicy.js';
import { visitZoneMatchExpr } from '../receptionistService.js';
import { visitSecurityScopeFilterClause } from '../securityGuardService.js';
import { CHECK_IN_ELIGIBLE_STATUSES } from '../../shared/visitCheckIn.js';
import { GATE_CHECKOUT_ELIGIBLE_STATUSES, isGateCheckoutEligible } from '../../shared/visitCheckout.js';
import { findWatchlistMatches } from '../watchlistService.js';
import { notifyVisitEvent } from '../notificationService.js';
import { VISIT_SELECT_FIELDS, VISIT_JOINS, applyVisitListMasking, formatVisitResponse } from '../visitResponseService.js';
import { assertCanAssignCategory, permissionsFromRequest } from '../classificationService.js';
import {
  createAppointmentForVisit,
  upsertVisitorContactDetails,
  canTransitionVehicle,
} from '../accessSchema.js';
import { lookupNrc, getDojahIntegrationStatus, isDojahUnavailableError } from '../services/dojahService.js';
import { fetchVisitsTodayYesterday, fetchWeeklyVisits, fetchWeeklyWalkingVisits, fetchWeeklyDriveInVisits, buildWeeklyTrend, fetchSecurityEventsByType, siteScopeFromId, ON_SITE_VISIT_STATUSES } from '../dashboardStats.js';
import {
  assertStationPlacement,
  assertOfficePlacement,
  assertEmployeePlacement,
  loadZoneInOrg,
} from '../orgStructureService.js';
import {
  resolveHostZoneId,
  resolveReceptionZoneContext,
} from '../receptionistService.js';
import {
  markHostUnavailableForVisit,
  normalizeHostAvailability,
  refreshHostAvailabilityAfterVisit,
} from '../hostAvailability.js';
import { loadReceptionistRow, syncReceptionistPortalUser, parseReceptionistZoneIds, validateReceptionistZones, syncReceptionistZones, attachReceptionistZones, loadReceptionistZones } from '../receptionistService.js';
import { loadSecurityGuardRow, syncSecurityGuardPortalUser } from '../securityGuardService.js';
import {
  attachHostZones,
  hostPortalRoleLabel,
  normalizeHostPortalRole,
  parseHostZoneIds,
  resolveHostPortalRole,
  sendHostPasswordResetEmail,
  syncHostPortalUser,
  syncHostZones,
  validateHostZones,
} from '../hostPortalService.js';
import { getSecuritySettings } from '../services/adminSettingsService.js';

function hasPlatformWideAccess(claims = {}) {
  const perms = claims.permissions || [];
  return isSuperAdmin(claims) || perms.some((p) => String(p).startsWith('platform.'));
}

/** Optional host position must belong to the same organisation when set. */
async function resolveHostPositionId(pool, organisationId, positionId) {
  const id = String(positionId || '').trim() || null;
  if (!id) return { ok: true, positionId: null };
  const [[row]] = await pool.query(
    `SELECT id FROM positions
     WHERE id = ? AND organisation_id = ?
     LIMIT 1`,
    [id, organisationId],
  );
  if (!row) {
    return { ok: false, status: 400, message: 'Select a valid position for this organisation.' };
  }
  return { ok: true, positionId: row.id };
}

/**
 * Resolve organisation filter for org-admin read APIs.
 * Platform-wide admins may pass organisation_id / "all"; scoped admins stay locked to their org.
 */
async function resolveAdminOrganisationFilter(poolConn, req, scope = null) {
  const claims = req.adminClaims || {};
  const platformWide = hasPlatformWideAccess(claims);
  const requested = String(req.query?.organisation_id || req.query?.organisationId || '').trim();

  if (!platformWide) {
    return {
      ok: true,
      organisationId: scope?.organisation_id || null,
      organisationName: scope?.organisation_name || null,
      platformWide: false,
      viewAll: !scope?.organisation_id,
    };
  }

  if (!requested || requested === 'all') {
    return {
      ok: true,
      organisationId: null,
      organisationName: null,
      platformWide: true,
      viewAll: true,
    };
  }

  const [[org]] = await poolConn.query(
    'SELECT id, name FROM organisations WHERE id = ? LIMIT 1',
    [requested],
  );
  if (!org) {
    return { ok: false, status: 400, message: 'Organisation not found.' };
  }

  return {
    ok: true,
    organisationId: org.id,
    organisationName: org.name,
    platformWide: true,
    viewAll: false,
  };
}

function adminOrganisationScopeView(scope, filter) {
  if (filter.organisationId) {
    return {
      ...(scope || {}),
      organisation_id: filter.organisationId,
      organisation_name: filter.organisationName || scope?.organisation_name || null,
    };
  }
  if (filter.platformWide || filter.viewAll) {
    return {
      ...(scope || {}),
      organisation_id: null,
      organisation_name: 'All organisations',
    };
  }
  return scope;
}

export function createStationRouter() {
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
            visitorsToday: 0,
            vehiclesToday: 0,
            currentlyInside: 0,
            pendingApprovals: 0,
            overdueVisits: 0,
            deniedRejected: 0,
            visitTrend: 0,
            weeklyTrend: [],
            eventsByType: [],
            recentActivity: [],
            scope: null,
          },
        });
      }

      const siteId = scope.site_id;
      const { sql: siteSql, params: siteParams } = siteScopeFromId(siteId);
      const baseParams = [orgId, ...siteParams];
      const chartSiteSql = siteId ? ' AND vis.site_id = ?' : '';
      const chartSiteParams = siteId ? [siteId] : [];

      const countVisits = async (extra = '', extraParams = []) => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM visits vis
           WHERE vis.organisation_id = ?${siteSql}${extra}`,
          [...baseParams, ...extraParams],
        );
        return Number(row?.count || 0);
      };

      const onSitePlaceholders = ON_SITE_VISIT_STATUSES.map(() => '?').join(', ');
      const visitorsTodayQuery = await fetchVisitsTodayYesterday(pool, orgId, chartSiteSql, chartSiteParams);
      const weeklyVisits = await fetchWeeklyVisits(pool, orgId, chartSiteSql, chartSiteParams);
      const weeklyWalking = await fetchWeeklyWalkingVisits(pool, orgId, chartSiteSql, chartSiteParams);
      const weeklyDriveIn = await fetchWeeklyDriveInVisits(pool, orgId, chartSiteSql, chartSiteParams);
      const eventsByType = await fetchSecurityEventsByType(pool, orgId, chartSiteSql, chartSiteParams);

      let vehiclesSql = `
        SELECT COUNT(*) AS count
        FROM vehicles veh
        INNER JOIN visits vis ON vis.id = veh.visit_id
        WHERE vis.organisation_id = ?
          AND DATE(veh.created_at) = CURDATE()
      `;
      const vehicleParams = [orgId];
      if (siteId) {
        vehiclesSql += ' AND vis.site_id = ?';
        vehicleParams.push(siteId);
      }
      const [[vehiclesToday]] = await pool.query(vehiclesSql, vehicleParams);

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

      res.json({
        ok: true,
        data: {
          visitorsToday: visitorsTodayQuery.visitsToday,
          vehiclesToday: Number(vehiclesToday?.count || 0),
          currentlyInside: await countVisits(
            ` AND vis.status IN (${onSitePlaceholders})`,
            ON_SITE_VISIT_STATUSES,
          ),
          pendingApprovals: await countVisits(` AND vis.status IN ('pending_approval', 'pre_registered')`),
          overdueVisits: await countVisits(` AND vis.status = 'overdue'`),
          deniedRejected: await countVisits(
            ` AND vis.status IN ('rejected', 'denied') AND DATE(vis.created_at) = CURDATE()`,
          ),
          visitTrend: visitorsTodayQuery.visitTrend,
          weeklyTrend: buildWeeklyTrend(weeklyVisits, weeklyWalking, weeklyDriveIn),
          eventsByType,
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
        return res.json({
          ok: true,
          data: { hosts: [], categories: [], badges: [], integrations: { dojah: { enabled: false, configured: false } } },
        });
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
      const dojah = await getDojahIntegrationStatus();

      res.json({
        ok: true,
        data: {
          scope,
          hosts,
          categories,
          badges,
          integrations: { dojah },
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/gate-entry/nrc-lookup', async (req, res) => {
    try {
      const scopeResult = await requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }

      const nrc = String(req.body?.nrc || '').trim();
      if (!nrc) {
        return res.status(400).json({ ok: false, message: 'NRC is required.' });
      }

      const lookup = await lookupNrc(nrc, {
        customerReference: `gate-${scopeResult.scope?.station_id || scopeResult.scope?.site_id || 'entry'}`,
      });

      res.json({
        ok: true,
        data: {
          nrc: lookup.nrc,
          taxpayer_name: lookup.taxpayer_name,
          current_status: lookup.current_status,
          tpin: lookup.tpin || null,
        },
      });
    } catch (error) {
      const unavailable = isDojahUnavailableError(error);
      res.status(unavailable ? 503 : (error.status || 400)).json({
        ok: false,
        message: error.message,
        unavailable,
      });
    }
  });

  router.post('/gate-entry/walk-in', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }
      const placement = await resolveGateEntryPlacement(pool, scopeResult.scope);
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }
      const { organisationId, siteId, stationId } = placement;
      const {
        fullName,
        phone,
        email,
        company,
        hostId,
        categoryId,
        purpose,
        idType,
        idNumber,
        dojahOverride,
        checkInSignature,
      } = req.body || {};

      let resolvedFullName = fullName?.trim() || '';
      const usingDojahOverride = Boolean(dojahOverride);

      if (String(idType || '').toLowerCase() === 'nrc' && idNumber?.trim()) {
        const dojah = await getDojahIntegrationStatus();
        if (dojah.enabled && !usingDojahOverride) {
          try {
            const lookup = await lookupNrc(idNumber.trim(), {
              customerReference: `walkin-${stationId || siteId || 'entry'}`,
            });
            if (!resolvedFullName && lookup.taxpayer_name) {
              resolvedFullName = lookup.taxpayer_name;
            }
          } catch (error) {
            if (isDojahUnavailableError(error)) {
              return res.status(503).json({
                ok: false,
                message: error.message || 'Dojah service is temporarily unavailable.',
                unavailable: true,
              });
            }
            return res.status(error.status || 400).json({
              ok: false,
              message: error.message || 'NRC verification failed.',
            });
          }
        }
      }

      if (!resolvedFullName) {
        return res.status(400).json({ ok: false, message: 'Full name is required.' });
      }

      const signature = String(checkInSignature || '').trim();
      if (!signature.startsWith('data:image/')) {
        return res.status(400).json({ ok: false, message: 'Check-in signature is required.' });
      }
      if (signature.length > 500_000) {
        return res.status(400).json({ ok: false, message: 'Signature image is too large.' });
      }

      const watchlistMatches = await findWatchlistMatches(pool, organisationId, {
        fullName: resolvedFullName,
        phone: phone?.trim(),
        email: email?.trim(),
      });
      if (watchlistMatches.length) {
        await writeAuditLog(pool, {
          organisationId,
          actorUserId: userId,
          action: 'watchlist.matched',
          targetType: 'visit',
          targetId: null,
          result: 'blocked',
          details: { matchCount: watchlistMatches.length, source: 'gate_entry' },
        });
        return res.status(403).json({
          ok: false,
          message: 'Watchlist match — entry blocked pending security review.',
          watchlistMatch: true,
        });
      }

      let visitorId = null;
      if (phone?.trim()) {
        const [[existing]] = await pool.query(
          `SELECT id FROM visitors WHERE organisation_id = ? AND phone = ? LIMIT 1`,
          [organisationId, phone.trim()],
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
            organisationId,
            resolvedFullName,
            phone?.trim() || null,
            email?.trim() || null,
            company?.trim() || null,
          ],
        );
      } else {
        await pool.query(
          `UPDATE visitors SET full_name = ?, email = COALESCE(?, email), company = COALESCE(?, company), updated_at = NOW()
           WHERE id = ?`,
          [resolvedFullName, email?.trim() || null, company?.trim() || null, visitorId],
        );
      }

      await upsertVisitorContactDetails(pool, visitorId, { idType, idNumber, actorUserId: userId, organisationId });

      const visitId = generateId('visit');
      const passCode = generatePassCode();

      await pool.query(
        `INSERT INTO visits (id, organisation_id, site_id, station_id, visitor_id, host_id, category_id, purpose, status, pass_code, check_in_signature, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'arrived_at_gate', ?, ?, ?)`,
        [
          visitId,
          organisationId,
          siteId,
          stationId,
          visitorId,
          hostId || null,
          categoryId || null,
          purpose?.trim() || null,
          passCode,
          signature,
          userId,
        ],
      );

      await writeVisitEvent(pool, {
        visitId,
        eventType: 'arrived_at_gate',
        actorUserId: userId,
        stationId,
        reason: purpose?.trim() || null,
      });

      try {
        await createAppointmentForVisit(pool, {
          organisationId,
          visitId,
          hostId: hostId || null,
          scheduledAt: null,
          title: `Gate entry: ${resolvedFullName}`,
          createdBy: userId,
        });
      } catch (error) {
        console.warn('[gate-entry/walk-in] appointment create failed:', error.message);
      }

      await writeAuditLog(pool, {
        organisationId,
        actorUserId: userId,
        action: 'gate_entry.walk_in',
        targetType: 'visit',
        targetId: visitId,
        details: usingDojahOverride ? { dojah_override: true, id_number: idNumber?.trim() || null } : undefined,
      });

      if (usingDojahOverride) {
        await writeAuditLog(pool, {
          organisationId,
          actorUserId: userId,
          action: 'gate_entry.dojah_override',
          targetType: 'visit',
          targetId: visitId,
          result: 'override',
          details: {
            id_type: idType,
            id_number: idNumber?.trim() || null,
            reason: 'dojah_unavailable',
          },
        });
      }

      try {
        await notifyVisitEvent(pool, { visitId, eventType: 'arrived_at_gate', actorUserId: userId });
      } catch (error) {
        console.warn('[gate-entry/walk-in] notify failed:', error.message);
      }

      const [[visit]] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS} FROM visits vis ${VISIT_JOINS} WHERE vis.id = ?`,
        [visitId],
      );
      const perms = permissionsFromRequest(req);
      res.status(201).json({
        ok: true,
        data: await formatVisitResponse(pool, visit, perms, { actorUserId: userId }),
      });
    } catch (error) {
      console.error('[gate-entry/walk-in]', error);
      res.status(500).json({ ok: false, message: error.message || 'Gate entry failed.' });
    }
  });

  router.post('/gate-entry/vehicle', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
      if (!scopeResult.ok) {
        return res.status(scopeResult.status).json({ ok: false, message: scopeResult.message });
      }
      const placement = await resolveGateEntryPlacement(pool, scopeResult.scope);
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }
      const { organisationId, siteId, stationId } = placement;
      const scope = {
        ...(scopeResult.scope || {}),
        organisation_id: organisationId,
        site_id: siteId,
        station_id: stationId,
      };
      const {
        plateNumber,
        vehicleType,
        driverName,
        phone,
        company,
        hostId,
        purpose,
        occupantCount = 0,
        checkInSignature,
      } = req.body || {};

      if (!plateNumber?.trim()) {
        return res.status(400).json({ ok: false, message: 'Plate number is required.' });
      }

      const signature = String(checkInSignature || '').trim();
      if (!signature.startsWith('data:image/')) {
        return res.status(400).json({ ok: false, message: 'Check-in signature is required.' });
      }
      if (signature.length > 500_000) {
        return res.status(400).json({ ok: false, message: 'Signature image is too large.' });
      }

      const plate = plateNumber.trim().toUpperCase();
      let visitId = null;

      if (driverName?.trim() || hostId || purpose?.trim()) {
        const watchlistMatches = await findWatchlistMatches(pool, organisationId, {
          fullName: driverName?.trim(),
          phone: phone?.trim(),
        });
        if (watchlistMatches.length) {
          return res.status(403).json({
            ok: false,
            message: 'Watchlist match — entry blocked pending security review.',
            watchlistMatch: true,
          });
        }

        let visitorId = null;
        if (phone?.trim()) {
          const [[existing]] = await pool.query(
            `SELECT id FROM visitors WHERE organisation_id = ? AND phone = ? LIMIT 1`,
            [organisationId, phone.trim()],
          );
          visitorId = existing?.id;
        }
        if (!visitorId) {
          visitorId = generateId('vis');
          await pool.query(
            `INSERT INTO visitors (id, organisation_id, full_name, phone, company)
             VALUES (?, ?, ?, ?, ?)`,
            [
              visitorId,
              organisationId,
              driverName?.trim() || 'Vehicle driver',
              phone?.trim() || null,
              company?.trim() || null,
            ],
          );
        }

        visitId = generateId('visit');
        const passCode = generatePassCode();
        await pool.query(
          `INSERT INTO visits (id, organisation_id, site_id, station_id, visitor_id, host_id, purpose, status, pass_code, check_in_signature, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'expected', ?, ?, ?)`,
          [
            visitId,
            organisationId,
            siteId,
            stationId,
            visitorId,
            hostId || null,
            purpose?.trim() || null,
            passCode,
            signature,
            userId,
          ],
        );
      }

      const occupants = Math.max(0, Math.min(20, Number(occupantCount) || 0));
      const passengerNames = occupants > 1
        ? Array.from({ length: occupants - 1 }, (_, i) => `Occupant ${i + 2}`)
        : [];

      const [[expected]] = await pool.query(
        `SELECT * FROM expected_vehicles
         WHERE organisation_id = ? AND plate_number = ? AND status = 'expected'
         ORDER BY created_at DESC LIMIT 1`,
        [scope.organisation_id, plate],
      );
      if (expected?.visit_id && !visitId) visitId = expected.visit_id;

      let vehicleId = null;
      const [[existingVehicle]] = await pool.query(
        `SELECT * FROM vehicles WHERE organisation_id = ? AND plate_number = ? AND status IN ('on_site', 'arrived_at_gate', 'entry_approved') ORDER BY created_at DESC LIMIT 1`,
        [scope.organisation_id, plate],
      );

      if (existingVehicle) {
        vehicleId = existingVehicle.id;
        await pool.query(
          `UPDATE vehicles SET status = 'on_site', driver_name = COALESCE(?, driver_name), visit_id = COALESCE(?, visit_id), entered_at = COALESCE(entered_at, NOW()) WHERE id = ?`,
          [driverName?.trim() || null, visitId || null, vehicleId],
        );
      } else {
        vehicleId = generateId('veh');
        await pool.query(
          `INSERT INTO vehicles (id, organisation_id, visit_id, plate_number, vehicle_type, driver_name, status, entry_station_id, entered_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'on_site', ?, NOW(), ?)`,
          [
            vehicleId,
            scope.organisation_id,
            visitId,
            plate,
            vehicleType?.trim() || null,
            driverName?.trim() || null,
            scope.station_id,
            userId,
          ],
        );
      }

      const entryId = generateId('vent');
      await pool.query(
        `INSERT INTO vehicle_entries (id, organisation_id, vehicle_id, expected_vehicle_id, visit_id, plate_number, driver_name, passenger_names, gate_station_id, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'entry_approved', ?)`,
        [
          entryId,
          scope.organisation_id,
          vehicleId,
          expected?.id || null,
          visitId,
          plate,
          driverName?.trim() || null,
          JSON.stringify(passengerNames),
          scope.station_id,
          userId,
        ],
      );

      if (expected?.id) {
        await pool.query("UPDATE expected_vehicles SET status = 'entry_approved' WHERE id = ?", [expected.id]);
      }

      if (visitId) {
        const [[visit]] = await pool.query('SELECT status FROM visits WHERE id = ?', [visitId]);
        if (visit && canTransition(visit.status, 'arrived_at_gate')) {
          await pool.query(
            `UPDATE visits SET status = 'arrived_at_gate', check_in_signature = COALESCE(check_in_signature, ?), updated_at = NOW() WHERE id = ?`,
            [signature, visitId],
          );
          await writeVisitEvent(pool, { visitId, eventType: 'arrived_at_gate', actorUserId: userId, stationId: scope.station_id });
          try {
            await notifyVisitEvent(pool, { visitId, eventType: 'arrived_at_gate', actorUserId: userId });
          } catch (error) {
            console.warn('[gate-entry/vehicle] notify failed:', error.message);
          }
        } else {
          await pool.query(
            `UPDATE visits SET check_in_signature = COALESCE(check_in_signature, ?), updated_at = NOW() WHERE id = ?`,
            [signature, visitId],
          );
        }
      }

      await writeAuditLog(pool, {
        organisationId,
        actorUserId: userId,
        action: 'gate_entry.vehicle',
        targetType: 'vehicle',
        targetId: vehicleId,
      });

      const [[vehicle]] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
      res.status(201).json({
        ok: true,
        data: { vehicle, visitId, entryId, matchedExpected: Boolean(expected?.id) },
      });
    } catch (error) {
      console.error('[gate-entry/vehicle]', error);
      res.status(500).json({ ok: false, message: error.message || 'Vehicle gate entry failed.' });
    }
  });

  return router;
}

/**
 * Multi-role dispatch for the shared /admin/visits endpoints (reachable via
 * host.visitors, reception.visitors.view, security.visitors, admin.visitors,
 * executive.visits — see resolveVisitRoutePermissions). Closes the ownership
 * gap where a plain host-role user could see every host's visitors here:
 * elevated/admin get org+site scope unchanged; a receptionist gets the same
 * visible-but-restricted zone-match treatment as reception.js; a security
 * officer gets their hard site/building/gate scope; a host-only caller is
 * restricted to hostVisitFilter (their own visits only).
 */
async function resolveVisitsRouterAccess(req) {
  const userId = req.adminClaims?.sub;
  const viewer = await resolveViewerAccessContext(pool, { userId, claims: req.adminClaims || {} });

  if (viewer.isElevated) {
    return { viewer, mode: 'elevated', extraSql: '', extraParams: [], zoneMatchSql: null, zoneMatchParams: [] };
  }
  if (viewer.receptionContext) {
    const { sql, params } = visitZoneMatchExpr(viewer.receptionContext.zoneIds);
    return { viewer, mode: 'reception', extraSql: '', extraParams: [], zoneMatchSql: sql, zoneMatchParams: params };
  }
  if (viewer.securityContext) {
    // VISIT_JOINS provides no sec_zone/sec_ofc aliases, so the building
    // predicate must be dropped here — site + gate scope still bind.
    const { sql, params } = visitSecurityScopeFilterClause(viewer.securityContext, { buildingJoinAvailable: false });
    return { viewer, mode: 'security', extraSql: sql, extraParams: params, zoneMatchSql: null, zoneMatchParams: [] };
  }
  if (viewer.hostContext) {
    return {
      viewer,
      mode: 'host',
      extraSql: ` AND ${hostVisitFilter('vis')}`,
      extraParams: [viewer.hostContext.hostId, viewer.hostContext.userId],
      zoneMatchSql: null,
      zoneMatchParams: [],
    };
  }
  // No applicable relationship — deny by default.
  return { viewer, mode: 'denied', extraSql: ' AND 1=0', extraParams: [], zoneMatchSql: null, zoneMatchParams: [] };
}

function shapeVisitsRouterRows(rows, access) {
  if (access.mode === 'reception') {
    return applyVisitAccessPolicyToRows(rows, access.viewer, { zoneMatchColumn: 'zone_match' });
  }
  if (access.mode === 'security') {
    return applyVisitAccessPolicyToRows(rows, access.viewer, { securityMatches: true });
  }
  return applyVisitListMasking(rows, access.viewer.permissions || []);
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

      const access = await resolveVisitsRouterAccess(req);
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
      where += access.extraSql;
      params.push(...access.extraParams);

      const zoneMatchSelect = access.zoneMatchSql ? `, ${access.zoneMatchSql} AS zone_match` : '';

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS}${zoneMatchSelect}
         FROM visits vis ${VISIT_JOINS}
         WHERE ${where}
         ORDER BY vis.created_at DESC
         LIMIT 200`,
        [...params, ...access.zoneMatchParams],
      );

      res.json({ ok: true, data: shapeVisitsRouterRows(rows, access) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/expected-arrivals', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const access = await resolveVisitsRouterAccess(req);
      const range = String(req.query.range || 'week').toLowerCase();
      const params = [scope.organisation_id];
      let where = `vis.organisation_id = ?
        AND vis.status IN ('expected', 'approved', 'pre_registered')`;

      if (scope.site_id) {
        where += ' AND vis.site_id = ?';
        params.push(scope.site_id);
      }

      // Prefer visit expected_at, then linked appointment schedule, then created_at.
      const arrivalAt = 'COALESCE(vis.expected_at, a.scheduled_at, vis.created_at)';
      if (range === 'today') {
        where += ` AND DATE(${arrivalAt}) = CURDATE()`;
      } else {
        where += ` AND ${arrivalAt} >= CURDATE()
          AND ${arrivalAt} < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
      }
      where += access.extraSql;
      params.push(...access.extraParams);

      const zoneMatchSelect = access.zoneMatchSql ? `, ${access.zoneMatchSql} AS zone_match` : '';

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS},
                a.title AS appointment_title,
                a.scheduled_at AS appointment_scheduled_at,
                (SELECT GROUP_CONCAT(DISTINCT ev.plate_number)
                 FROM expected_vehicles ev
                 WHERE ev.visit_id = vis.id AND ev.status = 'expected') AS expected_plates${zoneMatchSelect}
         FROM visits vis ${VISIT_JOINS}
         LEFT JOIN appointments a ON a.visit_id = vis.id
         WHERE ${where}
         ORDER BY ${arrivalAt} ASC
         LIMIT 200`,
        [...params, ...access.zoneMatchParams],
      );

      res.json({ ok: true, data: shapeVisitsRouterRows(rows, access) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/pending-check-in', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const access = await resolveVisitsRouterAccess(req);
      const visitType = String(req.query.type || 'walk-in').toLowerCase();
      const statusPlaceholders = CHECK_IN_ELIGIBLE_STATUSES.map(() => '?').join(', ');
      const params = [scope.organisation_id, ...CHECK_IN_ELIGIBLE_STATUSES];
      let siteFilter = '';
      if (scope.site_id) {
        siteFilter = ' AND vis.site_id = ?';
        params.push(scope.site_id);
      }

      let typeFilter = '';
      if (visitType === 'walking' || visitType === 'walk-in') {
        typeFilter = ' AND NOT EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      } else if (visitType === 'vehicle') {
        typeFilter = ' AND EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      }
      typeFilter += access.extraSql;

      const zoneMatchSelect = access.zoneMatchSql ? `, ${access.zoneMatchSql} AS zone_match` : '';

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS},
                (SELECT GROUP_CONCAT(DISTINCT veh.plate_number)
                 FROM vehicles veh WHERE veh.visit_id = vis.id) AS plate_numbers${zoneMatchSelect}
         FROM visits vis ${VISIT_JOINS}
         WHERE vis.organisation_id = ?
           AND vis.status IN (${statusPlaceholders})${siteFilter}${typeFilter}
         ORDER BY vis.created_at DESC
         LIMIT 50`,
        [...params, ...access.extraParams, ...access.zoneMatchParams],
      );

      res.json({ ok: true, data: shapeVisitsRouterRows(rows, access) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/on-site', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      if (!scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const access = await resolveVisitsRouterAccess(req);
      const visitType = String(req.query.type || 'walk-in').toLowerCase();
      const statusPlaceholders = GATE_CHECKOUT_ELIGIBLE_STATUSES.map(() => '?').join(', ');
      const params = [scope.organisation_id, ...GATE_CHECKOUT_ELIGIBLE_STATUSES];
      let siteFilter = '';
      if (scope.site_id) {
        siteFilter = ' AND vis.site_id = ?';
        params.push(scope.site_id);
      }

      let typeFilter = '';
      if (visitType === 'walking' || visitType === 'walk-in') {
        typeFilter = ' AND NOT EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      } else if (visitType === 'vehicle') {
        typeFilter = ' AND EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      }
      typeFilter += access.extraSql;

      const zoneMatchSelect = access.zoneMatchSql ? `, ${access.zoneMatchSql} AS zone_match` : '';

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS},
                (SELECT GROUP_CONCAT(DISTINCT veh.plate_number)
                 FROM vehicles veh WHERE veh.visit_id = vis.id) AS plate_numbers${zoneMatchSelect}
         FROM visits vis ${VISIT_JOINS}
         WHERE vis.organisation_id = ?
           AND vis.status IN (${statusPlaceholders})${siteFilter}${typeFilter}
         ORDER BY COALESCE(vis.checked_in_at, vis.created_at) DESC
         LIMIT 100`,
        [...params, ...access.extraParams, ...access.zoneMatchParams],
      );

      res.json({ ok: true, data: shapeVisitsRouterRows(rows, access) });
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
        return res.status(400).json({ ok: false, message: 'Visit is not ready for check-in.' });
      }

      // Receptionists may only check in visits for hosts in their assigned zones.
      const receptionZone = await resolveReceptionZoneContext(pool, userId);
      if (receptionZone.isReceptionist) {
        if (!receptionZone.zoneIds.length) {
          return res.status(403).json({
            ok: false,
            message: 'No zones are assigned to this receptionist. Contact your administrator.',
          });
        }
        const visitZoneId = visit.zone_id || await resolveHostZoneId(pool, visit.host_id);
        if (!visitZoneId || !receptionZone.zoneIds.includes(String(visitZoneId))) {
          return res.status(403).json({
            ok: false,
            message: 'This visit belongs to another zone and cannot be checked in at your desk.',
          });
        }
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

      const stampedZoneId = visit.zone_id
        || await resolveHostZoneId(conn, visit.host_id)
        || receptionZone.zoneIds[0]
        || null;

      await conn.query(
        `UPDATE visits
         SET status = 'reception_check_in',
             checked_in_at = NOW(),
             badge_number = ?,
             station_id = COALESCE(?, station_id),
             zone_id = COALESCE(zone_id, ?),
             updated_at = NOW()
         WHERE id = ?`,
        [assignedBadge || visit.badge_number, scope?.station_id, stampedZoneId, visitId],
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
      if (!isGateCheckoutEligible(visit.status)) {
        return res.status(400).json({ ok: false, message: 'Visitor is not checked in.' });
      }

      await pool.query(
        `UPDATE visits SET status = 'checked_out', checked_out_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [visitId],
      );

      await pool.query(
        `UPDATE vehicles SET status = 'exited', exited_at = NOW(), exit_station_id = ?
         WHERE visit_id = ? AND status IN ('on_site', 'arrived_at_gate', 'entry_approved')`,
        [scope?.station_id || null, visitId],
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
      await refreshHostAvailabilityAfterVisit(pool, visit);

      res.json({ ok: true, message: 'Visitor checked out.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/lookup', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const { query, type } = req.body;
      if (!query?.trim()) {
        return res.status(400).json({ ok: false, message: 'Search query required.' });
      }

      const q = `%${query.trim()}%`;
      const params = [scope?.organisation_id, q, q, q, q, q];
      let siteFilter = '';
      if (scope?.site_id) {
        siteFilter = ' AND vis.site_id = ?';
        params.push(scope.site_id);
      }

      let typeFilter = '';
      const visitType = String(type || '').toLowerCase();
      if (visitType === 'walking' || visitType === 'walk-in') {
        typeFilter = ' AND NOT EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      } else if (visitType === 'vehicle') {
        typeFilter = ' AND EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)';
      }

      const [rows] = await pool.query(
        `SELECT ${VISIT_SELECT_FIELDS},
                (SELECT GROUP_CONCAT(DISTINCT veh.plate_number)
                 FROM vehicles veh WHERE veh.visit_id = vis.id) AS plate_numbers
         FROM visits vis ${VISIT_JOINS}
         WHERE vis.organisation_id = ?
           AND (
             v.full_name LIKE ?
             OR v.phone LIKE ?
             OR vis.badge_number LIKE ?
             OR vis.pass_code LIKE ?
             OR EXISTS (
               SELECT 1 FROM vehicles veh
               WHERE veh.visit_id = vis.id AND veh.plate_number LIKE ?
             )
           )${siteFilter}${typeFilter}
         ORDER BY vis.created_at DESC
         LIMIT 20`,
        params,
      );

      const perms = permissionsFromRequest(req);
      const masked = applyVisitListMasking(rows, perms);
      const eligible = masked.filter((row) => CHECK_IN_ELIGIBLE_STATUSES.includes(row.status));
      res.json({ ok: true, data: eligible });
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

      if (toStatus === 'in_meeting') {
        await markHostUnavailableForVisit(pool, visit);
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

function organisationSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Sites, buildings, zones, offices, stations, departments and employees cannot exist without an organisation. */
async function requireOrganisationForStructure(orgId) {
  if (!orgId) {
    return {
      ok: false,
      status: 403,
      message:
        'An organisation is required first. Sites, buildings, zones, offices, stations, departments and employees cannot exist without an organisation.',
    };
  }

  const [[org]] = await pool.query(
    'SELECT id, status FROM organisations WHERE id = ? LIMIT 1',
    [orgId],
  );
  if (!org) {
    return {
      ok: false,
      status: 403,
      message: 'Organisation not found. Create an organisation before adding structure.',
    };
  }
  if (org.status !== 'active') {
    return {
      ok: false,
      status: 403,
      message: 'Organisation is not active. Activate it before adding sites or other structure.',
    };
  }
  return { ok: true, org };
}

const ORGANISATION_SELECT = `
  SELECT o.*,
         (SELECT COUNT(*) FROM sites s WHERE s.organisation_id = o.id) AS site_count,
         (SELECT COUNT(*) FROM buildings b
            INNER JOIN sites s ON s.id = b.site_id
           WHERE s.organisation_id = o.id) AS building_count,
         (SELECT COUNT(*) FROM offices ofc WHERE ofc.organisation_id = o.id) AS office_count,
         (SELECT COUNT(*) FROM departments d WHERE d.organisation_id = o.id) AS department_count,
         (SELECT COUNT(*) FROM hosts h WHERE h.organisation_id = o.id) AS employee_count,
         (SELECT COUNT(*) FROM user_scopes us WHERE us.organisation_id = o.id) AS user_count
  FROM organisations o
`;

export function createOrgAdminRouter() {
  const router = express.Router();

  router.get('/nav-counts', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;

      const countOne = async (scopedSql, scopedParams, unscopedSql) => {
        const [[row]] = orgId
          ? await pool.query(scopedSql, scopedParams)
          : await pool.query(unscopedSql);
        return Number(row?.count || 0);
      };

      const [
        organisations,
        sites,
        buildings,
        zones,
        stations,
        departments,
        offices,
        positions,
        hosts,
        receptionists,
        security_guards,
        users,
      ] = await Promise.all([
        countOne(
          'SELECT COUNT(*) AS count FROM organisations WHERE id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM organisations',
        ),
        countOne(
          'SELECT COUNT(*) AS count FROM sites WHERE organisation_id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM sites',
        ),
        countOne(
          `SELECT COUNT(*) AS count
           FROM buildings b
           JOIN sites s ON s.id = b.site_id
           WHERE s.organisation_id = ?`,
          [orgId],
          'SELECT COUNT(*) AS count FROM buildings',
        ),
        countOne(
          `SELECT COUNT(*) AS count
           FROM zones z
           JOIN buildings b ON b.id = z.building_id
           JOIN sites s ON s.id = b.site_id
           WHERE s.organisation_id = ?`,
          [orgId],
          'SELECT COUNT(*) AS count FROM zones',
        ),
        countOne(
          `SELECT COUNT(*) AS count
           FROM stations st
           INNER JOIN sites s ON s.id = st.site_id
           WHERE s.organisation_id = ?`,
          [orgId],
          'SELECT COUNT(*) AS count FROM stations',
        ),
        countOne(
          'SELECT COUNT(*) AS count FROM departments WHERE organisation_id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM departments',
        ),
        countOne(
          'SELECT COUNT(*) AS count FROM offices WHERE organisation_id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM offices',
        ),
        countOne(
          'SELECT COUNT(*) AS count FROM positions WHERE organisation_id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM positions',
        ),
        countOne(
          'SELECT COUNT(*) AS count FROM hosts WHERE organisation_id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM hosts',
        ),
        countOne(
          'SELECT COUNT(*) AS count FROM receptionists WHERE organisation_id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM receptionists',
        ),
        countOne(
          'SELECT COUNT(*) AS count FROM security_guards WHERE organisation_id = ?',
          [orgId],
          'SELECT COUNT(*) AS count FROM security_guards',
        ),
        pool.query('SELECT COUNT(*) AS count FROM users').then(([[row]]) => Number(row?.count || 0)),
      ]);

      res.json({
        ok: true,
        data: {
          organisations,
          sites,
          buildings,
          zones,
          stations,
          departments,
          offices,
          positions,
          hosts,
          receptionists,
          security_guards,
          users,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/organisations', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      // Platform-wide admins always list every organisation (needed for the org switcher).
      const orgId = hasPlatformWideAccess(req.adminClaims) ? null : scope?.organisation_id;
      const [rows] = orgId
        ? await pool.query(`${ORGANISATION_SELECT} WHERE o.id = ? ORDER BY o.name`, [orgId])
        : await pool.query(`${ORGANISATION_SELECT} ORDER BY o.name`);

      const stats = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        inactive: rows.filter((row) => row.status !== 'active').length,
        sites: rows.reduce((sum, row) => sum + Number(row.site_count || 0), 0),
        employees: rows.reduce((sum, row) => sum + Number(row.employee_count || 0), 0),
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/organisations/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const scopedOrgId = hasPlatformWideAccess(req.adminClaims) ? null : scope?.organisation_id;
      const targetId = req.params.id;

      if (scopedOrgId && scopedOrgId !== targetId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this organisation.' });
      }

      const [[row]] = await pool.query(`${ORGANISATION_SELECT} WHERE o.id = ? LIMIT 1`, [targetId]);
      if (!row) {
        return res.status(404).json({ ok: false, message: 'Organisation not found.' });
      }

      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/organisations', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      // Scoped org admins manage their company; creating additional companies is for group/platform admins.
      if (scope?.organisation_id && !hasPlatformWideAccess(req.adminClaims)) {
        return res.status(403).json({
          ok: false,
          message: 'Creating organisations requires group or platform administrator access.',
        });
      }

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

      const [[row]] = await pool.query(`${ORGANISATION_SELECT} WHERE o.id = ?`, [id]);
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/organisations/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const targetId = req.params.id;

      if (orgId && orgId !== targetId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this organisation.' });
      }

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
        'UPDATE organisations SET name = ?, slug = ?, status = ?, timezone = ? WHERE id = ?',
        [name, slug, status, timezone, targetId],
      );

      const [[row]] = await pool.query(`${ORGANISATION_SELECT} WHERE o.id = ?`, [targetId]);
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/sites', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT s.*,
               o.name AS organisation_name,
               (SELECT COUNT(*) FROM stations st WHERE st.site_id = s.id) AS station_count,
               (SELECT COUNT(*) FROM buildings b WHERE b.site_id = s.id) AS building_count,
               (SELECT COUNT(*) FROM offices ofc WHERE ofc.site_id = s.id) AS office_count,
               (SELECT COUNT(*) FROM hosts h WHERE h.site_id = s.id) AS employee_count
        FROM sites s
        LEFT JOIN organisations o ON o.id = s.organisation_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE s.organisation_id = ? ORDER BY s.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, s.name`);

      const stats = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        inactive: rows.filter((row) => row.status !== 'active').length,
        stations: rows.reduce((sum, row) => sum + Number(row.station_count || 0), 0),
        employees: rows.reduce((sum, row) => sum + Number(row.employee_count || 0), 0),
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/sites', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const orgGate = await requireOrganisationForStructure(orgId);
      if (!orgGate.ok) {
        return res.status(orgGate.status).json({ ok: false, message: orgGate.message });
      }

      const name = String(req.body?.name || '').trim();
      const code = String(req.body?.code || '').trim().toUpperCase() || null;
      const address = String(req.body?.address || '').trim() || null;
      const status = String(req.body?.status || 'active').trim() || 'active';
      if (!name) {
        return res.status(400).json({ ok: false, message: 'Site name is required.' });
      }

      const id = generateId('site');
      await pool.query(
        `INSERT INTO sites (id, organisation_id, name, code, address, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, orgId, name, code, address, status],
      );

      const [[row]] = await pool.query(
        `SELECT s.*,
                o.name AS organisation_name,
                0 AS station_count,
                0 AS building_count,
                0 AS office_count,
                0 AS employee_count
         FROM sites s
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE s.id = ?`,
        [id],
      );
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/sites/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const siteId = req.params.id;

      const [[row]] = await pool.query(
        `SELECT s.*,
                o.name AS organisation_name,
                (SELECT COUNT(*) FROM stations st WHERE st.site_id = s.id) AS station_count,
                (SELECT COUNT(*) FROM buildings b WHERE b.site_id = s.id) AS building_count,
                (SELECT COUNT(*) FROM offices ofc WHERE ofc.site_id = s.id) AS office_count,
                (SELECT COUNT(*) FROM hosts h WHERE h.site_id = s.id) AS employee_count
         FROM sites s
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE s.id = ?
         LIMIT 1`,
        [siteId],
      );
      if (!row) {
        return res.status(404).json({ ok: false, message: 'Site not found.' });
      }
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this site.' });
      }
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/sites/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const siteId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM sites WHERE id = ? LIMIT 1', [siteId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Site not found.' });
      }
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this site.' });
      }

      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const code = req.body?.code != null ? String(req.body.code).trim().toUpperCase() || null : existing.code;
      const address = req.body?.address != null ? String(req.body.address).trim() || null : existing.address;
      const status = req.body?.status != null ? String(req.body.status).trim() || existing.status : existing.status;
      if (!name) {
        return res.status(400).json({ ok: false, message: 'Site name is required.' });
      }

      await pool.query(
        'UPDATE sites SET name = ?, code = ?, address = ?, status = ? WHERE id = ?',
        [name, code, address, status, siteId],
      );

      const [[row]] = await pool.query(
        `SELECT s.*,
                o.name AS organisation_name,
                (SELECT COUNT(*) FROM stations st WHERE st.site_id = s.id) AS station_count,
                (SELECT COUNT(*) FROM buildings b WHERE b.site_id = s.id) AS building_count,
                (SELECT COUNT(*) FROM offices ofc WHERE ofc.site_id = s.id) AS office_count,
                (SELECT COUNT(*) FROM hosts h WHERE h.site_id = s.id) AS employee_count
         FROM sites s
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE s.id = ?`,
        [siteId],
      );
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/stations', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT st.*,
               s.name AS site_name,
               s.code AS site_code,
               s.organisation_id,
               o.name AS organisation_name
        FROM stations st
        JOIN sites s ON s.id = st.site_id
        LEFT JOIN organisations o ON o.id = s.organisation_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE s.organisation_id = ? ORDER BY s.name, st.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, s.name, st.name`);

      const stats = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        gates: rows.filter((row) => row.type === 'gate').length,
        reception: rows.filter((row) => row.type === 'reception').length,
        sites: new Set(rows.map((row) => row.site_id).filter(Boolean)).size,
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Station / Gate → Site → Organisation
  router.post('/stations', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id
        || String(req.body?.organisationId || req.body?.organisation_id || '').trim()
        || null;
      const siteId = String(req.body?.siteId || req.body?.site_id || '').trim();
      const name = String(req.body?.name || '').trim();
      const type = String(req.body?.type || 'reception').trim() || 'reception';
      const status = String(req.body?.status || 'active').trim() || 'active';

      if (!name) return res.status(400).json({ ok: false, message: 'Station name is required.' });
      if (!siteId) return res.status(400).json({ ok: false, message: 'Site is required for a station or gate.' });

      const placement = await assertStationPlacement(pool, { organisationId: orgId, siteId });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      const id = generateId('stn');
      await pool.query(
        `INSERT INTO stations (id, site_id, name, type, status) VALUES (?, ?, ?, ?, ?)`,
        [id, siteId, name, type, status],
      );

      const [[row]] = await pool.query(
        `SELECT st.*, s.name AS site_name, s.code AS site_code, s.organisation_id, o.name AS organisation_name
         FROM stations st
         JOIN sites s ON s.id = st.site_id
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE st.id = ?`,
        [id],
      );
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/stations/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const stationId = req.params.id;

      const [[row]] = await pool.query(
        `SELECT st.*,
                s.name AS site_name,
                s.code AS site_code,
                s.organisation_id,
                o.name AS organisation_name
         FROM stations st
         JOIN sites s ON s.id = st.site_id
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE st.id = ?
         LIMIT 1`,
        [stationId],
      );
      if (!row) return res.status(404).json({ ok: false, message: 'Station not found.' });
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this station.' });
      }
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/stations/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const stationId = req.params.id;

      const [[existing]] = await pool.query(
        `SELECT st.*, s.organisation_id
         FROM stations st
         JOIN sites s ON s.id = st.site_id
         WHERE st.id = ?
         LIMIT 1`,
        [stationId],
      );
      if (!existing) return res.status(404).json({ ok: false, message: 'Station not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this station.' });
      }

      const siteId = req.body?.siteId != null || req.body?.site_id != null
        ? String(req.body.siteId || req.body.site_id || '').trim()
        : existing.site_id;
      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const type = req.body?.type != null ? String(req.body.type).trim() || existing.type : existing.type;
      const status = req.body?.status != null ? String(req.body.status).trim() || existing.status : existing.status;
      if (!name) return res.status(400).json({ ok: false, message: 'Station name is required.' });

      const placement = await assertStationPlacement(pool, {
        organisationId: existing.organisation_id,
        siteId,
      });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      await pool.query(
        'UPDATE stations SET site_id = ?, name = ?, type = ?, status = ? WHERE id = ?',
        [siteId, name, type, status, stationId],
      );

      const [[row]] = await pool.query(
        `SELECT st.*, s.name AS site_name, s.code AS site_code, s.organisation_id, o.name AS organisation_name
         FROM stations st
         JOIN sites s ON s.id = st.site_id
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE st.id = ?`,
        [stationId],
      );
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/buildings', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT b.*,
               s.name AS site_name,
               s.organisation_id,
               (SELECT COUNT(*) FROM zones z WHERE z.building_id = b.id) AS zone_count
        FROM buildings b
        JOIN sites s ON s.id = b.site_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE s.organisation_id = ? ORDER BY s.name, b.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY s.name, b.name`);
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/buildings', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const orgGate = await requireOrganisationForStructure(orgId);
      if (!orgGate.ok) {
        return res.status(orgGate.status).json({ ok: false, message: orgGate.message });
      }

      const name = String(req.body?.name || '').trim();
      const siteId = String(req.body?.siteId || req.body?.site_id || '').trim();
      if (!name) return res.status(400).json({ ok: false, message: 'Building name is required.' });
      if (!siteId) return res.status(400).json({ ok: false, message: 'Site is required.' });

      const [[site]] = await pool.query(
        'SELECT id FROM sites WHERE id = ? AND organisation_id = ? LIMIT 1',
        [siteId, orgId],
      );
      if (!site) return res.status(400).json({ ok: false, message: 'Site not found in this organisation.' });

      const id = generateId('bld');
      await pool.query('INSERT INTO buildings (id, site_id, name) VALUES (?, ?, ?)', [id, siteId, name]);
      const [[row]] = await pool.query(
        `SELECT b.*, s.name AS site_name, s.organisation_id, 0 AS zone_count
         FROM buildings b JOIN sites s ON s.id = b.site_id WHERE b.id = ?`,
        [id],
      );
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/buildings/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const buildingId = req.params.id;

      const [[existing]] = await pool.query(
        `SELECT b.*, s.organisation_id, s.name AS site_name
         FROM buildings b
         JOIN sites s ON s.id = b.site_id
         WHERE b.id = ?
         LIMIT 1`,
        [buildingId],
      );
      if (!existing) return res.status(404).json({ ok: false, message: 'Building not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this building.' });
      }

      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const siteId = req.body?.siteId != null || req.body?.site_id != null
        ? String(req.body.siteId || req.body.site_id || '').trim()
        : existing.site_id;

      if (!name) return res.status(400).json({ ok: false, message: 'Building name is required.' });
      if (!siteId) return res.status(400).json({ ok: false, message: 'Site is required.' });

      if (siteId !== existing.site_id) {
        const [[site]] = await pool.query(
          'SELECT id FROM sites WHERE id = ? AND organisation_id = ? LIMIT 1',
          [siteId, existing.organisation_id],
        );
        if (!site) {
          return res.status(400).json({ ok: false, message: 'Site not found in this organisation.' });
        }
      }

      await pool.query('UPDATE buildings SET name = ?, site_id = ? WHERE id = ?', [name, siteId, buildingId]);
      const [[row]] = await pool.query(
        `SELECT b.*,
                s.name AS site_name,
                s.organisation_id,
                (SELECT COUNT(*) FROM zones z WHERE z.building_id = b.id) AS zone_count
         FROM buildings b
         JOIN sites s ON s.id = b.site_id
         WHERE b.id = ?`,
        [buildingId],
      );
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/buildings/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const buildingId = req.params.id;

      const [[existing]] = await pool.query(
        `SELECT b.*, s.organisation_id
         FROM buildings b
         JOIN sites s ON s.id = b.site_id
         WHERE b.id = ?
         LIMIT 1`,
        [buildingId],
      );
      if (!existing) return res.status(404).json({ ok: false, message: 'Building not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this building.' });
      }

      const [[zoneCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM zones WHERE building_id = ?',
        [buildingId],
      );
      if (Number(zoneCount?.count || 0) > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Remove or reassign zones in this building before deleting it.',
        });
      }

      const [[officeCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM offices WHERE building_id = ?',
        [buildingId],
      );
      if (Number(officeCount?.count || 0) > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Remove or reassign offices in this building before deleting it.',
        });
      }

      await pool.query('DELETE FROM buildings WHERE id = ?', [buildingId]);
      res.json({ ok: true, message: 'Building deleted.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/zones', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT z.*,
               b.name AS building_name,
               b.site_id,
               s.name AS site_name,
               s.organisation_id,
               o.name AS organisation_name,
               (SELECT COUNT(*) FROM offices ofc WHERE ofc.building_id = b.id) AS office_count
        FROM zones z
        JOIN buildings b ON b.id = z.building_id
        JOIN sites s ON s.id = b.site_id
        LEFT JOIN organisations o ON o.id = s.organisation_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE s.organisation_id = ? ORDER BY s.name, b.name, z.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, s.name, b.name, z.name`);

      const [[buildingCount]] = orgId
        ? await pool.query(
          `SELECT COUNT(*) AS count
           FROM buildings b
           JOIN sites s ON s.id = b.site_id
           WHERE s.organisation_id = ?`,
          [orgId],
        )
        : await pool.query('SELECT COUNT(*) AS count FROM buildings');

      const stats = {
        total: rows.length,
        buildings: Number(buildingCount?.count || 0),
        public: rows.filter((row) => row.access_level === 'public').length,
        staff: rows.filter((row) => row.access_level === 'staff' || row.access_level === 'staff-only').length,
        restricted: rows.filter((row) => ['restricted', 'high-security', 'high_security'].includes(row.access_level)).length,
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/zones', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const orgGate = await requireOrganisationForStructure(orgId);
      if (!orgGate.ok) {
        return res.status(orgGate.status).json({ ok: false, message: orgGate.message });
      }

      const name = String(req.body?.name || '').trim();
      const buildingId = String(req.body?.buildingId || req.body?.building_id || '').trim();
      const accessLevel = String(req.body?.accessLevel || req.body?.access_level || 'public').trim() || 'public';
      if (!name) return res.status(400).json({ ok: false, message: 'Zone name is required.' });
      if (!buildingId) return res.status(400).json({ ok: false, message: 'Building is required.' });

      const [[building]] = await pool.query(
        `SELECT b.id FROM buildings b
         JOIN sites s ON s.id = b.site_id
         WHERE b.id = ? AND s.organisation_id = ?
         LIMIT 1`,
        [buildingId, orgId],
      );
      if (!building) return res.status(400).json({ ok: false, message: 'Building not found in this organisation.' });

      const id = generateId('zone');
      await pool.query(
        'INSERT INTO zones (id, building_id, name, access_level) VALUES (?, ?, ?, ?)',
        [id, buildingId, name, accessLevel],
      );
      const [[row]] = await pool.query(
        `SELECT z.*, b.name AS building_name, b.site_id, s.name AS site_name, s.organisation_id, o.name AS organisation_name
         FROM zones z
         JOIN buildings b ON b.id = z.building_id
         JOIN sites s ON s.id = b.site_id
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE z.id = ?`,
        [id],
      );
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/zones/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const zoneId = req.params.id;

      const [[row]] = await pool.query(
        `SELECT z.*,
               b.name AS building_name,
               b.site_id,
               s.name AS site_name,
               s.organisation_id,
               o.name AS organisation_name,
               (SELECT COUNT(*) FROM offices ofc WHERE ofc.building_id = b.id) AS office_count
         FROM zones z
         JOIN buildings b ON b.id = z.building_id
         JOIN sites s ON s.id = b.site_id
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE z.id = ?
         LIMIT 1`,
        [zoneId],
      );
      if (!row) return res.status(404).json({ ok: false, message: 'Zone not found.' });
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this zone.' });
      }
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/zones/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const zoneId = req.params.id;

      const [[existing]] = await pool.query(
        `SELECT z.*, s.organisation_id
         FROM zones z
         JOIN buildings b ON b.id = z.building_id
         JOIN sites s ON s.id = b.site_id
         WHERE z.id = ?
         LIMIT 1`,
        [zoneId],
      );
      if (!existing) return res.status(404).json({ ok: false, message: 'Zone not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this zone.' });
      }

      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const buildingId = req.body?.buildingId != null || req.body?.building_id != null
        ? String(req.body.buildingId || req.body.building_id).trim()
        : existing.building_id;
      const accessLevel = req.body?.accessLevel != null || req.body?.access_level != null
        ? String(req.body.accessLevel || req.body.access_level).trim() || existing.access_level
        : existing.access_level;

      if (!name) return res.status(400).json({ ok: false, message: 'Zone name is required.' });

      if (buildingId !== existing.building_id) {
        const [[building]] = await pool.query(
          `SELECT b.id FROM buildings b
           JOIN sites s ON s.id = b.site_id
           WHERE b.id = ? AND s.organisation_id = ?
           LIMIT 1`,
          [buildingId, existing.organisation_id],
        );
        if (!building) return res.status(400).json({ ok: false, message: 'Building not found in this organisation.' });
      }

      await pool.query(
        'UPDATE zones SET name = ?, building_id = ?, access_level = ? WHERE id = ?',
        [name, buildingId, accessLevel, zoneId],
      );

      const [[row]] = await pool.query(
        `SELECT z.*, b.name AS building_name, b.site_id, s.name AS site_name, s.organisation_id, o.name AS organisation_name
         FROM zones z
         JOIN buildings b ON b.id = z.building_id
         JOIN sites s ON s.id = b.site_id
         LEFT JOIN organisations o ON o.id = s.organisation_id
         WHERE z.id = ?`,
        [zoneId],
      );
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/zones/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const zoneId = req.params.id;

      const [[existing]] = await pool.query(
        `SELECT z.*, s.organisation_id
         FROM zones z
         JOIN buildings b ON b.id = z.building_id
         JOIN sites s ON s.id = b.site_id
         WHERE z.id = ?
         LIMIT 1`,
        [zoneId],
      );
      if (!existing) return res.status(404).json({ ok: false, message: 'Zone not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this zone.' });
      }

      const [[officeCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM offices WHERE zone_id = ?',
        [zoneId],
      );
      if (Number(officeCount?.count || 0) > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Remove or reassign offices in this zone before deleting it.',
        });
      }

      const [[hostCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM hosts WHERE zone_id = ?',
        [zoneId],
      );
      if (Number(hostCount?.count || 0) > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Remove or reassign hosts linked to this zone before deleting it.',
        });
      }

      let receptionistLinked = 0;
      try {
        const [[rzCount]] = await pool.query(
          'SELECT COUNT(*) AS count FROM receptionist_zones WHERE zone_id = ?',
          [zoneId],
        );
        receptionistLinked += Number(rzCount?.count || 0);
      } catch {
        // receptionist_zones may not exist on older schemas.
      }
      const [[rCount]] = await pool.query(
        'SELECT COUNT(*) AS count FROM receptionists WHERE zone_id = ?',
        [zoneId],
      );
      receptionistLinked += Number(rCount?.count || 0);
      if (receptionistLinked > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Remove or reassign receptionists covering this zone before deleting it.',
        });
      }

      try {
        await pool.query('DELETE FROM receptionist_zones WHERE zone_id = ?', [zoneId]);
      } catch {
        // Ignore if junction table missing.
      }
      await pool.query('DELETE FROM zones WHERE id = ?', [zoneId]);
      res.json({ ok: true, message: 'Zone deleted.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Configurable role→zone fallback mapping (Logic.md: "CEO → CEO - Reception" etc.),
  // used only when a host has no explicit zone/office zone assigned.
  const HOST_ROLE_ZONE_DEFAULT_SLUGS = ['ceo', 'dceo', 'host'];

  router.get('/host-role-zone-defaults', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) {
        return res.status(400).json({ ok: false, message: 'Organisation is required.' });
      }
      const [rows] = await pool.query(
        `SELECT d.organisation_id, d.role_slug, d.zone_id, z.name AS zone_name,
                b.name AS building_name
         FROM host_role_zone_defaults d
         LEFT JOIN zones z ON z.id = d.zone_id
         LEFT JOIN buildings b ON b.id = z.building_id
         WHERE d.organisation_id = ?
         ORDER BY d.role_slug`,
        [orgId],
      );
      res.json({ ok: true, data: rows, roleSlugs: HOST_ROLE_ZONE_DEFAULT_SLUGS });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.put('/host-role-zone-defaults/:roleSlug', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) {
        return res.status(400).json({ ok: false, message: 'Organisation is required.' });
      }
      const roleSlug = normalizeHostPortalRole(req.params.roleSlug);
      if (!HOST_ROLE_ZONE_DEFAULT_SLUGS.includes(roleSlug)) {
        return res.status(400).json({ ok: false, message: 'Unknown host portal role.' });
      }
      const zoneId = String(req.body?.zoneId || req.body?.zone_id || '').trim();
      if (!zoneId) {
        return res.status(400).json({ ok: false, message: 'zoneId is required.' });
      }
      const zone = await loadZoneInOrg(pool, zoneId, orgId);
      if (!zone) {
        return res.status(400).json({ ok: false, message: 'Zone was not found in this organisation.' });
      }

      await pool.query(
        `INSERT INTO host_role_zone_defaults (organisation_id, role_slug, zone_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE zone_id = VALUES(zone_id)`,
        [orgId, roleSlug, zoneId],
      );

      res.json({ ok: true, data: { organisationId: orgId, roleSlug, zoneId } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/host-role-zone-defaults/:roleSlug', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      if (!orgId) {
        return res.status(400).json({ ok: false, message: 'Organisation is required.' });
      }
      const roleSlug = normalizeHostPortalRole(req.params.roleSlug);
      await pool.query(
        'DELETE FROM host_role_zone_defaults WHERE organisation_id = ? AND role_slug = ?',
        [orgId, roleSlug],
      );
      res.json({ ok: true, message: 'Default mapping removed.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/departments', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT d.*,
               o.name AS organisation_name,
               (SELECT COUNT(*) FROM offices ofc WHERE ofc.department_id = d.id) AS office_count,
               (SELECT COUNT(*) FROM hosts h WHERE h.department_id = d.id) AS employee_count
        FROM departments d
        LEFT JOIN organisations o ON o.id = d.organisation_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE d.organisation_id = ? ORDER BY d.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, d.name`);

      const stats = {
        total: rows.length,
        offices: rows.reduce((sum, row) => sum + Number(row.office_count || 0), 0),
        employees: rows.reduce((sum, row) => sum + Number(row.employee_count || 0), 0),
        organisations: new Set(rows.map((row) => row.organisation_id).filter(Boolean)).size,
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Department belongs directly to an organisation (no site/building required).
  router.post('/departments', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id
        || String(req.body?.organisationId || req.body?.organisation_id || '').trim()
        || null;
      const orgGate = await requireOrganisationForStructure(orgId);
      if (!orgGate.ok) {
        return res.status(orgGate.status).json({ ok: false, message: orgGate.message });
      }

      const name = String(req.body?.name || '').trim();
      const code = String(req.body?.code || '').trim().toUpperCase() || null;
      if (!name) {
        return res.status(400).json({ ok: false, message: 'Department name is required.' });
      }

      const id = generateId('dept');
      await pool.query(
        `INSERT INTO departments (id, organisation_id, name, code) VALUES (?, ?, ?, ?)`,
        [id, orgId, name, code],
      );

      const [[row]] = await pool.query(
        `SELECT d.*,
                o.name AS organisation_name,
                0 AS office_count,
                0 AS employee_count
         FROM departments d
         LEFT JOIN organisations o ON o.id = d.organisation_id
         WHERE d.id = ?`,
        [id],
      );
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/departments/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const departmentId = req.params.id;

      const [[row]] = await pool.query(
        `SELECT d.*,
                o.name AS organisation_name,
                (SELECT COUNT(*) FROM offices ofc WHERE ofc.department_id = d.id) AS office_count,
                (SELECT COUNT(*) FROM hosts h WHERE h.department_id = d.id) AS employee_count
         FROM departments d
         LEFT JOIN organisations o ON o.id = d.organisation_id
         WHERE d.id = ?
         LIMIT 1`,
        [departmentId],
      );
      if (!row) {
        return res.status(404).json({ ok: false, message: 'Department not found.' });
      }
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this department.' });
      }
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/departments/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const departmentId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM departments WHERE id = ? LIMIT 1', [departmentId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Department not found.' });
      }
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this department.' });
      }

      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const code = req.body?.code != null
        ? String(req.body.code).trim().toUpperCase() || null
        : existing.code;
      if (!name) {
        return res.status(400).json({ ok: false, message: 'Department name is required.' });
      }

      await pool.query('UPDATE departments SET name = ?, code = ? WHERE id = ?', [name, code, departmentId]);

      const [[row]] = await pool.query(
        `SELECT d.*,
                o.name AS organisation_name,
                (SELECT COUNT(*) FROM offices ofc WHERE ofc.department_id = d.id) AS office_count,
                (SELECT COUNT(*) FROM hosts h WHERE h.department_id = d.id) AS employee_count
         FROM departments d
         LEFT JOIN organisations o ON o.id = d.organisation_id
         WHERE d.id = ?`,
        [departmentId],
      );
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/positions', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT p.*,
               o.name AS organisation_name,
               (SELECT COUNT(*) FROM hosts h WHERE h.position_id = p.id) AS host_count
        FROM positions p
        LEFT JOIN organisations o ON o.id = p.organisation_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE p.organisation_id = ? ORDER BY p.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, p.name`);

      const stats = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        inactive: rows.filter((row) => row.status !== 'active').length,
        organisations: new Set(rows.map((row) => row.organisation_id).filter(Boolean)).size,
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/positions/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const positionId = req.params.id;

      const [[row]] = await pool.query(
        `SELECT p.*,
                o.name AS organisation_name,
                (SELECT COUNT(*) FROM hosts h WHERE h.position_id = p.id) AS host_count
         FROM positions p
         LEFT JOIN organisations o ON o.id = p.organisation_id
         WHERE p.id = ?
         LIMIT 1`,
        [positionId],
      );
      if (!row) {
        return res.status(404).json({ ok: false, message: 'Position not found.' });
      }
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this position.' });
      }

      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Position belongs directly to an organisation (job title / role label).
  router.post('/positions', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id
        || String(req.body?.organisationId || req.body?.organisation_id || '').trim()
        || null;
      const orgGate = await requireOrganisationForStructure(orgId);
      if (!orgGate.ok) {
        return res.status(orgGate.status).json({ ok: false, message: orgGate.message });
      }

      const name = String(req.body?.name || '').trim();
      const code = String(req.body?.code || '').trim().toUpperCase() || null;
      const status = String(req.body?.status || 'active').trim().toLowerCase() === 'inactive'
        ? 'inactive'
        : 'active';
      if (!name) {
        return res.status(400).json({ ok: false, message: 'Position name is required.' });
      }

      const id = generateId('pos');
      await pool.query(
        `INSERT INTO positions (id, organisation_id, name, code, status) VALUES (?, ?, ?, ?, ?)`,
        [id, orgId, name, code, status],
      );

      const [[row]] = await pool.query(
        `SELECT p.*,
                o.name AS organisation_name,
                0 AS host_count
         FROM positions p
         LEFT JOIN organisations o ON o.id = p.organisation_id
         WHERE p.id = ?`,
        [id],
      );
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/positions/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const positionId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM positions WHERE id = ? LIMIT 1', [positionId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Position not found.' });
      }
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this position.' });
      }

      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const code = req.body?.code != null
        ? String(req.body.code).trim().toUpperCase() || null
        : existing.code;
      const status = req.body?.status != null
        ? (String(req.body.status).trim().toLowerCase() === 'inactive' ? 'inactive' : 'active')
        : existing.status;
      if (!name) {
        return res.status(400).json({ ok: false, message: 'Position name is required.' });
      }

      await pool.query(
        'UPDATE positions SET name = ?, code = ?, status = ? WHERE id = ?',
        [name, code, status, positionId],
      );

      const [[row]] = await pool.query(
        `SELECT p.*,
                o.name AS organisation_name,
                (SELECT COUNT(*) FROM hosts h WHERE h.position_id = p.id) AS host_count
         FROM positions p
         LEFT JOIN organisations o ON o.id = p.organisation_id
         WHERE p.id = ?`,
        [positionId],
      );
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/positions/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const positionId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM positions WHERE id = ? LIMIT 1', [positionId]);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Position not found.' });
      }
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this position.' });
      }

      const [[usage]] = await pool.query(
        'SELECT COUNT(*) AS count FROM hosts WHERE position_id = ?',
        [positionId],
      );
      const hostCount = Number(usage?.count || 0);
      if (hostCount > 0) {
        await pool.query('UPDATE hosts SET position_id = NULL WHERE position_id = ?', [positionId]);
      }

      await pool.query('DELETE FROM positions WHERE id = ?', [positionId]);
      res.json({
        ok: true,
        message: hostCount > 0
          ? `Position deleted. Cleared from ${hostCount} host${hostCount === 1 ? '' : 's'}.`
          : 'Position deleted.',
        data: { id: positionId, hostsCleared: hostCount },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/offices', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT ofc.*,
               d.name AS department_name,
               d.code AS department_code,
               o.name AS organisation_name,
               b.name AS building_name,
               z.name AS zone_name,
               z.access_level AS zone_access_level,
               s.name AS site_name,
               (SELECT COUNT(*) FROM hosts h WHERE h.office_id = ofc.id) AS employee_count
        FROM offices ofc
        LEFT JOIN departments d ON d.id = ofc.department_id
        LEFT JOIN organisations o ON o.id = ofc.organisation_id
        LEFT JOIN buildings b ON b.id = ofc.building_id
        LEFT JOIN zones z ON z.id = ofc.zone_id
        LEFT JOIN sites s ON s.id = COALESCE(ofc.site_id, b.site_id)
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE ofc.organisation_id = ? ORDER BY d.name, ofc.office_number`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, d.name, ofc.office_number`);

      const stats = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        buildings: new Set(rows.map((row) => row.building_id).filter(Boolean)).size,
        zones: new Set(rows.map((row) => row.zone_id).filter(Boolean)).size,
        departments: new Set(rows.map((row) => row.department_id).filter(Boolean)).size,
        employees: rows.reduce((sum, row) => sum + Number(row.employee_count || 0), 0),
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Office → Zone + Building + Department (+ Organisation); site inherited from building/zone
  router.post('/offices', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id
        || String(req.body?.organisationId || req.body?.organisation_id || '').trim()
        || null;
      const departmentId = String(req.body?.departmentId || req.body?.department_id || '').trim();
      const buildingId = String(req.body?.buildingId || req.body?.building_id || '').trim() || null;
      const zoneId = String(req.body?.zoneId || req.body?.zone_id || '').trim();
      const officeNumber = String(req.body?.officeNumber || req.body?.office_number || '').trim();
      const name = String(req.body?.name || '').trim() || null;
      const status = String(req.body?.status || 'active').trim() || 'active';

      if (!officeNumber) {
        return res.status(400).json({ ok: false, message: 'Office number is required.' });
      }
      if (!departmentId) {
        return res.status(400).json({ ok: false, message: 'Department is required for an office.' });
      }
      if (!zoneId) {
        return res.status(400).json({ ok: false, message: 'Zone is required for an office.' });
      }

      const placement = await assertOfficePlacement(pool, {
        organisationId: orgId,
        departmentId,
        buildingId,
        zoneId,
      });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      const id = generateId('ofc');
      try {
        await pool.query(
          `INSERT INTO offices (id, organisation_id, department_id, building_id, zone_id, site_id, office_number, name, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, orgId, departmentId, placement.buildingId, placement.zoneId, placement.siteId, officeNumber, name, status],
        );
      } catch (error) {
        if (String(error?.code) === 'ER_DUP_ENTRY') {
          return res.status(409).json({ ok: false, message: 'Office number already exists in this organisation.' });
        }
        throw error;
      }

      const [[row]] = await pool.query(
        `SELECT ofc.*,
                d.name AS department_name,
                d.code AS department_code,
                o.name AS organisation_name,
                b.name AS building_name,
                z.name AS zone_name,
                z.access_level AS zone_access_level,
                s.name AS site_name,
                0 AS employee_count
         FROM offices ofc
         LEFT JOIN departments d ON d.id = ofc.department_id
         LEFT JOIN organisations o ON o.id = ofc.organisation_id
         LEFT JOIN buildings b ON b.id = ofc.building_id
         LEFT JOIN zones z ON z.id = ofc.zone_id
         LEFT JOIN sites s ON s.id = COALESCE(ofc.site_id, b.site_id)
         WHERE ofc.id = ?`,
        [id],
      );
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/offices/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const officeId = req.params.id;

      const [[row]] = await pool.query(
        `SELECT ofc.*,
               d.name AS department_name,
               d.code AS department_code,
               o.name AS organisation_name,
               b.name AS building_name,
               z.name AS zone_name,
               z.access_level AS zone_access_level,
               s.name AS site_name,
               (SELECT COUNT(*) FROM hosts h WHERE h.office_id = ofc.id) AS employee_count
         FROM offices ofc
         LEFT JOIN departments d ON d.id = ofc.department_id
         LEFT JOIN organisations o ON o.id = ofc.organisation_id
         LEFT JOIN buildings b ON b.id = ofc.building_id
         LEFT JOIN zones z ON z.id = ofc.zone_id
         LEFT JOIN sites s ON s.id = COALESCE(ofc.site_id, b.site_id)
         WHERE ofc.id = ?
         LIMIT 1`,
        [officeId],
      );
      if (!row) return res.status(404).json({ ok: false, message: 'Office not found.' });
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this office.' });
      }
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/offices/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const officeId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM offices WHERE id = ? LIMIT 1', [officeId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Office not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this office.' });
      }

      const departmentId = req.body?.departmentId != null || req.body?.department_id != null
        ? String(req.body.departmentId || req.body.department_id || '').trim()
        : existing.department_id;
      const buildingId = req.body?.buildingId != null || req.body?.building_id != null
        ? String(req.body.buildingId || req.body.building_id || '').trim() || null
        : existing.building_id;
      const zoneId = req.body?.zoneId != null || req.body?.zone_id != null
        ? String(req.body.zoneId || req.body.zone_id || '').trim()
        : existing.zone_id;
      const officeNumber = req.body?.officeNumber != null || req.body?.office_number != null
        ? String(req.body.officeNumber || req.body.office_number || '').trim()
        : existing.office_number;
      const name = req.body?.name != null ? String(req.body.name).trim() || null : existing.name;
      const status = req.body?.status != null
        ? String(req.body.status).trim() || existing.status
        : existing.status;

      if (!officeNumber) {
        return res.status(400).json({ ok: false, message: 'Office number is required.' });
      }

      const placement = await assertOfficePlacement(pool, {
        organisationId: existing.organisation_id,
        departmentId,
        buildingId,
        zoneId,
      });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      try {
        await pool.query(
          `UPDATE offices
           SET department_id = ?, building_id = ?, zone_id = ?, site_id = ?, office_number = ?, name = ?, status = ?
           WHERE id = ?`,
          [departmentId, placement.buildingId, placement.zoneId, placement.siteId, officeNumber, name, status, officeId],
        );
      } catch (error) {
        if (String(error?.code) === 'ER_DUP_ENTRY') {
          return res.status(409).json({ ok: false, message: 'Office number already exists in this organisation.' });
        }
        throw error;
      }

      const [[row]] = await pool.query(
        `SELECT ofc.*,
                d.name AS department_name,
                d.code AS department_code,
                o.name AS organisation_name,
                b.name AS building_name,
                z.name AS zone_name,
                z.access_level AS zone_access_level,
                s.name AS site_name,
                (SELECT COUNT(*) FROM hosts h WHERE h.office_id = ofc.id) AS employee_count
         FROM offices ofc
         LEFT JOIN departments d ON d.id = ofc.department_id
         LEFT JOIN organisations o ON o.id = ofc.organisation_id
         LEFT JOIN buildings b ON b.id = ofc.building_id
         LEFT JOIN zones z ON z.id = ofc.zone_id
         LEFT JOIN sites s ON s.id = COALESCE(ofc.site_id, b.site_id)
         WHERE ofc.id = ?`,
        [officeId],
      );
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/hosts', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const hostSelect = `
        SELECT h.*,
               COALESCE(d.name, od.name) AS department_name,
               ofc.office_number,
               ofc.name AS office_name,
               s.name AS site_name,
               o.name AS organisation_name,
               p.name AS position_name,
               z.name AS zone_name,
               (
                 SELECT ar.slug
                 FROM user_admin_roles uar
                 INNER JOIN admin_roles ar ON ar.id = uar.role_id
                 WHERE uar.user_id = h.user_id
                   AND ar.slug IN ('ceo', 'dceo', 'host')
                 ORDER BY CASE ar.slug
                   WHEN 'ceo' THEN 1
                   WHEN 'dceo' THEN 2
                   WHEN 'host' THEN 3
                   ELSE 4
                 END
                 LIMIT 1
               ) AS portal_role
        FROM hosts h
        LEFT JOIN offices ofc ON ofc.id = h.office_id
        LEFT JOIN departments d ON d.id = h.department_id
        LEFT JOIN departments od ON od.id = ofc.department_id
        LEFT JOIN sites s ON s.id = COALESCE(h.site_id, ofc.site_id)
        LEFT JOIN organisations o ON o.id = h.organisation_id
        LEFT JOIN positions p ON p.id = h.position_id
        LEFT JOIN zones z ON z.id = COALESCE(NULLIF(h.zone_id, ''), ofc.zone_id)
      `;
      const [rawRows] = orgId
        ? await pool.query(`${hostSelect} WHERE h.organisation_id = ? ORDER BY h.name`, [orgId])
        : await pool.query(`${hostSelect} ORDER BY o.name, h.name`);

      const withRoles = rawRows.map((row) => {
        const portalRole = normalizeHostPortalRole(row.portal_role || 'host');
        return {
          ...row,
          portal_role: portalRole,
          portal_role_label: hostPortalRoleLabel(portalRole),
        };
      });
      const rows = await attachHostZones(pool, withRoles);

      const stats = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        with_office: rows.filter((row) => row.office_id).length,
        with_zone: rows.filter((row) => row.zone_id || row.zone_name).length,
        departments: new Set(rows.map((row) => row.department_id).filter(Boolean)).size,
        sites: new Set(rows.map((row) => row.site_id).filter(Boolean)).size,
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/hosts/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const hostId = req.params.id;

      const [[raw]] = await pool.query(
        `SELECT h.*,
                COALESCE(d.name, od.name) AS department_name,
                ofc.office_number,
                ofc.name AS office_name,
                s.name AS site_name,
                o.name AS organisation_name,
                p.name AS position_name,
                z.name AS zone_name,
                (
                  SELECT ar.slug
                  FROM user_admin_roles uar
                  INNER JOIN admin_roles ar ON ar.id = uar.role_id
                  WHERE uar.user_id = h.user_id
                    AND ar.slug IN ('ceo', 'dceo', 'host')
                  ORDER BY CASE ar.slug
                    WHEN 'ceo' THEN 1
                    WHEN 'dceo' THEN 2
                    WHEN 'host' THEN 3
                    ELSE 4
                  END
                  LIMIT 1
                ) AS portal_role
         FROM hosts h
         LEFT JOIN offices ofc ON ofc.id = h.office_id
         LEFT JOIN departments d ON d.id = h.department_id
         LEFT JOIN departments od ON od.id = ofc.department_id
         LEFT JOIN sites s ON s.id = COALESCE(h.site_id, ofc.site_id)
         LEFT JOIN organisations o ON o.id = h.organisation_id
         LEFT JOIN positions p ON p.id = h.position_id
         LEFT JOIN zones z ON z.id = COALESCE(NULLIF(h.zone_id, ''), ofc.zone_id)
         WHERE h.id = ?
         LIMIT 1`,
        [hostId],
      );

      if (!raw) {
        return res.status(404).json({ ok: false, message: 'Host not found.' });
      }
      if (orgId && raw.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this host.' });
      }

      const portalRole = normalizeHostPortalRole(raw.portal_role || 'host');
      const [withZones] = await attachHostZones(pool, [{
        ...raw,
        portal_role: portalRole,
        portal_role_label: hostPortalRoleLabel(portalRole),
      }]);
      res.json({
        ok: true,
        data: withZones,
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Host → Organisation + Department + Site (+ optional Office) + portal login
  router.post('/hosts', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const bodyOrgId = String(req.body?.organisationId || req.body?.organisation_id || '').trim() || null;
      const orgId = bodyOrgId || scope?.organisation_id || null;
      const departmentId = String(req.body?.departmentId || req.body?.department_id || '').trim();
      const siteId = String(req.body?.siteId || req.body?.site_id || '').trim();
      const officeId = String(req.body?.officeId || req.body?.office_id || '').trim() || null;
      let zoneId = String(req.body?.zoneId || req.body?.zone_id || '').trim() || null;
      const positionRaw = String(req.body?.positionId || req.body?.position_id || '').trim() || null;
      const title = String(req.body?.title || req.body?.salutation || '').trim() || null;
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase() || null;
      const phone = String(req.body?.phone || '').trim() || null;
      const status = String(req.body?.status || 'active').trim() || 'active';
      const availability = normalizeHostAvailability(req.body?.availability);
      const password = String(req.body?.password || '').trim() || null;
      const portalRole = normalizeHostPortalRole(
        req.body?.portalRole || req.body?.portal_role || req.body?.role || 'host',
      );

      if (!name) return res.status(400).json({ ok: false, message: 'Host name is required.' });
      if (!orgId) {
        return res.status(400).json({ ok: false, message: 'Organisation is required for a host.' });
      }
      if (scope?.organisation_id && orgId !== scope.organisation_id) {
        return res.status(403).json({ ok: false, message: 'Access denied for this organisation.' });
      }
      if (!departmentId) {
        return res.status(400).json({ ok: false, message: 'Department is required for a host.' });
      }
      if (!siteId) {
        return res.status(400).json({ ok: false, message: 'Site / branch is required for a host.' });
      }
      if (password && !email) {
        return res.status(400).json({ ok: false, message: 'Email is required to set a host password.' });
      }
      if ((portalRole === 'ceo' || portalRole === 'dceo') && !email) {
        return res.status(400).json({
          ok: false,
          message: 'Email is required to assign CEO or Deputy CEO portal access.',
        });
      }
      if (password) {
        const security = await getSecuritySettings();
        const minLength = Number(security.min_password_length || 8);
        if (password.length < minLength) {
          return res.status(400).json({
            ok: false,
            message: `Password must be at least ${minLength} characters.`,
          });
        }
      }

      const placement = await assertEmployeePlacement(pool, {
        organisationId: orgId,
        departmentId,
        siteId,
        officeId,
      });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      if (placement.officeId) {
        const [[office]] = await pool.query(
          'SELECT zone_id FROM offices WHERE id = ? LIMIT 1',
          [placement.officeId],
        );
        if (office?.zone_id) {
          if (zoneId && zoneId !== office.zone_id) {
            return res.status(400).json({
              ok: false,
              message: 'Selected office is not in the chosen zone.',
            });
          }
          zoneId = office.zone_id;
        }
      }
      if (!zoneId) {
        return res.status(400).json({
          ok: false,
          message: 'Zone is required so reception can match this host.',
        });
      }
      const [[zoneRow]] = await pool.query(
        `SELECT z.id
         FROM zones z
         INNER JOIN buildings b ON b.id = z.building_id
         INNER JOIN sites s ON s.id = b.site_id
         WHERE z.id = ?
           AND s.organisation_id = ?
           AND s.id = ?
         LIMIT 1`,
        [zoneId, orgId, siteId],
      );
      if (!zoneRow) {
        return res.status(400).json({
          ok: false,
          message: 'Selected zone was not found for this organisation and site.',
        });
      }

      const position = await resolveHostPositionId(pool, orgId, positionRaw);
      if (!position.ok) {
        return res.status(position.status).json({ ok: false, message: position.message });
      }

      let linkedUserId = null;
      if (email) {
        linkedUserId = await syncHostPortalUser(pool, {
          name,
          email,
          phone,
          organisationId: orgId,
          siteId,
          departmentId,
          officeId: placement.officeId,
          password,
          active: status !== 'inactive',
          portalRole,
        });
      }

      const id = generateId('host');
      await pool.query(
        `INSERT INTO hosts (id, organisation_id, department_id, site_id, office_id, zone_id, position_id, user_id, title, name, email, phone, status, availability)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, orgId, departmentId, siteId, placement.officeId, zoneId, position.positionId, linkedUserId, title, name, email, phone, status, availability],
      );

      // Optional multi-zone assignment (host_zones) — additive, on top of the
      // required single zoneId above. Falls back to [zoneId] so host_zones
      // always stays in sync even when the caller only ever sends zoneId.
      const requestedZoneIds = parseHostZoneIds(req.body, [zoneId]);
      const zonesValidation = await validateHostZones(pool, requestedZoneIds, orgId, siteId);
      if (!zonesValidation.ok) {
        return res.status(zonesValidation.status).json({ ok: false, message: zonesValidation.message });
      }
      await syncHostZones(pool, id, zonesValidation.zoneIds.length ? zonesValidation.zoneIds : [zoneId]);

      const [[row]] = await pool.query(
        `SELECT h.*,
                d.name AS department_name,
                ofc.office_number,
                ofc.name AS office_name,
                s.name AS site_name,
                o.name AS organisation_name,
                p.name AS position_name,
                z.name AS zone_name
         FROM hosts h
         LEFT JOIN departments d ON d.id = h.department_id
         LEFT JOIN offices ofc ON ofc.id = h.office_id
         LEFT JOIN sites s ON s.id = h.site_id
         LEFT JOIN organisations o ON o.id = h.organisation_id
         LEFT JOIN positions p ON p.id = h.position_id
         LEFT JOIN zones z ON z.id = COALESCE(NULLIF(h.zone_id, ''), ofc.zone_id)
         WHERE h.id = ?`,
        [id],
      );
      const resolvedRole = linkedUserId
        ? await resolveHostPortalRole(pool, linkedUserId)
        : portalRole;
      res.status(201).json({
        ok: true,
        data: {
          ...row,
          portal_role: resolvedRole,
          portal_role_label: hostPortalRoleLabel(resolvedRole),
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/hosts/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const hostId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM hosts WHERE id = ? LIMIT 1', [hostId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Host not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this host.' });
      }

      const departmentId = req.body?.departmentId != null || req.body?.department_id != null
        ? String(req.body.departmentId || req.body.department_id || '').trim()
        : existing.department_id;
      const siteId = req.body?.siteId != null || req.body?.site_id != null
        ? String(req.body.siteId || req.body.site_id || '').trim()
        : existing.site_id;
      const officeRaw = req.body?.officeId != null || req.body?.office_id != null
        ? String(req.body.officeId || req.body.office_id || '').trim()
        : existing.office_id;
      const officeId = officeRaw || null;
      let zoneId = req.body?.zoneId != null || req.body?.zone_id != null
        ? String(req.body.zoneId || req.body.zone_id || '').trim() || null
        : existing.zone_id || null;
      const positionRaw = req.body?.positionId != null || req.body?.position_id != null
        ? String(req.body.positionId || req.body.position_id || '').trim() || null
        : existing.position_id || null;
      const title = req.body?.title != null || req.body?.salutation != null
        ? String(req.body.title || req.body.salutation || '').trim() || null
        : existing.title || null;
      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const email = req.body?.email != null ? String(req.body.email).trim().toLowerCase() || null : existing.email;
      const phone = req.body?.phone != null ? String(req.body.phone).trim() || null : existing.phone;
      const status = req.body?.status != null
        ? String(req.body.status).trim() || existing.status
        : existing.status;
      const availability = req.body?.availability != null
        ? normalizeHostAvailability(req.body.availability)
        : normalizeHostAvailability(existing.availability);
      const password = String(req.body?.password || '').trim() || null;
      const existingPortalRole = await resolveHostPortalRole(pool, existing.user_id || null);
      const portalRole = req.body?.portalRole != null || req.body?.portal_role != null || req.body?.role != null
        ? normalizeHostPortalRole(req.body.portalRole || req.body.portal_role || req.body.role)
        : existingPortalRole;

      if (!name) return res.status(400).json({ ok: false, message: 'Host name is required.' });
      if (password && !email) {
        return res.status(400).json({ ok: false, message: 'Email is required to set a host password.' });
      }
      if ((portalRole === 'ceo' || portalRole === 'dceo') && !email) {
        return res.status(400).json({
          ok: false,
          message: 'Email is required to assign CEO or Deputy CEO portal access.',
        });
      }
      if (password) {
        const security = await getSecuritySettings();
        const minLength = Number(security.min_password_length || 8);
        if (password.length < minLength) {
          return res.status(400).json({
            ok: false,
            message: `Password must be at least ${minLength} characters.`,
          });
        }
      }

      const placement = await assertEmployeePlacement(pool, {
        organisationId: existing.organisation_id,
        departmentId,
        siteId,
        officeId,
      });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      if (placement.officeId) {
        const [[office]] = await pool.query(
          'SELECT zone_id FROM offices WHERE id = ? LIMIT 1',
          [placement.officeId],
        );
        if (office?.zone_id) {
          if (zoneId && zoneId !== office.zone_id) {
            return res.status(400).json({
              ok: false,
              message: 'Selected office is not in the chosen zone.',
            });
          }
          zoneId = office.zone_id;
        }
      }
      if (!zoneId) {
        return res.status(400).json({
          ok: false,
          message: 'Zone is required so reception can match this host.',
        });
      }
      const [[zoneRow]] = await pool.query(
        `SELECT z.id
         FROM zones z
         INNER JOIN buildings b ON b.id = z.building_id
         INNER JOIN sites s ON s.id = b.site_id
         WHERE z.id = ?
           AND s.organisation_id = ?
           AND s.id = ?
         LIMIT 1`,
        [zoneId, existing.organisation_id, siteId],
      );
      if (!zoneRow) {
        return res.status(400).json({
          ok: false,
          message: 'Selected zone was not found for this organisation and site.',
        });
      }

      const position = await resolveHostPositionId(pool, existing.organisation_id, positionRaw);
      if (!position.ok) {
        return res.status(position.status).json({ ok: false, message: position.message });
      }

      let linkedUserId = existing.user_id || null;
      if (email) {
        linkedUserId = await syncHostPortalUser(pool, {
          userId: existing.user_id || null,
          name,
          email,
          phone,
          organisationId: existing.organisation_id,
          siteId,
          departmentId,
          officeId: placement.officeId,
          password,
          active: status !== 'inactive',
          portalRole,
        });
      }

      await pool.query(
        `UPDATE hosts
         SET department_id = ?, site_id = ?, office_id = ?, zone_id = ?, position_id = ?, user_id = ?, title = ?, name = ?, email = ?, phone = ?, status = ?, availability = ?
         WHERE id = ?`,
        [departmentId, siteId, placement.officeId, zoneId, position.positionId, linkedUserId, title, name, email, phone, status, availability, hostId],
      );

      const requestedZoneIds = parseHostZoneIds(req.body, [zoneId]);
      const zonesValidation = await validateHostZones(pool, requestedZoneIds, existing.organisation_id, siteId);
      if (!zonesValidation.ok) {
        return res.status(zonesValidation.status).json({ ok: false, message: zonesValidation.message });
      }
      await syncHostZones(pool, hostId, zonesValidation.zoneIds.length ? zonesValidation.zoneIds : [zoneId]);

      const [[row]] = await pool.query(
        `SELECT h.*,
                d.name AS department_name,
                ofc.office_number,
                ofc.name AS office_name,
                s.name AS site_name,
                o.name AS organisation_name,
                p.name AS position_name,
                z.name AS zone_name
         FROM hosts h
         LEFT JOIN departments d ON d.id = h.department_id
         LEFT JOIN offices ofc ON ofc.id = h.office_id
         LEFT JOIN sites s ON s.id = h.site_id
         LEFT JOIN organisations o ON o.id = h.organisation_id
         LEFT JOIN positions p ON p.id = h.position_id
         LEFT JOIN zones z ON z.id = COALESCE(NULLIF(h.zone_id, ''), ofc.zone_id)
         WHERE h.id = ?`,
        [hostId],
      );
      const resolvedRole = linkedUserId
        ? await resolveHostPortalRole(pool, linkedUserId)
        : portalRole;
      res.json({
        ok: true,
        data: {
          ...row,
          portal_role: resolvedRole,
          portal_role_label: hostPortalRoleLabel(resolvedRole),
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/hosts/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const hostId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM hosts WHERE id = ? LIMIT 1', [hostId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Host not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this host.' });
      }

      if (existing.user_id && existing.email) {
        await syncHostPortalUser(pool, {
          userId: existing.user_id,
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          organisationId: existing.organisation_id,
          siteId: existing.site_id,
          departmentId: existing.department_id,
          officeId: existing.office_id,
          active: false,
          portalRole: 'host',
        });
      }

      await pool.query('DELETE FROM hosts WHERE id = ?', [hostId]);
      res.json({ ok: true, message: 'Host deleted.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/hosts/:id/send-password-reset', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const hostId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM hosts WHERE id = ? LIMIT 1', [hostId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Host not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this host.' });
      }
      if (!existing.email) {
        return res.status(400).json({ ok: false, message: 'Add an email address before sending a password reset.' });
      }

      const result = await sendHostPasswordResetEmail(pool, {
        host: existing,
        createdBy: userId || null,
      });

      res.json({
        ok: true,
        message: `Password reset email sent to ${result.email}.`,
        data: {
          email: result.email,
          expiresAt: result.expiresAt,
          provider: result.delivery?.provider || null,
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({ ok: false, message: error.message });
    }
  });

  // Receptionist → Organisation + Site + Zone (portal login with main_reception)
  router.get('/receptionists', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT r.*,
               o.name AS organisation_name,
               s.name AS site_name,
               z.name AS zone_name,
               b.name AS building_name,
               d.name AS department_name
        FROM receptionists r
        LEFT JOIN organisations o ON o.id = r.organisation_id
        LEFT JOIN sites s ON s.id = r.site_id
        LEFT JOIN zones z ON z.id = r.zone_id
        LEFT JOIN buildings b ON b.id = z.building_id
        LEFT JOIN departments d ON d.id = r.department_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE r.organisation_id = ? ORDER BY r.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, r.name`);

      const enrichedRows = await attachReceptionistZones(pool, rows);

      const stats = {
        total: enrichedRows.length,
        active: enrichedRows.filter((row) => row.status === 'active').length,
        with_zone: enrichedRows.filter((row) => (row.zone_ids || []).length > 0 || row.zone_id).length,
        with_login: enrichedRows.filter((row) => row.user_id).length,
      };

      res.json({ ok: true, data: enrichedRows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/receptionists', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const bodyOrgId = String(req.body?.organisationId || req.body?.organisation_id || '').trim() || null;
      const orgId = bodyOrgId || scope?.organisation_id || null;
      const siteId = String(req.body?.siteId || req.body?.site_id || '').trim();
      const zoneIds = parseReceptionistZoneIds(req.body);
      const departmentId = String(req.body?.departmentId || req.body?.department_id || '').trim() || null;
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase() || null;
      const phone = String(req.body?.phone || '').trim() || null;
      const status = String(req.body?.status || 'active').trim() || 'active';
      const password = String(req.body?.password || '').trim() || null;

      if (!name) return res.status(400).json({ ok: false, message: 'Receptionist name is required.' });
      if (!orgId) return res.status(400).json({ ok: false, message: 'Organisation is required.' });
      if (scope?.organisation_id && orgId !== scope.organisation_id) {
        return res.status(403).json({ ok: false, message: 'Access denied for this organisation.' });
      }
      if (!siteId) return res.status(400).json({ ok: false, message: 'Site / branch is required.' });
      if (!email) return res.status(400).json({ ok: false, message: 'Email is required for receptionist login.' });

      const placement = await assertStationPlacement(pool, { organisationId: orgId, siteId });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      const zoneValidation = await validateReceptionistZones(pool, zoneIds, orgId, siteId);
      if (!zoneValidation.ok) {
        return res.status(zoneValidation.status).json({ ok: false, message: zoneValidation.message });
      }
      const primaryZoneId = zoneValidation.zoneIds[0];

      const [[emailTaken]] = await pool.query(
        'SELECT id FROM receptionists WHERE LOWER(email) = ? LIMIT 1',
        [email],
      );
      if (emailTaken) {
        return res.status(400).json({ ok: false, message: 'A receptionist with this email already exists.' });
      }

      const linkedUserId = await syncReceptionistPortalUser(pool, {
        name,
        email,
        phone,
        organisationId: orgId,
        siteId,
        stationId: null,
        departmentId,
        password,
        active: status === 'active',
      });

      const id = generateId('rcp');
      await pool.query(
        `INSERT INTO receptionists
           (id, organisation_id, site_id, zone_id, station_id, department_id, user_id, name, email, phone, status)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [id, orgId, siteId, primaryZoneId, departmentId, linkedUserId, name, email, phone, status],
      );
      await syncReceptionistZones(pool, id, zoneValidation.zoneIds);

      const row = await loadReceptionistRow(pool, id);
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/receptionists/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const receptionistId = req.params.id;

      const row = await loadReceptionistRow(pool, receptionistId);
      if (!row) return res.status(404).json({ ok: false, message: 'Receptionist not found.' });
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this receptionist.' });
      }
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/receptionists/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const receptionistId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM receptionists WHERE id = ? LIMIT 1', [receptionistId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Receptionist not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this receptionist.' });
      }

      const siteId = req.body?.siteId != null || req.body?.site_id != null
        ? String(req.body.siteId || req.body.site_id || '').trim()
        : existing.site_id;
      const hasZonePayload = req.body.zoneIds != null
        || req.body.zone_ids != null
        || req.body.zoneId != null
        || req.body.zone_id != null;
      let zoneIds = parseReceptionistZoneIds(req.body);
      if (!hasZonePayload) {
        const existingZones = await loadReceptionistZones(pool, receptionistId);
        zoneIds = existingZones.map((zone) => zone.id);
        if (!zoneIds.length && existing.zone_id) zoneIds = [existing.zone_id];
      }
      const departmentId = req.body?.departmentId != null || req.body?.department_id != null
        ? String(req.body.departmentId || req.body.department_id || '').trim() || null
        : existing.department_id;
      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const email = req.body?.email != null
        ? String(req.body.email).trim().toLowerCase() || null
        : existing.email;
      const phone = req.body?.phone != null ? String(req.body.phone).trim() || null : existing.phone;
      const status = req.body?.status != null
        ? String(req.body.status).trim() || existing.status
        : existing.status;
      const password = String(req.body?.password || '').trim() || null;

      if (!name) return res.status(400).json({ ok: false, message: 'Receptionist name is required.' });
      if (!siteId) return res.status(400).json({ ok: false, message: 'Site / branch is required.' });
      if (!email) return res.status(400).json({ ok: false, message: 'Email is required for receptionist login.' });

      const placement = await assertStationPlacement(pool, {
        organisationId: existing.organisation_id,
        siteId,
      });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      const zoneValidation = await validateReceptionistZones(
        pool,
        zoneIds,
        existing.organisation_id,
        siteId,
      );
      if (!zoneValidation.ok) {
        return res.status(zoneValidation.status).json({ ok: false, message: zoneValidation.message });
      }
      const primaryZoneId = zoneValidation.zoneIds[0];

      const linkedUserId = await syncReceptionistPortalUser(pool, {
        userId: existing.user_id,
        name,
        email,
        phone,
        organisationId: existing.organisation_id,
        siteId,
        stationId: null,
        departmentId,
        password,
        active: status === 'active',
      });

      await pool.query(
        `UPDATE receptionists
         SET site_id = ?, zone_id = ?, station_id = NULL, department_id = ?, user_id = ?, name = ?, email = ?, phone = ?, status = ?
         WHERE id = ?`,
        [siteId, primaryZoneId, departmentId, linkedUserId, name, email, phone, status, receptionistId],
      );
      await syncReceptionistZones(pool, receptionistId, zoneValidation.zoneIds);

      const row = await loadReceptionistRow(pool, receptionistId);
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(error.status || 500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/receptionists/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const receptionistId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM receptionists WHERE id = ? LIMIT 1', [receptionistId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Receptionist not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this receptionist.' });
      }

      if (existing.user_id && existing.email) {
        await syncReceptionistPortalUser(pool, {
          userId: existing.user_id,
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          organisationId: existing.organisation_id,
          siteId: existing.site_id,
          stationId: existing.station_id,
          departmentId: existing.department_id,
          active: false,
        });
      }

      await pool.query('DELETE FROM receptionist_zones WHERE receptionist_id = ?', [receptionistId]);
      await pool.query('DELETE FROM receptionists WHERE id = ?', [receptionistId]);
      res.json({ ok: true, message: 'Receptionist deleted.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Security Guard → Organisation + Site + Station (portal login with gate_security)
  router.get('/security-guards', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const selectSql = `
        SELECT g.*,
               o.name AS organisation_name,
               s.name AS site_name,
               st.name AS station_name,
               d.name AS department_name
        FROM security_guards g
        LEFT JOIN organisations o ON o.id = g.organisation_id
        LEFT JOIN sites s ON s.id = g.site_id
        LEFT JOIN stations st ON st.id = g.station_id
        LEFT JOIN departments d ON d.id = g.department_id
      `;
      const [rows] = orgId
        ? await pool.query(`${selectSql} WHERE g.organisation_id = ? ORDER BY g.name`, [orgId])
        : await pool.query(`${selectSql} ORDER BY o.name, g.name`);

      const stats = {
        total: rows.length,
        active: rows.filter((row) => row.status === 'active').length,
        with_station: rows.filter((row) => row.station_id).length,
        with_login: rows.filter((row) => row.user_id).length,
      };

      res.json({ ok: true, data: rows, stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/security-guards', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const bodyOrgId = String(req.body?.organisationId || req.body?.organisation_id || '').trim() || null;
      const orgId = bodyOrgId || scope?.organisation_id || null;
      const siteId = String(req.body?.siteId || req.body?.site_id || '').trim();
      const stationId = String(req.body?.stationId || req.body?.station_id || '').trim() || null;
      const departmentId = String(req.body?.departmentId || req.body?.department_id || '').trim() || null;
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase() || null;
      const phone = String(req.body?.phone || '').trim() || null;
      const status = String(req.body?.status || 'active').trim() || 'active';
      const password = String(req.body?.password || '').trim() || null;

      if (!name) return res.status(400).json({ ok: false, message: 'Security guard name is required.' });
      if (!orgId) return res.status(400).json({ ok: false, message: 'Organisation is required.' });
      if (scope?.organisation_id && orgId !== scope.organisation_id) {
        return res.status(403).json({ ok: false, message: 'Access denied for this organisation.' });
      }
      if (!siteId) return res.status(400).json({ ok: false, message: 'Site / branch is required.' });
      if (!email) return res.status(400).json({ ok: false, message: 'Email is required for security guard login.' });

      const placement = await assertStationPlacement(pool, { organisationId: orgId, siteId });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      if (stationId) {
        const [[station]] = await pool.query(
          `SELECT st.id, st.site_id
           FROM stations st
           INNER JOIN sites s ON s.id = st.site_id
           WHERE st.id = ? AND s.organisation_id = ?
           LIMIT 1`,
          [stationId, orgId],
        );
        if (!station) {
          return res.status(400).json({ ok: false, message: 'Station not found in this organisation.' });
        }
        if (station.site_id && station.site_id !== siteId) {
          return res.status(400).json({ ok: false, message: 'Station must belong to the selected site.' });
        }
      }

      const [[emailTaken]] = await pool.query(
        'SELECT id FROM security_guards WHERE LOWER(email) = ? LIMIT 1',
        [email],
      );
      if (emailTaken) {
        return res.status(400).json({ ok: false, message: 'A security guard with this email already exists.' });
      }

      const linkedUserId = await syncSecurityGuardPortalUser(pool, {
        name,
        email,
        phone,
        organisationId: orgId,
        siteId,
        stationId,
        departmentId,
        password,
        active: status === 'active',
      });

      const id = generateId('grd');
      await pool.query(
        `INSERT INTO security_guards
           (id, organisation_id, site_id, station_id, department_id, user_id, name, email, phone, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, orgId, siteId, stationId, departmentId, linkedUserId, name, email, phone, status],
      );

      const row = await loadSecurityGuardRow(pool, id);
      res.status(201).json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/security-guards/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const guardId = req.params.id;

      const [[row]] = await pool.query(
        `SELECT g.*,
               o.name AS organisation_name,
               s.name AS site_name,
               st.name AS station_name,
               d.name AS department_name
         FROM security_guards g
         LEFT JOIN organisations o ON o.id = g.organisation_id
         LEFT JOIN sites s ON s.id = g.site_id
         LEFT JOIN stations st ON st.id = g.station_id
         LEFT JOIN departments d ON d.id = g.department_id
         WHERE g.id = ?
         LIMIT 1`,
        [guardId],
      );
      if (!row) return res.status(404).json({ ok: false, message: 'Security guard not found.' });
      if (orgId && row.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this security guard.' });
      }
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/security-guards/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const guardId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM security_guards WHERE id = ? LIMIT 1', [guardId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Security guard not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this security guard.' });
      }

      const siteId = req.body?.siteId != null || req.body?.site_id != null
        ? String(req.body.siteId || req.body.site_id || '').trim()
        : existing.site_id;
      const stationId = req.body?.stationId != null || req.body?.station_id != null
        ? String(req.body.stationId || req.body.station_id || '').trim() || null
        : existing.station_id;
      const departmentId = req.body?.departmentId != null || req.body?.department_id != null
        ? String(req.body.departmentId || req.body.department_id || '').trim() || null
        : existing.department_id;
      const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
      const email = req.body?.email != null
        ? String(req.body.email).trim().toLowerCase() || null
        : existing.email;
      const phone = req.body?.phone != null ? String(req.body.phone).trim() || null : existing.phone;
      const status = req.body?.status != null
        ? String(req.body.status).trim() || existing.status
        : existing.status;
      const password = String(req.body?.password || '').trim() || null;

      if (!name) return res.status(400).json({ ok: false, message: 'Security guard name is required.' });
      if (!siteId) return res.status(400).json({ ok: false, message: 'Site / branch is required.' });
      if (!email) return res.status(400).json({ ok: false, message: 'Email is required for security guard login.' });

      const placement = await assertStationPlacement(pool, {
        organisationId: existing.organisation_id,
        siteId,
      });
      if (!placement.ok) {
        return res.status(placement.status).json({ ok: false, message: placement.message });
      }

      if (stationId) {
        const [[station]] = await pool.query(
          `SELECT st.id, st.site_id
           FROM stations st
           INNER JOIN sites s ON s.id = st.site_id
           WHERE st.id = ? AND s.organisation_id = ?
           LIMIT 1`,
          [stationId, existing.organisation_id],
        );
        if (!station) {
          return res.status(400).json({ ok: false, message: 'Station not found in this organisation.' });
        }
        if (station.site_id && station.site_id !== siteId) {
          return res.status(400).json({ ok: false, message: 'Station must belong to the selected site.' });
        }
      }

      const linkedUserId = await syncSecurityGuardPortalUser(pool, {
        userId: existing.user_id,
        name,
        email,
        phone,
        organisationId: existing.organisation_id,
        siteId,
        stationId,
        departmentId,
        password,
        active: status === 'active',
      });

      await pool.query(
        `UPDATE security_guards
         SET site_id = ?, station_id = ?, department_id = ?, user_id = ?, name = ?, email = ?, phone = ?, status = ?
         WHERE id = ?`,
        [siteId, stationId, departmentId, linkedUserId, name, email, phone, status, guardId],
      );

      const row = await loadSecurityGuardRow(pool, guardId);
      res.json({ ok: true, data: row });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.delete('/security-guards/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const orgId = scope?.organisation_id;
      const guardId = req.params.id;

      const [[existing]] = await pool.query('SELECT * FROM security_guards WHERE id = ? LIMIT 1', [guardId]);
      if (!existing) return res.status(404).json({ ok: false, message: 'Security guard not found.' });
      if (orgId && existing.organisation_id !== orgId) {
        return res.status(403).json({ ok: false, message: 'Access denied for this security guard.' });
      }

      if (existing.user_id && existing.email) {
        await syncSecurityGuardPortalUser(pool, {
          userId: existing.user_id,
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          organisationId: existing.organisation_id,
          siteId: existing.site_id,
          stationId: existing.station_id,
          departmentId: existing.department_id,
          active: false,
        });
      }

      await pool.query('DELETE FROM security_guards WHERE id = ?', [guardId]);
      res.json({ ok: true, message: 'Security guard deleted.' });
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
      const filter = await resolveAdminOrganisationFilter(pool, req, scope);
      if (!filter.ok) {
        return res.status(filter.status).json({ ok: false, message: filter.message });
      }
      const orgId = filter.organisationId;
      const orgParams = orgId ? [orgId] : [];
      const visOrgClause = orgId ? ' WHERE vis.organisation_id = ?' : '';
      const plainOrgClause = orgId ? ' WHERE organisation_id = ?' : '';
      const andOrgClause = orgId ? ' AND organisation_id = ?' : '';

      const [[orgCount]] = await pool.query(
        orgId
          ? `SELECT COUNT(*) AS count FROM organisations WHERE id = ?`
          : `SELECT COUNT(*) AS count FROM organisations`,
        orgParams,
      );
      const [[siteCount]] = await pool.query(
        `SELECT COUNT(*) AS count FROM sites${plainOrgClause}`,
        orgParams,
      );
      const [[userCount]] = orgId
        ? await pool.query(
          `SELECT COUNT(DISTINCT us.user_id) AS count
           FROM user_scopes us
           WHERE us.organisation_id = ?`,
          orgParams,
        )
        : await pool.query(`SELECT COUNT(*) AS count FROM users`);
      const [[visitCount]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits${plainOrgClause}`,
        orgParams,
      );

      const loadVisitsByOrganisation = async () => {
        const [rows] = await pool.query(
          `SELECT o.name AS organisation_name, COUNT(vis.id) AS total
           FROM organisations o
           LEFT JOIN visits vis ON vis.organisation_id = o.id
           ${orgId ? 'WHERE o.id = ?' : ''}
           GROUP BY o.id, o.name
           HAVING COUNT(vis.id) > 0
           ORDER BY total DESC
           LIMIT 6`,
          orgParams,
        );
        return rows.map((row) => ({
          organisation_name: row.organisation_name,
          total: Number(row.total || 0),
        }));
      };

      const { visitsToday, visitsYesterday, visitTrend } = await fetchVisitsTodayYesterday(pool, orgId);
      const weeklyVisits = await fetchWeeklyVisits(pool, orgId);
      const weeklyWalking = await fetchWeeklyWalkingVisits(pool, orgId);
      const weeklyDriveIn = await fetchWeeklyDriveInVisits(pool, orgId);

      const onSitePlaceholders = ON_SITE_VISIT_STATUSES.map(() => '?').join(', ');
      const [[currentlyInside]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE status IN (${onSitePlaceholders})${andOrgClause}`,
        [...ON_SITE_VISIT_STATUSES, ...orgParams],
      );
      const [[pendingApprovals]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits
         WHERE status IN ('pending_approval', 'pre_registered')${andOrgClause}`,
        orgParams,
      );
      const [[overdueVisits]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE status = 'overdue'${andOrgClause}`,
        orgParams,
      );
      const [[stations]] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM stations st
         INNER JOIN sites s ON s.id = st.site_id
         ${orgId ? 'WHERE s.organisation_id = ?' : ''}`,
        orgParams,
      );
      const [[hosts]] = await pool.query(
        `SELECT COUNT(*) AS count FROM hosts${plainOrgClause}`,
        orgParams,
      );
      const [[departments]] = await pool.query(
        `SELECT COUNT(*) AS count FROM departments${plainOrgClause}`,
        orgParams,
      );
      const [[openIncidents]] = await pool.query(
        `SELECT COUNT(*) AS count FROM incidents
         WHERE status IN ('open', 'investigating')${andOrgClause}`,
        orgParams,
      );
      const [[auditToday]] = await pool.query(
        `SELECT COUNT(*) AS count FROM audit_logs
         WHERE created_at >= CURDATE()${andOrgClause}`,
        orgParams,
      );

      const [recentActivity] = await pool.query(
        `SELECT ve.id, ve.event_type, ve.created_at, v.full_name AS visitor_name, vis.status AS visit_status
         FROM visit_events ve
         INNER JOIN visits vis ON vis.id = ve.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         ${visOrgClause}
         ORDER BY ve.created_at DESC
         LIMIT 10`,
        orgParams,
      );

      const [recentAudit] = await pool.query(
        `SELECT al.id, al.action, al.created_at, al.result, u.name AS actor_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         ${plainOrgClause.replace('organisation_id', 'al.organisation_id')}
         ORDER BY al.created_at DESC
         LIMIT 8`,
        orgParams,
      );

      const [statusRows] = await pool.query(
        `SELECT status, COUNT(*) AS count FROM visits${plainOrgClause}
         GROUP BY status ORDER BY count DESC`,
        orgParams,
      );
      const statusBreakdown = statusRows.map((row) => ({
        status: row.status,
        count: Number(row.count || 0),
      }));

      const [visitsBySite] = await pool.query(
        `SELECT s.name AS site_name, COUNT(*) AS total
         FROM visits vis
         INNER JOIN sites s ON s.id = vis.site_id
         ${visOrgClause}
         GROUP BY s.id, s.name
         ORDER BY total DESC
         LIMIT 6`,
        orgParams,
      );

      const visitsByOrganisation = await loadVisitsByOrganisation();

      const [recentVisits] = await pool.query(
        `SELECT vis.id, vis.created_at, vis.status, vis.badge_number,
                v.full_name AS visitor_name, h.name AS host_name,
                s.name AS site_name, vc.name AS category_name,
                o.name AS organisation_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         INNER JOIN organisations o ON o.id = vis.organisation_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN sites s ON s.id = vis.site_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         ${visOrgClause}
         ORDER BY vis.created_at DESC
         LIMIT 15`,
        orgParams,
      );

      const weeklyTrend = buildWeeklyTrend(weeklyVisits, weeklyWalking, weeklyDriveIn);

      res.json({
        ok: true,
        data: {
          organisations: Number(orgCount?.count || 0),
          sites: Number(siteCount?.count || 0),
          users: Number(userCount?.count || 0),
          totalVisits: Number(visitCount?.count || 0),
          scope: adminOrganisationScopeView(scope, filter),
          canSelectOrganisation: filter.platformWide,
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
          visitsByOrganisation,
          recentVisits,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/visitors', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const filter = await resolveAdminOrganisationFilter(pool, req, scope);
      if (!filter.ok) {
        return res.status(filter.status).json({ ok: false, message: filter.message });
      }
      const orgId = filter.organisationId;
      const limit = Math.min(200, Number(req.query.limit) || 100);
      const search = String(req.query.search || req.query.q || '').trim();

      let sql = `
        SELECT v.id, v.full_name, v.phone, v.email, v.company, v.created_at,
               o.name AS organisation_name,
               (SELECT COUNT(*) FROM visits vis WHERE vis.visitor_id = v.id) AS visit_count,
               (SELECT MAX(vis.created_at) FROM visits vis WHERE vis.visitor_id = v.id) AS last_visit_at,
               (SELECT vis.id FROM visits vis WHERE vis.visitor_id = v.id ORDER BY vis.created_at DESC LIMIT 1) AS last_visit_id,
               COALESCE((
                 SELECT LOWER(COALESCE(vc.classification, 'standard'))
                 FROM visits vis2
                 LEFT JOIN visitor_categories vc ON vc.id = vis2.category_id
                 WHERE vis2.visitor_id = v.id
                 ORDER BY CASE LOWER(COALESCE(vc.classification, 'standard'))
                   WHEN 'vvip' THEN 3 WHEN 'vip' THEN 2 ELSE 1 END DESC,
                   vis2.created_at DESC
                 LIMIT 1
               ), 'standard') AS classification
        FROM visitors v
        INNER JOIN organisations o ON o.id = v.organisation_id
        WHERE 1=1
      `;
      const params = [];

      if (orgId) {
        sql += ' AND v.organisation_id = ?';
        params.push(orgId);
      }
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
      const perms = permissionsFromRequest(req);
      res.json({ ok: true, data: applyVisitListMasking(rows, perms) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/vehicles', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const filter = await resolveAdminOrganisationFilter(pool, req, scope);
      if (!filter.ok) {
        return res.status(filter.status).json({ ok: false, message: filter.message });
      }
      const orgId = filter.organisationId;
      const limit = Math.min(200, Number(req.query.limit) || 100);
      const search = String(req.query.search || req.query.q || '').trim();
      const status = String(req.query.status || '').trim();

      let sql = `
        SELECT veh.id, veh.visit_id, veh.plate_number, veh.vehicle_type, veh.make, veh.colour,
               veh.driver_name, veh.status, veh.entered_at, veh.exited_at, veh.created_at,
               o.name AS organisation_name
        FROM vehicles veh
        INNER JOIN organisations o ON o.id = veh.organisation_id
        WHERE 1=1
      `;
      const params = [];

      if (orgId) {
        sql += ' AND veh.organisation_id = ?';
        params.push(orgId);
      }
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

  router.get('/visits', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const filter = await resolveAdminOrganisationFilter(pool, req, scope);
      if (!filter.ok) {
        return res.status(filter.status).json({ ok: false, message: filter.message });
      }
      const orgId = filter.organisationId;
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

      if (orgId) {
        sql += ' AND vis.organisation_id = ?';
        params.push(orgId);
      }
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

  router.get('/visits/:id', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub || null;
      const visitId = req.params.id;
      const scope = await getUserScope(pool, userId);
      const filter = await resolveAdminOrganisationFilter(pool, req, scope);
      if (!filter.ok) {
        return res.status(filter.status).json({ ok: false, message: filter.message });
      }
      const orgId = filter.organisationId;

      let sql = `
        SELECT ${VISIT_SELECT_FIELDS},
               o.name AS organisation_name,
               s.name AS site_name
        FROM visits vis
        ${VISIT_JOINS}
        INNER JOIN organisations o ON o.id = vis.organisation_id
        LEFT JOIN sites s ON s.id = vis.site_id
        WHERE vis.id = ?
      `;
      const params = [visitId];
      if (orgId) {
        sql += ' AND vis.organisation_id = ?';
        params.push(orgId);
      }
      sql += ' LIMIT 1';

      const [[visit]] = await pool.query(sql, params);
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
        `SELECT vis.id, vis.pass_code AS reference_number, vis.status, vis.purpose, vis.created_at,
                h.name AS host_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
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

  router.get('/audit', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const scope = await getUserScope(pool, userId);
      const filter = await resolveAdminOrganisationFilter(pool, req, scope);
      if (!filter.ok) {
        return res.status(filter.status).json({ ok: false, message: filter.message });
      }

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;
      const orgId = filter.organisationId;
      const params = [];
      let where = 'WHERE 1=1';

      if (orgId) {
        where += ' AND al.organisation_id = ?';
        params.push(orgId);
      }

      if (req.query.action) {
        where += ' AND al.action LIKE ?';
        params.push(`%${String(req.query.action).trim()}%`);
      }
      if (req.query.result) {
        where += ' AND al.result = ?';
        params.push(String(req.query.result).trim());
      }
      if (req.query.dateFrom) {
        where += ' AND al.created_at >= ?';
        params.push(String(req.query.dateFrom));
      }
      if (req.query.dateTo) {
        where += ' AND al.created_at <= ?';
        params.push(`${String(req.query.dateTo)} 23:59:59`);
      }

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS count FROM audit_logs al ${where}`,
        params,
      );

      const [rows] = await pool.query(
        `SELECT al.*, u.name AS actor_name, u.email AS actor_email, o.name AS organisation_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         LEFT JOIN organisations o ON o.id = al.organisation_id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      res.json({
        ok: true,
        data: { rows, total: Number(countRow?.count || 0), page, limit },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
