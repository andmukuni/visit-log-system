import express from 'express';
import pool from '../db.js';
import { loadUserAdminPermissions } from '../rbacService.js';
import { writeAuditLog } from '../auditService.js';

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

const ADMIN_LEGACY_ROLE_SLUGS = new Set(['super_admin', 'org_admin', 'platform_admin']);

function mapUserRow(row) {
  const roleSlugs = String(row.role_slugs || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const roleNames = String(row.role_names || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    email_verified: row.email_verified,
    created_at: row.created_at,
    role_slugs: roleSlugs,
    role_names: roleNames,
    role_slug: roleSlugs[0] || '',
    role_name: roleNames[0] || '',
    role_id: row.primary_role_id || null,
  };
}

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

  router.get('/roles', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, slug, name, description, is_system
         FROM admin_roles
         ORDER BY name ASC`,
      );
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/users', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.email_verified, u.created_at,
                GROUP_CONCAT(DISTINCT ar.slug) AS role_slugs,
                GROUP_CONCAT(DISTINCT ar.name) AS role_names,
                MIN(ar.id) AS primary_role_id
         FROM users u
         LEFT JOIN user_admin_roles uar ON uar.user_id = u.id
         LEFT JOIN admin_roles ar ON ar.id = uar.role_id
         GROUP BY u.id, u.name, u.email, u.role, u.email_verified, u.created_at
         ORDER BY u.created_at DESC`,
      );
      res.json({ ok: true, data: rows.map(mapUserRow) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/users/:id', async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      if (!userId) {
        return res.status(400).json({ ok: false, message: 'User id is required.' });
      }
      const [[row]] = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.email_verified, u.created_at,
                GROUP_CONCAT(DISTINCT ar.slug) AS role_slugs,
                GROUP_CONCAT(DISTINCT ar.name) AS role_names,
                MIN(ar.id) AS primary_role_id
         FROM users u
         LEFT JOIN user_admin_roles uar ON uar.user_id = u.id
         LEFT JOIN admin_roles ar ON ar.id = uar.role_id
         WHERE u.id = ?
         GROUP BY u.id, u.name, u.email, u.role, u.email_verified, u.created_at
         LIMIT 1`,
        [userId],
      );
      if (!row) {
        return res.status(404).json({ ok: false, message: 'User not found.' });
      }
      res.json({ ok: true, data: mapUserRow(row) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.patch('/users/:id/role', async (req, res) => {
    try {
      const actorId = req.adminClaims?.sub;
      if (!actorId) {
        return res.status(401).json({ ok: false, message: 'Authentication required.' });
      }

      const userId = String(req.params.id || '').trim();
      const rawRoleId = req.body?.roleId ?? req.body?.role_id;
      const rawRoleSlug = req.body?.roleSlug ?? req.body?.role_slug;
      const roleId = rawRoleId == null || rawRoleId === '' ? '' : String(rawRoleId).trim();
      const roleSlug = rawRoleSlug == null || rawRoleSlug === '' ? '' : String(rawRoleSlug).trim();

      if (!userId) {
        return res.status(400).json({ ok: false, message: 'User id is required.' });
      }

      const [[user]] = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
        [userId],
      );
      if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found.' });
      }

      if (userId === actorId && !roleId && !roleSlug) {
        return res.status(400).json({ ok: false, message: 'You cannot remove your own role.' });
      }

      let role = null;
      if (roleId) {
        const [[row]] = await pool.query(
          'SELECT id, slug, name FROM admin_roles WHERE id = ? LIMIT 1',
          [roleId],
        );
        role = row || null;
      } else if (roleSlug) {
        const [[row]] = await pool.query(
          'SELECT id, slug, name FROM admin_roles WHERE slug = ? LIMIT 1',
          [roleSlug],
        );
        role = row || null;
      }

      if ((roleId || roleSlug) && !role) {
        return res.status(400).json({ ok: false, message: 'Selected role was not found.' });
      }

      if (userId === actorId && role && !ADMIN_LEGACY_ROLE_SLUGS.has(role.slug)) {
        return res.status(400).json({
          ok: false,
          message: 'You cannot demote your own account away from an admin role.',
        });
      }

      await pool.query('DELETE FROM user_admin_roles WHERE user_id = ?', [userId]);
      if (role?.id) {
        await pool.query(
          'INSERT INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
          [userId, role.id],
        );
      }

      const nextLegacyRole = role && ADMIN_LEGACY_ROLE_SLUGS.has(role.slug) ? 'admin' : 'user';
      if (String(user.role || '').toLowerCase() !== nextLegacyRole) {
        await pool.query('UPDATE users SET role = ? WHERE id = ?', [nextLegacyRole, userId]);
      }

      await writeAuditLog(pool, {
        actorUserId: actorId,
        action: 'user_role_updated',
        targetType: 'user',
        targetId: userId,
        details: {
          previous_legacy_role: user.role,
          role_slug: role?.slug || null,
          role_name: role?.name || null,
        },
      });

      const [[updated]] = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.email_verified, u.created_at,
                GROUP_CONCAT(DISTINCT ar.slug) AS role_slugs,
                GROUP_CONCAT(DISTINCT ar.name) AS role_names,
                MIN(ar.id) AS primary_role_id
         FROM users u
         LEFT JOIN user_admin_roles uar ON uar.user_id = u.id
         LEFT JOIN admin_roles ar ON ar.id = uar.role_id
         WHERE u.id = ?
         GROUP BY u.id, u.name, u.email, u.role, u.email_verified, u.created_at`,
        [userId],
      );

      res.json({ ok: true, data: mapUserRow(updated) });
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
