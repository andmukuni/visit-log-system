import express from 'express';
import pool from '../db.js';
import {
  loadPublicHostApproval,
  decidePublicHostApproval,
} from '../hostApprovalService.js';

export function createHostApprovalRouter() {
  const router = express.Router();

  router.get('/:token', async (req, res) => {
    try {
      const loaded = await loadPublicHostApproval(pool, req.params.token);
      if (!loaded) {
        return res.status(404).json({ ok: false, message: 'Approval link not found or expired.' });
      }
      res.json({ ok: true, data: loaded.payload });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/:token/approve', async (req, res) => {
    try {
      const result = await decidePublicHostApproval(pool, {
        token: req.params.token,
        decision: 'approved',
        reason: req.body?.reason || null,
      });
      res.json({ ok: true, message: result.message, data: result.payload });
    } catch (error) {
      res.status(error.status || 500).json({
        ok: false,
        message: error.message,
        data: error.data || undefined,
      });
    }
  });

  router.post('/:token/reject', async (req, res) => {
    try {
      const result = await decidePublicHostApproval(pool, {
        token: req.params.token,
        decision: 'rejected',
        reason: req.body?.reason,
      });
      res.json({ ok: true, message: result.message, data: result.payload });
    } catch (error) {
      res.status(error.status || 500).json({
        ok: false,
        message: error.message,
        data: error.data || undefined,
      });
    }
  });

  return router;
}
