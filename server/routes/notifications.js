import express from 'express';
import pool from '../db.js';
import { requireUserScope } from '../scopeService.js';
import {
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../notificationService.js';

export function createNotificationsRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const unreadOnly = req.query.unread === '1';
      const rows = await listUserNotifications(pool, userId, { unreadOnly });
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/read-all', async (req, res) => {
    try {
      await markAllNotificationsRead(pool, req.adminClaims.sub);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:id/read', async (req, res) => {
    try {
      const ok = await markNotificationRead(pool, req.params.id, req.adminClaims.sub);
      if (!ok) return res.status(404).json({ ok: false, message: 'Notification not found.' });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/templates', async (req, res) => {
    try {
      const ctx = await requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const [rows] = await pool.query(
        `SELECT * FROM notification_templates WHERE organisation_id = ? ORDER BY template_key ASC`,
        [ctx.scope.organisation_id],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/org/recent', async (req, res) => {
    try {
      const ctx = await requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const [rows] = await pool.query(
        `SELECT n.*, u.name AS user_name
         FROM notifications n
         LEFT JOIN users u ON u.id = n.user_id
         WHERE n.organisation_id = ?
         ORDER BY n.created_at DESC
         LIMIT 50`,
        [ctx.scope.organisation_id],
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
