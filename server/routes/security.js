import express from 'express';
import pool from '../db.js';
import { generateId } from '../visitorSchema.js';
import { writeAuditLog } from '../auditService.js';
import { requireUserScope } from '../scopeService.js';
import { findWatchlistMatches } from '../watchlistService.js';
import {
  listRollCalls,
  getActiveRollCall,
  getRollCallWithEntries,
  startRollCall,
  markRollCallEntry,
  closeRollCall,
} from '../rollCallService.js';
import { applyVisitListMasking } from '../visitResponseService.js';
import { permissionsFromRequest } from '../classificationService.js';

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function scopeSiteFilter(scope, elevated, column = 'vis.site_id') {
  if (elevated || !scope?.site_id) return { sql: '', params: [] };
  return { sql: ` AND ${column} = ?`, params: [scope.site_id] };
}

function maskVisitRowsForRequest(req, rows) {
  return applyVisitListMasking(rows, permissionsFromRequest(req));
}

function visitListSql(scope, elevated, extraWhere = '', orderBy = 'vis.created_at DESC') {
  const params = [scope.organisation_id];
  const { sql, params: siteParams } = scopeSiteFilter(scope, elevated);
  params.push(...siteParams);
  return {
    sql: `
      SELECT vis.*, v.full_name, v.phone, v.email, v.company,
             vc.name AS category_name, COALESCE(vc.classification, 'standard') AS classification,
             h.name AS host_name, s.name AS site_name
      FROM visits vis
      INNER JOIN visitors v ON v.id = vis.visitor_id
      LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
      LEFT JOIN hosts h ON h.id = vis.host_id
      LEFT JOIN sites s ON s.id = vis.site_id
      WHERE vis.organisation_id = ?${sql}${extraWhere}
      ORDER BY ${orderBy}
      LIMIT 200
    `,
    params,
  };
}

export function createSecurityRouter() {
  const router = express.Router();

  async function getContext(req) {
    const userId = req.adminClaims?.sub;
    return requireUserScope(pool, userId, req.adminClaims);
  }

  router.get('/dashboard', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { scope, elevated } = ctx;
      const orgId = scope.organisation_id;
      const params = [orgId];
      const { sql: siteSql, params: siteParams } = scopeSiteFilter(scope, elevated);
      params.push(...siteParams);
      const start = todayStart();

      const countVisits = async (extra = '', extraParams = []) => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM visits vis WHERE vis.organisation_id = ?${siteSql}${extra}`,
          [...params, ...extraParams],
        );
        return Number(row?.count || 0);
      };

      const incidentParams = [orgId];
      const { sql: incidentSiteSql, params: incidentSiteParams } = scopeSiteFilter(scope, elevated, 'site_id');
      incidentParams.push(...incidentSiteParams);

      const [[openIncidents]] = await pool.query(
        `SELECT COUNT(*) AS count FROM incidents
         WHERE organisation_id = ?${incidentSiteSql} AND status IN ('open', 'investigating')`,
        incidentParams,
      );

      const [[watchlistCount]] = await pool.query(
        `SELECT COUNT(*) AS count FROM watchlist_entries WHERE organisation_id = ? AND status = 'active'`,
        [orgId],
      );

      const activeRollCall = await getActiveRollCall(pool, scope, { elevated });

      const [recentActivity] = await pool.query(
        `SELECT ve.id, ve.event_type, ve.created_at, v.full_name AS visitor_name, vis.status AS visit_status
         FROM visit_events ve
         INNER JOIN visits vis ON vis.id = ve.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         WHERE vis.organisation_id = ?${siteSql}
         ORDER BY ve.created_at DESC
         LIMIT 10`,
        params,
      );

      res.json({
        ok: true,
        data: {
          currentlyInside: await countVisits(` AND vis.status = 'checked_in'`),
          pendingApprovals: await countVisits(` AND vis.status IN ('pending_approval', 'pre_registered')`),
          overdueVisits: await countVisits(` AND vis.status = 'overdue'`),
          exceptionsToday: await countVisits(` AND vis.status IN ('rejected', 'denied') AND vis.created_at >= ?`, [start]),
          openIncidents: Number(openIncidents?.count || 0),
          watchlistEntries: Number(watchlistCount?.count || 0),
          activeRollCall: activeRollCall ? { id: activeRollCall.id, startedAt: activeRollCall.started_at } : null,
          recentActivity,
          scope: {
            organisationName: scope.organisation_name,
            siteName: scope.site_name,
          },
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/occupancy', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { scope, elevated } = ctx;
      const params = [scope.organisation_id];
      const { sql, params: siteParams } = scopeSiteFilter(scope, elevated, 'vis');
      params.push(...siteParams);

      const [rows] = await pool.query(
        `SELECT vis.id, vis.status, vis.checked_in_at, vis.badge_number,
                v.full_name, v.phone, v.company, h.name AS host_name,
                vc.name AS category_name, s.name AS site_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         LEFT JOIN sites s ON s.id = vis.site_id
         WHERE vis.organisation_id = ?${sql}
           AND vis.status IN ('checked_in', 'reception_check_in', 'waiting', 'in_meeting')
         ORDER BY vis.checked_in_at DESC`,
        params,
      );

      res.json({ ok: true, data: maskVisitRowsForRequest(req, rows) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/approvals', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { sql, params } = visitListSql(
        ctx.scope,
        ctx.elevated,
        ` AND vis.status IN ('pending_approval', 'pre_registered')`,
      );
      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: maskVisitRowsForRequest(req, rows) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/exceptions', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { sql, params } = visitListSql(
        ctx.scope,
        ctx.elevated,
        ` AND vis.status IN ('rejected', 'denied', 'overdue', 'expired')`,
      );
      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: maskVisitRowsForRequest(req, rows) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/overdue', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { sql, params } = visitListSql(ctx.scope, ctx.elevated, ` AND vis.status = 'overdue'`);
      const [rows] = await pool.query(sql, params);
      res.json({ ok: true, data: maskVisitRowsForRequest(req, rows) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/visitors', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const q = String(req.query.q || '').trim();
      let extra = '';
      const extraParams = [];
      if (q) {
        extra = ` AND (v.full_name LIKE ? OR v.phone LIKE ? OR v.company LIKE ? OR vis.pass_code LIKE ?)`;
        const like = `%${q}%`;
        extraParams.push(like, like, like, like);
      }

      const { sql, params } = visitListSql(ctx.scope, ctx.elevated, extra);
      const [rows] = await pool.query(sql, [...params, ...extraParams]);
      res.json({ ok: true, data: maskVisitRowsForRequest(req, rows) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/watchlist', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const [rows] = await pool.query(
        `SELECT w.*, u.name AS created_by_name
         FROM watchlist_entries w
         LEFT JOIN users u ON u.id = w.created_by
         WHERE w.organisation_id = ?
         ORDER BY w.created_at DESC
         LIMIT 100`,
        [ctx.scope.organisation_id],
      );
      res.json({ ok: true, data: maskVisitRowsForRequest(req, rows) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/watchlist', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const {
        entryType = 'visitor',
        fullName,
        phone,
        email,
        plateNumber,
        reason,
        severity = 'medium',
        validFrom,
        validUntil,
      } = req.body || {};

      if (!reason?.trim()) {
        return res.status(400).json({ ok: false, message: 'Reason is required for watchlist entries.' });
      }

      const id = generateId('wl');
      await pool.query(
        `INSERT INTO watchlist_entries
         (id, organisation_id, entry_type, full_name, phone, email, plate_number, reason, severity, valid_from, valid_until, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          ctx.scope.organisation_id,
          entryType,
          fullName || null,
          phone || null,
          email || null,
          plateNumber || null,
          reason.trim(),
          severity,
          validFrom || null,
          validUntil || null,
          req.adminClaims.sub,
        ],
      );

      await writeAuditLog(pool, {
        organisationId: ctx.scope.organisation_id,
        actorUserId: req.adminClaims.sub,
        action: 'watchlist.created',
        targetType: 'watchlist_entry',
        targetId: id,
        ipAddress: req.ip,
      });

      res.json({ ok: true, data: { id } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/watchlist/:id', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { status, reason, severity } = req.body || {};
      const updates = [];
      const params = [];

      if (status) {
        updates.push('status = ?');
        params.push(status);
      }
      if (reason !== undefined) {
        updates.push('reason = ?');
        params.push(reason);
      }
      if (severity) {
        updates.push('severity = ?');
        params.push(severity);
      }

      if (updates.length === 0) {
        return res.status(400).json({ ok: false, message: 'No fields to update.' });
      }

      params.push(req.params.id, ctx.scope.organisation_id);
      const [result] = await pool.query(
        `UPDATE watchlist_entries SET ${updates.join(', ')} WHERE id = ? AND organisation_id = ?`,
        params,
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, message: 'Watchlist entry not found.' });
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/incidents', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const params = [ctx.scope.organisation_id];
      const { sql, params: siteParams } = scopeSiteFilter(ctx.scope, ctx.elevated, 'i.site_id');
      params.push(...siteParams);

      const [rows] = await pool.query(
        `SELECT i.*, s.name AS site_name, u.name AS reported_by_name
         FROM incidents i
         LEFT JOIN sites s ON s.id = i.site_id
         LEFT JOIN users u ON u.id = i.reported_by
         WHERE i.organisation_id = ?${sql}
         ORDER BY i.created_at DESC
         LIMIT 100`,
        params,
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/incidents', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const {
        title,
        narrative,
        incidentType = 'security',
        severity = 'medium',
        visitId,
        siteId,
      } = req.body || {};

      if (!title?.trim()) {
        return res.status(400).json({ ok: false, message: 'Incident title is required.' });
      }

      const id = generateId('inc');
      await pool.query(
        `INSERT INTO incidents
         (id, organisation_id, site_id, visit_id, incident_type, severity, status, title, narrative, reported_by)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
        [
          id,
          ctx.scope.organisation_id,
          siteId || ctx.scope.site_id || null,
          visitId || null,
          incidentType,
          severity,
          title.trim(),
          narrative || null,
          req.adminClaims.sub,
        ],
      );

      await writeAuditLog(pool, {
        organisationId: ctx.scope.organisation_id,
        actorUserId: req.adminClaims.sub,
        action: 'incident.created',
        targetType: 'incident',
        targetId: id,
        ipAddress: req.ip,
      });

      res.json({ ok: true, data: { id } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/incidents/:id', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { status, severity, narrative } = req.body || {};
      const updates = [];
      const params = [];

      if (status) {
        updates.push('status = ?');
        params.push(status);
        if (status === 'resolved') updates.push('resolved_at = NOW()');
      }
      if (severity) {
        updates.push('severity = ?');
        params.push(severity);
      }
      if (narrative !== undefined) {
        updates.push('narrative = ?');
        params.push(narrative);
      }

      if (updates.length === 0) {
        return res.status(400).json({ ok: false, message: 'No fields to update.' });
      }

      params.push(req.params.id, ctx.scope.organisation_id);
      const [result] = await pool.query(
        `UPDATE incidents SET ${updates.join(', ')} WHERE id = ? AND organisation_id = ?`,
        params,
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, message: 'Incident not found.' });
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/roll-call', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const rollCalls = await listRollCalls(pool, ctx.scope, { elevated: ctx.elevated });
      const active = await getActiveRollCall(pool, ctx.scope, { elevated: ctx.elevated });
      res.json({ ok: true, data: { rollCalls, active } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/roll-call', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const result = await startRollCall(pool, {
        scope: ctx.scope,
        elevated: ctx.elevated,
        userId: req.adminClaims.sub,
        reason: req.body?.reason || '',
        siteId: req.body?.siteId || null,
        ipAddress: req.ip,
      });

      if (!result.ok) {
        return res.status(result.status).json({ ok: false, message: result.message, rollCallId: result.rollCallId });
      }

      const detail = await getRollCallWithEntries(pool, result.rollCallId);
      res.json({ ok: true, data: detail });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/roll-call/:id', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const detail = await getRollCallWithEntries(pool, req.params.id);
      if (!detail) return res.status(404).json({ ok: false, message: 'Roll call not found.' });
      if (detail.organisation_id !== ctx.scope.organisation_id) {
        return res.status(403).json({ ok: false, message: 'Access denied.' });
      }

      res.json({ ok: true, data: detail });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/roll-call/:id/mark', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const result = await markRollCallEntry(pool, {
        rollCallId: req.params.id,
        entryId: req.body?.entryId,
        status: req.body?.status,
        notes: req.body?.notes || '',
        userId: req.adminClaims.sub,
        ipAddress: req.ip,
      });

      if (!result.ok) return res.status(result.status).json({ ok: false, message: result.message });

      const detail = await getRollCallWithEntries(pool, req.params.id);
      res.json({ ok: true, data: detail });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/roll-call/:id/close', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const result = await closeRollCall(pool, {
        rollCallId: req.params.id,
        userId: req.adminClaims.sub,
        notes: req.body?.notes || '',
        ipAddress: req.ip,
      });

      if (!result.ok) return res.status(result.status).json({ ok: false, message: result.message });

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const [rows] = await pool.query(
        `SELECT al.*, u.name AS actor_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.organisation_id = ?
         ORDER BY al.created_at DESC
         LIMIT 50`,
        [ctx.scope.organisation_id],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/watchlist/check', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const matches = await findWatchlistMatches(pool, ctx.scope.organisation_id, req.body || {});
      res.json({ ok: true, data: matches });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
