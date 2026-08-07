import express from 'express';
import pool from '../db.js';
import { requireUserScope } from '../scopeService.js';
import {
  listRollCalls,
  getActiveRollCall,
  getRollCallWithEntries,
  startRollCall,
  markRollCallEntry,
  closeRollCall,
} from '../rollCallService.js';

function scopeSiteFilter(scope, elevated, column = 'vis.site_id') {
  if (elevated || !scope?.site_id) return { sql: '', params: [] };
  return { sql: ` AND ${column} = ?`, params: [scope.site_id] };
}

export function createEmergencyRouter() {
  const router = express.Router();

  async function getContext(req) {
    return requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
  }

  router.get('/dashboard', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { scope, elevated } = ctx;
      const params = [scope.organisation_id];
      const { sql, params: siteParams } = scopeSiteFilter(scope, elevated);
      params.push(...siteParams);

      const [[currentlyInside]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visits vis WHERE vis.organisation_id = ?${sql} AND vis.status = 'checked_in'`,
        params,
      );

      const activeRollCall = await getActiveRollCall(pool, scope, { elevated });
      let unresolved = 0;
      if (activeRollCall) {
        const detail = await getRollCallWithEntries(pool, activeRollCall.id);
        unresolved = detail?.entries?.filter((e) => e.status === 'not_yet_accounted_for').length || 0;
      }

      res.json({
        ok: true,
        data: {
          currentlyInside: Number(currentlyInside?.count || 0),
          activeRollCall: activeRollCall
            ? { id: activeRollCall.id, startedAt: activeRollCall.started_at, reason: activeRollCall.reason }
            : null,
          unresolved,
          scope: { siteName: scope.site_name, organisationName: scope.organisation_name },
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

      const params = [ctx.scope.organisation_id];
      const { sql, params: siteParams } = scopeSiteFilter(ctx.scope, ctx.elevated);
      params.push(...siteParams);

      const [rows] = await pool.query(
        `SELECT vis.id, vis.badge_number, vis.checked_in_at,
                v.full_name, v.phone, h.name AS host_name, s.name AS site_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN sites s ON s.id = vis.site_id
         WHERE vis.organisation_id = ?${sql} AND vis.status = 'checked_in'
         ORDER BY vis.checked_in_at DESC`,
        params,
      );

      res.json({ ok: true, data: rows });
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
        reason: req.body?.reason || 'Emergency evacuation',
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

  router.get('/unresolved', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const active = await getActiveRollCall(pool, ctx.scope, { elevated: ctx.elevated });
      if (!active) {
        return res.json({ ok: true, data: { entries: [], rollCallId: null } });
      }

      const detail = await getRollCallWithEntries(pool, active.id);
      const unresolved = (detail?.entries || []).filter(
        (e) => e.status === 'not_yet_accounted_for' || e.status === 'unknown',
      );
      res.json({ ok: true, data: { entries: unresolved, rollCallId: active.id } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/history', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const rollCalls = await listRollCalls(pool, ctx.scope, { elevated: ctx.elevated, limit: 50 });
      const closed = rollCalls.filter((r) => r.status === 'closed');
      res.json({ ok: true, data: closed });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
