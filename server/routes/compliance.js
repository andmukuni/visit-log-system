import express from 'express';
import pool from '../db.js';
import { generateId } from '../visitorSchema.js';
import { writeAuditLog } from '../auditService.js';
import { requireUserScope } from '../scopeService.js';
import { loadUserAdminPermissions } from '../rbacService.js';

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parsePage(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

export function createComplianceRouter() {
  const router = express.Router();

  async function getContext(req) {
    return requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
  }

  router.get('/dashboard', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) {
        return res.json({ ok: true, data: { auditToday: 0, exportsToday: 0, openPrivacy: 0, openIncidents: 0, approvalsToday: 0 } });
      }

      const orgId = ctx.scope.organisation_id;
      const start = todayStart();

      const countSince = async (table, extra = '', params = []) => {
        const [[row]] = await pool.query(
          `SELECT COUNT(*) AS count FROM ${table} WHERE organisation_id = ? AND created_at >= ?${extra}`,
          [orgId, start, ...params],
        );
        return Number(row?.count || 0);
      };

      const [[openPrivacy]] = await pool.query(
        `SELECT COUNT(*) AS count FROM privacy_requests WHERE organisation_id = ? AND status IN ('open', 'in_progress')`,
        [orgId],
      );

      const [[openIncidents]] = await pool.query(
        `SELECT COUNT(*) AS count FROM incidents WHERE organisation_id = ? AND status IN ('open', 'investigating')`,
        [orgId],
      );

      const [[approvalsToday]] = await pool.query(
        `SELECT COUNT(*) AS count FROM visit_approvals va
         INNER JOIN visits vis ON vis.id = va.visit_id
         WHERE vis.organisation_id = ? AND va.created_at >= ?`,
        [orgId, start],
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

      res.json({
        ok: true,
        data: {
          auditToday: await countSince('audit_logs'),
          exportsToday: await countSince('report_exports'),
          openPrivacy: Number(openPrivacy?.count || 0),
          openIncidents: Number(openIncidents?.count || 0),
          approvalsToday: Number(approvalsToday?.count || 0),
          recentAudit,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) return res.json({ ok: true, data: { rows: [], total: 0 } });

      const { page, limit, offset } = parsePage(req.query);
      const orgId = ctx.scope.organisation_id;
      const params = [orgId];
      let extra = '';

      if (req.query.action) {
        extra += ' AND al.action LIKE ?';
        params.push(`%${req.query.action}%`);
      }
      if (req.query.result) {
        extra += ' AND al.result = ?';
        params.push(req.query.result);
      }
      if (req.query.dateFrom) {
        extra += ' AND al.created_at >= ?';
        params.push(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        extra += ' AND al.created_at <= ?';
        params.push(`${req.query.dateTo} 23:59:59`);
      }

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS count FROM audit_logs al WHERE al.organisation_id = ?${extra}`,
        params,
      );

      const [rows] = await pool.query(
        `SELECT al.*, u.name AS actor_name, u.email AS actor_email
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.organisation_id = ?${extra}
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

  router.get('/approvals', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) return res.json({ ok: true, data: [] });

      const { limit, offset } = parsePage(req.query);
      const orgId = ctx.scope.organisation_id;

      const [rows] = await pool.query(
        `SELECT va.*, u.name AS approver_name, v.full_name AS visitor_name,
                vis.status AS visit_status, vis.purpose
         FROM visit_approvals va
         INNER JOIN visits vis ON vis.id = va.visit_id
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN users u ON u.id = va.approver_user_id
         WHERE vis.organisation_id = ?
         ORDER BY va.created_at DESC
         LIMIT ? OFFSET ?`,
        [orgId, limit, offset],
      );

      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/access', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) return res.json({ ok: true, data: [] });

      const orgId = ctx.scope.organisation_id;

      const [rows] = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.created_at,
                us.site_id, s.name AS site_name, st.name AS station_name,
                d.name AS department_name
         FROM user_scopes us
         INNER JOIN users u ON u.id = us.user_id
         LEFT JOIN sites s ON s.id = us.site_id
         LEFT JOIN stations st ON st.id = us.station_id
         LEFT JOIN departments d ON d.id = us.department_id
         WHERE us.organisation_id = ?
         ORDER BY u.name ASC`,
        [orgId],
      );

      const enriched = [];
      for (const row of rows) {
        const permissions = await loadUserAdminPermissions(pool, row.id, { legacyRole: row.role });
        const [roleRows] = await pool.query(
          `SELECT ar.name, ar.slug FROM user_admin_roles uar
           INNER JOIN admin_roles ar ON ar.id = uar.role_id
           WHERE uar.user_id = ?`,
          [row.id],
        );
        enriched.push({
          ...row,
          roles: roleRows,
          permissionCount: permissions.length,
        });
      }

      res.json({ ok: true, data: enriched });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/incidents', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) return res.json({ ok: true, data: [] });

      const orgId = ctx.scope.organisation_id;
      const [rows] = await pool.query(
        `SELECT i.*, s.name AS site_name, u.name AS reported_by_name
         FROM incidents i
         LEFT JOIN sites s ON s.id = i.site_id
         LEFT JOIN users u ON u.id = i.reported_by
         WHERE i.organisation_id = ?
         ORDER BY i.created_at DESC
         LIMIT 100`,
        [orgId],
      );

      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/privacy', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) return res.json({ ok: true, data: [] });

      const [rows] = await pool.query(
        `SELECT pr.*, u.name AS requested_by_name
         FROM privacy_requests pr
         LEFT JOIN users u ON u.id = pr.requested_by
         WHERE pr.organisation_id = ?
         ORDER BY pr.created_at DESC
         LIMIT 100`,
        [ctx.scope.organisation_id],
      );

      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/privacy', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { requestType = 'access', subjectName, subjectEmail, notes } = req.body || {};
      const id = generateId('pr');

      await pool.query(
        `INSERT INTO privacy_requests
         (id, organisation_id, request_type, subject_name, subject_email, status, notes, requested_by)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
        [
          id,
          ctx.scope.organisation_id,
          requestType,
          subjectName || null,
          subjectEmail || null,
          notes || null,
          req.adminClaims.sub,
        ],
      );

      await writeAuditLog(pool, {
        organisationId: ctx.scope.organisation_id,
        actorUserId: req.adminClaims.sub,
        action: 'privacy.request_created',
        targetType: 'privacy_request',
        targetId: id,
        ipAddress: req.ip,
      });

      res.json({ ok: true, data: { id } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/privacy/:id', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const { status, notes, assignedTo } = req.body || {};
      const updates = [];
      const params = [];

      if (status) {
        updates.push('status = ?');
        params.push(status);
        if (status === 'completed') updates.push('completed_at = NOW()');
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }
      if (assignedTo !== undefined) {
        updates.push('assigned_to = ?');
        params.push(assignedTo || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ ok: false, message: 'No fields to update.' });
      }

      params.push(req.params.id, ctx.scope.organisation_id);
      const [result] = await pool.query(
        `UPDATE privacy_requests SET ${updates.join(', ')} WHERE id = ? AND organisation_id = ?`,
        params,
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, message: 'Privacy request not found.' });
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/retention', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) return res.json({ ok: true, data: [] });

      const [rows] = await pool.query(
        `SELECT * FROM retention_policies WHERE organisation_id = ? ORDER BY category ASC`,
        [ctx.scope.organisation_id],
      );

      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
