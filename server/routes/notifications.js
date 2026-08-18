import express from 'express';
import pool from '../db.js';
import { requireUserScope } from '../scopeService.js';
import {
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUserNotificationPreferences,
  upsertUserNotificationPreferences,
  getDeliveryStats,
} from '../notificationService.js';
import { getNotificationSettings } from '../services/adminSettingsService.js';
import { NOTIFICATION_CATEGORY_META } from '../../shared/notificationCategories.js';

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

  router.get('/preferences', async (req, res) => {
    try {
      const ctx = await requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const [preferences, orgDefaults] = await Promise.all([
        getUserNotificationPreferences(pool, req.adminClaims.sub, ctx.scope.organisation_id),
        getNotificationSettings(),
      ]);

      res.json({
        ok: true,
        data: {
          categories: NOTIFICATION_CATEGORY_META,
          preferences,
          org_defaults: {
            in_app_notifications: Boolean(orgDefaults.in_app_notifications),
            ...Object.fromEntries(
              NOTIFICATION_CATEGORY_META.flatMap((cat) => [
                [`email_${cat.key}`, Boolean(orgDefaults[`email_${cat.key}`])],
                [`sms_${cat.key}`, Boolean(orgDefaults[`sms_${cat.key}`])],
              ]),
            ),
          },
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/preferences', async (req, res) => {
    try {
      const ctx = await requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });

      const preferences = Array.isArray(req.body?.preferences) ? req.body.preferences : [];
      const rows = await upsertUserNotificationPreferences(pool, {
        userId: req.adminClaims.sub,
        organisationId: ctx.scope.organisation_id,
        preferences,
      });
      res.json({ ok: true, data: rows });
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

  router.get('/push/vapid-public-key', async (req, res) => {
    try {
      const { resolveVapidConfig } = await import('../pushSubscriptionService.js');
      const config = await resolveVapidConfig();
      if (!config.configured) {
        return res.status(503).json({ ok: false, message: 'Push notifications are not configured on this server.' });
      }
      res.json({ ok: true, data: { publicKey: config.publicKey } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/push/subscribe', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const { endpoint, keys } = req.body || {};
      const { savePushSubscription } = await import('../pushSubscriptionService.js');
      const result = await savePushSubscription(pool, {
        userId,
        endpoint,
        p256dh: keys?.p256dh,
        auth: keys?.auth,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  });

  router.delete('/push/subscribe', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      const endpoint = req.body?.endpoint;
      const { removePushSubscription } = await import('../pushSubscriptionService.js');
      await removePushSubscription(pool, { userId, endpoint });
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

      const [rows, stats] = await Promise.all([
        pool.query(
          `SELECT n.*, u.name AS user_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.user_id
           WHERE n.organisation_id = ?
           ORDER BY n.created_at DESC
           LIMIT 50`,
          [ctx.scope.organisation_id],
        ).then(([r]) => r),
        getDeliveryStats(pool),
      ]);
      res.json({ ok: true, data: rows, delivery: stats });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
