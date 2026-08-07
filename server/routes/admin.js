import express from 'express';
import pool from '../db.js';
import { loadUserAdminPermissions } from '../rbacService.js';

const DEMO_STATS = {
  users: 128,
  orders: 342,
  revenue: 84500,
  activeSessions: 24,
  growthPct: 12.4,
};

const DEMO_ITEMS = [
  { id: 'item-001', name: 'Starter Widget', status: 'published', category: 'Hardware', updatedAt: '2026-07-10' },
  { id: 'item-002', name: 'Pro Subscription', status: 'draft', category: 'Software', updatedAt: '2026-07-11' },
  { id: 'item-003', name: 'Team License', status: 'published', category: 'Software', updatedAt: '2026-07-12' },
  { id: 'item-004', name: 'Support Pack', status: 'archived', category: 'Services', updatedAt: '2026-07-08' },
  { id: 'item-005', name: 'Analytics Add-on', status: 'published', category: 'Software', updatedAt: '2026-07-13' },
];

export function createAdminRouter() {
  const router = express.Router();

  router.get('/dashboard/stats', async (_req, res) => {
    try {
      const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM users');
      const liveUsers = Number(row?.count || 0);
      res.json({
        ok: true,
        data: {
          ...DEMO_STATS,
          users: liveUsers || DEMO_STATS.users,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/users/count', async (_req, res) => {
    try {
      const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM users');
      res.json({ ok: true, count: Number(row?.count || 0) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/users', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, email, role, email_verified, created_at FROM users ORDER BY created_at DESC',
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/items', (_req, res) => {
    res.json({ ok: true, data: DEMO_ITEMS });
  });

  router.get('/rbac/me', async (req, res) => {
    try {
      const userId = req.adminClaims?.sub;
      if (!userId) {
        return res.status(401).json({ ok: false, message: 'Authentication required.' });
      }
      const [[user]] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found.' });
      }
      const permissions = await loadUserAdminPermissions(pool, user.id, { legacyRole: user.role });
      res.json({ ok: true, data: { permissions } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
