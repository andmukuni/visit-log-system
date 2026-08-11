import { generateId } from './visitorSchema.js';
import { writeAuditLog, writeVisitEvent, generatePassCode } from './auditService.js';
import { resolveGateEntryPlacement, requireUserScope, canTransition } from './scopeService.js';
import { findWatchlistMatches } from './watchlistService.js';
import { notifyVisitEvent } from './notificationService.js';
import { VISIT_SELECT_FIELDS, VISIT_JOINS, formatVisitResponse } from './visitResponseService.js';
import { permissionsFromRequest } from './classificationService.js';
import { createAppointmentForVisit, upsertVisitorContactDetails } from './accessSchema.js';
import { lookupNrc, getDojahIntegrationStatus, isDojahUnavailableError } from './services/dojahService.js';

function validateSignature(checkInSignature) {
  const signature = String(checkInSignature || '').trim();
  if (!signature.startsWith('data:image/')) {
    return { ok: false, status: 400, message: 'Check-in signature is required.' };
  }
  if (signature.length > 500_000) {
    return { ok: false, status: 400, message: 'Signature image is too large.' };
  }
  return { ok: true, signature };
}

export async function lookupReceptionDeskNrc(pool, { nrc, scope }) {
  const placement = await resolveGateEntryPlacement(pool, scope);
  if (!placement.ok) {
    return { ok: false, status: placement.status, message: placement.message };
  }

  const lookup = await lookupNrc(nrc, {
    customerReference: `reception-${scope?.site_id || 'desk'}`,
  });

  return {
    ok: true,
    data: {
      nrc: lookup.nrc,
      taxpayer_name: lookup.taxpayer_name,
      current_status: lookup.current_status,
      tpin: lookup.tpin || null,
    },
  };
}

export async function registerWalkInAtReceptionDesk(pool, req, body = {}) {
  const userId = req.adminClaims?.sub;
  const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
  if (!scopeResult.ok) {
    return { ok: false, status: scopeResult.status, message: scopeResult.message };
  }

  const placement = await resolveGateEntryPlacement(pool, scopeResult.scope);
  if (!placement.ok) {
    return { ok: false, status: placement.status, message: placement.message };
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
  } = body;

  let resolvedFullName = fullName?.trim() || '';
  const usingDojahOverride = Boolean(dojahOverride);

  if (String(idType || '').toLowerCase() === 'nrc' && idNumber?.trim()) {
    const dojah = await getDojahIntegrationStatus();
    if (dojah.enabled && !usingDojahOverride) {
      try {
        const lookup = await lookupNrc(idNumber.trim(), {
          customerReference: `reception-walkin-${siteId || 'desk'}`,
        });
        if (!resolvedFullName && lookup.taxpayer_name) {
          resolvedFullName = lookup.taxpayer_name;
        }
      } catch (error) {
        if (isDojahUnavailableError(error)) {
          return {
            ok: false,
            status: 503,
            message: error.message || 'Dojah service is temporarily unavailable.',
            unavailable: true,
          };
        }
        return {
          ok: false,
          status: error.status || 400,
          message: error.message || 'NRC verification failed.',
        };
      }
    }
  }

  if (!resolvedFullName) {
    return { ok: false, status: 400, message: 'Full name is required.' };
  }

  const signatureResult = validateSignature(checkInSignature);
  if (!signatureResult.ok) return signatureResult;

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
      details: { matchCount: watchlistMatches.length, source: 'reception_desk' },
    });
    return {
      ok: false,
      status: 403,
      message: 'Watchlist match — check-in blocked pending security review.',
      watchlistMatch: true,
    };
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

  await upsertVisitorContactDetails(pool, visitorId, { idType, idNumber });

  const visitId = generateId('visit');
  const passCode = generatePassCode();

  await pool.query(
    `INSERT INTO visits (id, organisation_id, site_id, station_id, visitor_id, host_id, category_id, purpose, status, pass_code, check_in_signature, checked_in_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reception_check_in', ?, ?, NOW(), ?)`,
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
      signatureResult.signature,
      userId,
    ],
  );

  await writeVisitEvent(pool, {
    visitId,
    eventType: 'reception_check_in',
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
      title: `Reception check-in: ${resolvedFullName}`,
      createdBy: userId,
    });
  } catch {
    // Non-blocking
  }

  await writeAuditLog(pool, {
    organisationId,
    actorUserId: userId,
    action: 'reception_entry.walk_in',
    targetType: 'visit',
    targetId: visitId,
    details: usingDojahOverride ? { dojah_override: true, id_number: idNumber?.trim() || null } : undefined,
  });

  if (usingDojahOverride) {
    await writeAuditLog(pool, {
      organisationId,
      actorUserId: userId,
      action: 'reception_entry.dojah_override',
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
    await notifyVisitEvent(pool, { visitId, eventType: 'reception_check_in', actorUserId: userId });
  } catch {
    // Non-blocking
  }

  const [[visit]] = await pool.query(
    `SELECT ${VISIT_SELECT_FIELDS} FROM visits vis ${VISIT_JOINS} WHERE vis.id = ?`,
    [visitId],
  );
  const perms = permissionsFromRequest(req);
  return {
    ok: true,
    status: 201,
    data: await formatVisitResponse(pool, visit, perms, { actorUserId: userId }),
  };
}

export async function registerVehicleAtReceptionDesk(pool, req, body = {}) {
  const userId = req.adminClaims?.sub;
  const scopeResult = await requireUserScope(pool, userId, req.adminClaims);
  if (!scopeResult.ok) {
    return { ok: false, status: scopeResult.status, message: scopeResult.message };
  }

  const placement = await resolveGateEntryPlacement(pool, scopeResult.scope);
  if (!placement.ok) {
    return { ok: false, status: placement.status, message: placement.message };
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
  } = body;

  if (!plateNumber?.trim()) {
    return { ok: false, status: 400, message: 'Plate number is required.' };
  }

  const signatureResult = validateSignature(checkInSignature);
  if (!signatureResult.ok) return signatureResult;

  const plate = plateNumber.trim().toUpperCase();
  let visitId = null;

  if (driverName?.trim() || hostId || purpose?.trim()) {
    const watchlistMatches = await findWatchlistMatches(pool, organisationId, {
      fullName: driverName?.trim(),
      phone: phone?.trim(),
    });
    if (watchlistMatches.length) {
      return {
        ok: false,
        status: 403,
        message: 'Watchlist match — check-in blocked pending security review.',
        watchlistMatch: true,
      };
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
      `INSERT INTO visits (id, organisation_id, site_id, station_id, visitor_id, host_id, purpose, status, pass_code, check_in_signature, checked_in_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'reception_check_in', ?, ?, NOW(), ?)`,
      [
        visitId,
        organisationId,
        siteId,
        stationId,
        visitorId,
        hostId || null,
        purpose?.trim() || null,
        passCode,
        signatureResult.signature,
        userId,
      ],
    );

    await writeVisitEvent(pool, {
      visitId,
      eventType: 'reception_check_in',
      actorUserId: userId,
      stationId,
      reason: purpose?.trim() || null,
    });
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
    if (visit && canTransition(visit.status, 'reception_check_in')) {
      await pool.query(
        `UPDATE visits SET status = 'reception_check_in', check_in_signature = COALESCE(check_in_signature, ?), checked_in_at = COALESCE(checked_in_at, NOW()), updated_at = NOW() WHERE id = ?`,
        [signatureResult.signature, visitId],
      );
      await writeVisitEvent(pool, { visitId, eventType: 'reception_check_in', actorUserId: userId, stationId: scope.station_id });
    } else {
      await pool.query(
        `UPDATE visits SET check_in_signature = COALESCE(check_in_signature, ?), updated_at = NOW() WHERE id = ?`,
        [signatureResult.signature, visitId],
      );
    }
  }

  await writeAuditLog(pool, {
    organisationId,
    actorUserId: userId,
    action: 'reception_entry.vehicle',
    targetType: 'vehicle',
    targetId: vehicleId,
  });

  const [[vehicle]] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
  return {
    ok: true,
    status: 201,
    data: { vehicle, visitId, entryId, matchedExpected: Boolean(expected?.id) },
  };
}
