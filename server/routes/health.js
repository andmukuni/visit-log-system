import express from 'express';
import { API_SERVICE_NAME } from '../../shared/branding.js';

export function createHealthRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: API_SERVICE_NAME,
      version: '1.0.0',
    });
  });

  router.get('/db-test', async (_req, res) => {
    try {
      const { testConnection, getDbDriver } = await import('../db.js');
      const info = await testConnection();
      res.json({ ok: true, driver: getDbDriver(), data: info });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
