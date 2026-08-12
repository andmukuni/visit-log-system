/**
 * Centralized visitor-record access policy — deny by default.
 *
 * Composes scopeService (org/site scope + host ownership), receptionistService
 * (reception zone context), and securityGuardService (site/building/gate
 * scope) rather than reimplementing any of their logic. VIP/permission-based
 * field masking (shared/visitorPrivacy.js) is a separate, later pass — see
 * applyVisitAccessPolicy for the precedence rule.
 */
import {
  isSuperAdmin,
  requireUserScope,
  resolveHostForUser,
  visitMatchesHost,
} from './scopeService.js';
import { resolveReceptionZoneContext } from './receptionistService.js';
import { resolveSecurityScopeContext } from './securityGuardService.js';
import { maskVisitForViewer } from '../shared/visitorPrivacy.js';
import { writeAuditLog } from './auditService.js';
import {
  buildFullExpectedVisitorDTO,
  buildRestrictedExpectedVisitorDTO,
  buildSecurityExpectedVisitorDTO,
} from './visitorDto.js';

/**
 * Resolve every facet of a viewer's access in one call: org/site scope,
 * host ownership, reception zone context, security scope context. A user can
 * be more than one of these at once (e.g. an admin who is also a host) — the
 * context carries all applicable facets; evaluateVisitAccess picks the
 * highest-precedence applicable rule.
 */
export async function resolveViewerAccessContext(pool, { userId, claims = {} }) {
  const scopeResult = await requireUserScope(pool, userId, claims);
  const scope = scopeResult.ok ? scopeResult.scope : null;
  const isElevated = Boolean(scopeResult.ok && scopeResult.elevated) || isSuperAdmin(claims);

  const host = await resolveHostForUser(pool, userId, claims.email || '');
  const hostContext = host ? { hostId: host.id, userId } : null;

  const receptionCtx = await resolveReceptionZoneContext(pool, userId);
  const receptionContext = receptionCtx.isReceptionist
    ? { receptionistId: receptionCtx.receptionistId, zoneIds: receptionCtx.zoneIds }
    : null;

  const securityCtx = await resolveSecurityScopeContext(pool, userId);
  const securityContext = securityCtx.isSecurityOfficer
    ? {
      guardId: securityCtx.guardId,
      siteId: securityCtx.siteId,
      stationIds: securityCtx.stationIds,
      buildingIds: securityCtx.buildingIds,
    }
    : null;

  return {
    userId,
    permissions: claims.permissions || [],
    isElevated,
    scope,
    hostContext,
    receptionContext,
    securityContext,
  };
}

/**
 * Pure, synchronous decision function — cheap to run per-row in a list.
 * opts.visitZoneMatch / opts.securityMatches are booleans the caller computes
 * (SQL boolean column for lists, a direct lookup for single-record fetches).
 */
export function evaluateVisitAccess(viewer, visitRow, opts = {}) {
  if (!visitRow) return { level: 'denied', reason: 'not_found' };

  if (!viewer.isElevated && viewer.scope?.organisation_id && visitRow.organisation_id !== viewer.scope.organisation_id) {
    return { level: 'denied', reason: 'cross_tenant' };
  }

  if (viewer.isElevated) {
    return { level: 'full', reason: 'elevated' };
  }

  if (viewer.hostContext && visitMatchesHost(visitRow, viewer.hostContext)) {
    return { level: 'full', reason: 'host_owner' };
  }

  if (viewer.receptionContext) {
    if (opts.visitZoneMatch === true) {
      return { level: 'full', reason: 'zone_match' };
    }
    // Includes the fail-safe case: a host with no resolvable zone can never
    // produce a zone match, so it always lands here — restricted, never full.
    return { level: 'restricted', reason: 'zone_mismatch' };
  }

  if (viewer.securityContext) {
    if (opts.securityMatches === true) {
      return { level: 'gate', reason: 'security_scope_match' };
    }
    return { level: 'denied', reason: 'security_scope_mismatch' };
  }

  return { level: 'denied', reason: 'no_relationship' };
}

/**
 * Precedence rule: the access-level decision (structural) always runs first
 * and picks the DTO shape; VIP masking (value substitution) only runs for
 * full/gate levels, on the fields that DTO already includes. A restricted row
 * never runs VIP masking at all — its allowlist contains none of the fields
 * VIP masking touches, so the more restrictive axis wins by construction.
 */
export function applyVisitAccessPolicy(row, viewer, opts = {}) {
  const decision = evaluateVisitAccess(viewer, row, opts);
  if (decision.level === 'denied') return null;

  if (decision.level === 'restricted') {
    return buildRestrictedExpectedVisitorDTO(row, { reason: decision.reason });
  }

  const masked = maskVisitForViewer(row, viewer.permissions || []);
  if (decision.level === 'gate') {
    return buildSecurityExpectedVisitorDTO(masked);
  }
  return buildFullExpectedVisitorDTO(masked, opts.dtoOptions || {});
}

/** List helper — drops 'denied' rows entirely (never returned redacted). */
export function applyVisitAccessPolicyToRows(rows, viewer, opts = {}) {
  return (rows || [])
    .map((row) => applyVisitAccessPolicy(row, viewer, {
      ...opts,
      visitZoneMatch: opts.zoneMatchColumn ? Boolean(row[opts.zoneMatchColumn]) : opts.visitZoneMatch,
      securityMatches: opts.securityMatchColumn ? Boolean(row[opts.securityMatchColumn]) : opts.securityMatches,
    }))
    .filter(Boolean);
}

/** Fires for a direct single-record access attempt that resolves 'denied'. */
export async function auditVisitAccessDenied(pool, { organisationId, actorUserId, visitId, reason }) {
  await writeAuditLog(pool, {
    organisationId,
    actorUserId,
    action: 'visitor.access_denied_zone',
    targetType: 'visit',
    targetId: visitId,
    result: 'denied',
    details: { reason },
  });
}

/** Fires for a single-visit detail load that resolves 'full' — mirrors the existing vip.profile_access precedent. */
export async function auditFullRecordViewed(pool, { organisationId, actorUserId, visitId }) {
  await writeAuditLog(pool, {
    organisationId,
    actorUserId,
    action: 'visitor.full_record_viewed',
    targetType: 'visit',
    targetId: visitId,
  });
}
