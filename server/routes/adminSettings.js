import express from 'express';
import {
  getAdminSettingsContext,
  updateAdminAccount,
  updateNotificationSettings,
  updateSecuritySettings,
  updateGeneralSettings,
  updateSmtpSettings,
  updateDojahSettings,
  updateSmsSettings,
  updatePushSettings,
} from '../services/adminSettingsService.js';
import { sendTestEmail, testSmsConnection, sendTestPush } from '../services/settingsTestService.js';
import { testDojahConnection } from '../services/dojahService.js';

export function createAdminSettingsRouter() {
  const router = express.Router();

  router.get('/settings', async (req, res) => {
    try {
      const data = await getAdminSettingsContext(req.adminClaims);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/account', async (req, res) => {
    try {
      const data = await updateAdminAccount(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/notifications', async (req, res) => {
    try {
      const data = await updateNotificationSettings(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/security', async (req, res) => {
    try {
      const data = await updateSecuritySettings(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/general', async (req, res) => {
    try {
      const data = await updateGeneralSettings(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/smtp', async (req, res) => {
    try {
      const data = await updateSmtpSettings(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.post('/settings/smtp/test', async (req, res) => {
    try {
      const to = String(req.body?.to || req.adminClaims?.email || '').trim();
      const result = await sendTestEmail(to);
      res.json({ ok: true, message: result.message });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/dojah', async (req, res) => {
    try {
      const data = await updateDojahSettings(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.post('/settings/dojah/test', async (req, res) => {
    try {
      const result = await testDojahConnection({ nrc: req.body?.nrc });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/sms', async (req, res) => {
    try {
      const data = await updateSmsSettings(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.patch('/settings/push', async (req, res) => {
    try {
      const data = await updatePushSettings(req.adminClaims, req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.post('/settings/push/generate', async (req, res) => {
    try {
      const webpush = (await import('web-push')).default;
      const keys = webpush.generateVAPIDKeys();
      res.json({ ok: true, data: { public_key: keys.publicKey, private_key: keys.privateKey } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/settings/push/test', async (req, res) => {
    try {
      const result = await sendTestPush(req.adminClaims);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  router.post('/settings/sms/test', async (req, res) => {
    try {
      const result = await testSmsConnection({
        phone: req.body?.phone,
        message: req.body?.message,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(error.status || 400).json({ ok: false, message: error.message });
    }
  });

  return router;
}
