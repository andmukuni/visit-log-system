/**
 * Tenant and record scope enforcement — deny by default.
 */

export async function getUserScope(pool, userId) {
  const [[scope]] = await pool.query(
    `SELECT us.*,
            o.name AS organisation_name,
            s.name AS site_name,
            st.name AS station_name,
            d.name AS department_name,
            ofc.office_number,
            ofc.name AS office_name
     FROM user_scopes us
     LEFT JOIN organisations o ON o.id = us.organisation_id
     LEFT JOIN sites s ON s.id = us.site_id
     LEFT JOIN stations st ON st.id = us.station_id
     LEFT JOIN offices ofc ON ofc.id = us.office_id
     LEFT JOIN departments d ON d.id = COALESCE(us.department_id, ofc.department_id)
     WHERE us.user_id = ?
     LIMIT 1`,
    [userId],
  );
  return scope || null;
}

/**
 * Resolve where an employee/user belongs:
 * Employee → Department (single departments table)
 * Employee → Site/Branch
 * Optional: Employee → Office → Building
 * Then Organisation
 */
export async function resolveEmployeePlacement(pool, userId) {
  const [[row]] = await pool.query(
    `SELECT
       u.id AS user_id,
       u.name AS user_name,
       u.email AS user_email,
       ofc.id AS office_id,
       ofc.office_number,
       ofc.name AS office_name,
       d.id AS department_id,
       d.name AS department_name,
       d.code AS department_code,
       s.id AS site_id,
       s.name AS site_name,
       s.code AS site_code,
       o.id AS organisation_id,
       o.name AS organisation_name,
       o.slug AS organisation_slug
     FROM users u
     LEFT JOIN user_scopes us ON us.user_id = u.id
     LEFT JOIN hosts h ON h.user_id = u.id AND h.status = 'active'
     LEFT JOIN offices ofc ON ofc.id = COALESCE(us.office_id, h.office_id)
     LEFT JOIN departments d ON d.id = COALESCE(h.department_id, us.department_id, ofc.department_id)
     LEFT JOIN sites s ON s.id = COALESCE(h.site_id, us.site_id, ofc.site_id)
     LEFT JOIN organisations o ON o.id = COALESCE(h.organisation_id, us.organisation_id, ofc.organisation_id, d.organisation_id, s.organisation_id)
     WHERE u.id = ?
     LIMIT 1`,
    [userId],
  );
  return row || null;
}

export function isSuperAdmin(claims = {}) {
  const perms = claims.permissions || [];
  return claims.role === 'admin' && perms.length === 0
    || perms.includes('super_admin')
    || perms.includes('*');
}

/**
 * Returns { ok: true, scope } or { ok: false, status, message }
 */
export async function requireUserScope(pool, userId, claims = {}) {
  if (isSuperAdmin(claims)) {
    const scope = await getUserScope(pool, userId);
    if (scope?.organisation_id) return { ok: true, scope, elevated: true };

    const [[org]] = await pool.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
    if (!org?.id) return { ok: true, scope: null, elevated: true };

    // Elevated admins may have no user_scopes row — synthesize a minimal org scope
    // so station/gate routes do not crash on scope.organisation_id.
    return {
      ok: true,
      scope: {
        user_id: userId,
        organisation_id: org.id,
        site_id: null,
        station_id: null,
        department_id: null,
        office_id: null,
      },
      elevated: true,
    };
  }

  const scope = await getUserScope(pool, userId);
  if (!scope?.organisation_id) {
    return { ok: false, status: 403, message: 'No organisation scope assigned to this account.' };
  }
  return { ok: true, scope, elevated: false };
}

/**
 * Resolve a concrete site (and optional station) for gate/station writes.
 * Visits.site_id is NOT NULL — missing scope.site_id previously caused 500s.
 */
export async function resolveGateEntryPlacement(pool, scope = {}) {
  const organisationId = scope?.organisation_id || null;
  if (!organisationId) {
    return { ok: false, status: 400, message: 'No organisation scope assigned for gate entry.' };
  }

  let siteId = scope?.site_id || null;
  let stationId = scope?.station_id || null;

  if (!siteId && stationId) {
    const [[station]] = await pool.query(
      'SELECT site_id FROM stations WHERE id = ? LIMIT 1',
      [stationId],
    );
    siteId = station?.site_id || null;
  }

  if (!siteId) {
    const [[activeSite]] = await pool.query(
      `SELECT id FROM sites
       WHERE organisation_id = ? AND (status = 'active' OR status IS NULL OR status = '')
       ORDER BY created_at ASC
       LIMIT 1`,
      [organisationId],
    );
    siteId = activeSite?.id || null;
  }

  if (!siteId) {
    const [[anySite]] = await pool.query(
      'SELECT id FROM sites WHERE organisation_id = ? ORDER BY created_at ASC LIMIT 1',
      [organisationId],
    );
    siteId = anySite?.id || null;
  }

  if (!siteId) {
    return {
      ok: false,
      status: 400,
      message: 'No site is available for gate entry. Assign a site to this account or create a site.',
    };
  }

  if (!stationId) {
    const [[gateStation]] = await pool.query(
      `SELECT id FROM stations
       WHERE site_id = ? AND (type = 'gate' OR type = 'security' OR type IS NULL OR type = '')
       ORDER BY created_at ASC
       LIMIT 1`,
      [siteId],
    );
    stationId = gateStation?.id || null;
  }

  return { ok: true, organisationId, siteId, stationId };
}

export function visitMatchesScope(visit, scope, { elevated = false } = {}) {
  if (elevated || !scope?.organisation_id) return true;
  if (visit.organisation_id !== scope.organisation_id) return false;
  if (scope.site_id && visit.site_id !== scope.site_id) return false;
  return true;
}

export async function loadVisitScoped(pool, visitId, scope, { elevated = false } = {}) {
  const [[visit]] = await pool.query(`SELECT * FROM visits WHERE id = ?`, [visitId]);
  if (!visit) return { ok: false, status: 404, message: 'Visit not found.' };
  if (!visitMatchesScope(visit, scope, { elevated })) {
    return { ok: false, status: 403, message: 'Access denied for this visit record.' };
  }
  return { ok: true, visit };
}

export const VISIT_TRANSITIONS = {
  pre_registered: ['pending_approval', 'approved', 'expected', 'cancelled', 'rejected'],
  // Host can approve pre-arrival (approved/expected) or accept a reception-queued visitor (waiting).
  pending_approval: ['approved', 'expected', 'waiting', 'rejected', 'cancelled', 'checked_out', 'overdue'],
  approved: ['expected', 'arrived_at_gate', 'checked_in', 'reception_check_in', 'cancelled', 'expired'],
  expected: ['arrived_at_gate', 'reception_check_in', 'checked_in', 'queue', 'expired'],
  arrived_at_gate: ['entered_premises', 'reception_check_in', 'checked_in', 'checked_out', 'cancelled'],
  entered_premises: ['reception_check_in', 'checked_in', 'checked_out', 'queue'],
  // Desk queue sends the visitor to the host approvals list first.
  reception_check_in: ['pending_approval', 'waiting', 'in_meeting', 'checked_in', 'checked_out', 'overdue'],
  checked_in: ['pending_approval', 'waiting', 'in_meeting', 'checked_out', 'overdue', 'completed'],
  waiting: ['in_meeting', 'checked_out', 'overdue'],
  in_meeting: ['checked_out', 'overdue'],
  overdue: ['checked_out', 'completed'],
  checked_out: ['left_premises', 'completed'],
  left_premises: ['completed'],
  // On-site guests rejected by a host can be re-queued or checked out at the desk.
  rejected: ['pending_approval', 'checked_out', 'cancelled'],
  cancelled: [],
  denied: [],
  expired: [],
  completed: [],
};

export function canTransition(fromStatus, toStatus) {
  const allowed = VISIT_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/** Resolve the employee/host record linked to a user account */
export async function resolveHostForUser(pool, userId, userEmail = '') {
  const uid = String(userId || '').trim();
  if (uid) {
    const [[byUserId]] = await pool.query(
      `SELECT * FROM hosts WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [uid],
    );
    if (byUserId) return byUserId;
  }

  const email = String(userEmail || '').trim().toLowerCase();
  if (email) {
    const [[byEmail]] = await pool.query(
      `SELECT * FROM hosts WHERE LOWER(email) = ? AND status = 'active' LIMIT 1`,
      [email],
    );
    if (byEmail) return byEmail;
  }

  return null;
}

export function visitMatchesHost(visit, { hostId, userId } = {}) {
  if (!visit) return false;
  if (hostId && visit.host_id === hostId) return true;
  // Unassigned drafts only — never other hosts' calendars via created_by.
  if (userId && !visit.host_id && visit.created_by === userId) return true;
  return false;
}

export async function requireHostContext(pool, userId, userEmail, claims = {}) {
  const scopeResult = await requireUserScope(pool, userId, claims);
  if (!scopeResult.ok) {
    return { ok: false, status: scopeResult.status, message: scopeResult.message };
  }

  // Every host/executive calendar user must be linked to their own host profile.
  const host = await resolveHostForUser(pool, userId, userEmail);
  if (!host) {
    return {
      ok: false,
      status: 403,
      message: 'No host profile is linked to this account. Contact your administrator.',
    };
  }

  return {
    ok: true,
    scope: scopeResult.scope,
    host,
    elevated: scopeResult.elevated,
  };
}

export async function loadVisitForHost(pool, visitId, hostContext) {
  const [[visit]] = await pool.query(`SELECT * FROM visits WHERE id = ?`, [visitId]);
  if (!visit) return { ok: false, status: 404, message: 'Visit not found.' };

  if (!visitMatchesHost(visit, {
    hostId: hostContext.host?.id,
    userId: hostContext.userId,
  })) {
    return { ok: false, status: 403, message: 'You can only access visits assigned to you.' };
  }

  if (hostContext.scope?.organisation_id && visit.organisation_id !== hostContext.scope.organisation_id) {
    return { ok: false, status: 403, message: 'Access denied for this organisation.' };
  }

  return { ok: true, visit };
}

/**
 * SQL fragment: restrict visits to the current host's personal calendar.
 * Params: [hostId, userId]
 */
export function hostVisitFilter(alias = 'vis') {
  return `(${alias}.host_id = ? OR (${alias}.host_id IS NULL AND ${alias}.created_by = ?))`;
}

