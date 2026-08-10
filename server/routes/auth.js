import express from 'express';
import pool from '../db.js';
import { hashPassword, verifyPassword } from '../auth.js';
import { rateLimitByKey } from '../securityHelpers.js';
import {
  loadUserAdminPermissions,
  userCanAccessAdmin,
} from '../rbacService.js';
import { getSecuritySettings } from '../services/adminSettingsService.js';
import {
  consumePasswordResetToken,
  peekPasswordResetToken,
} from '../hostPortalService.js';

function mapAuthSessionUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role || 'user',
    email_verified: Boolean(user.email_verified),
  };
}

export function createAuthRouter({ authService }) {
  const router = express.Router();

  const rateLimitAuth = rateLimitByKey({
    windowMs: 15 * 60 * 1000,
    max: 10,
    routeKey: 'auth',
    getKey: (req) => req.ip || 'unknown',
  });

  router.post('/login', rateLimitAuth, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ ok: false, message: 'Email and password are required.' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

      const verification = user ? verifyPassword(password, user.password_hash) : { valid: false, needsUpgrade: false };
      if (!user || !verification.valid) {
        return res.status(401).json({ ok: false, message: 'Invalid email or password.' });
      }

      if (verification.needsUpgrade) {
        try {
          await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
        } catch (upgradeErr) {
          console.warn('[auth/login] Could not upgrade legacy password hash:', upgradeErr.message);
        }
      }

      if (!user.email_verified) {
        return res.status(403).json({
          ok: false,
          message: 'Please verify your email address before logging in.',
          unverified: true,
        });
      }

      const adminPermissions = await loadUserAdminPermissions(pool, user.id, { legacyRole: user.role });
      const canAccessAdmin = userCanAccessAdmin(user.role, adminPermissions);
      const sessionUser = {
        ...mapAuthSessionUser(user),
        admin_permissions: canAccessAdmin ? adminPermissions : [],
        admin_access: canAccessAdmin,
      };

      const token = authService.signUserToken(user, {
        adminPermissions,
        canAccessAdmin,
      });

      return res.json({ ok: true, data: sessionUser, token });
    } catch (error) {
      console.error('[auth/login]', error.message);
      return res.status(500).json({ ok: false, message: 'Login failed. Please try again.' });
    }
  });

  router.get('/reset-password', rateLimitAuth, async (req, res) => {
    try {
      const token = String(req.query?.token || '').trim();
      if (!token) {
        return res.status(400).json({ ok: false, message: 'Reset token is required.' });
      }
      const peek = await peekPasswordResetToken(pool, token);
      if (!peek.valid) {
        return res.status(400).json({
          ok: false,
          message: peek.reason === 'used'
            ? 'This password reset link has already been used.'
            : peek.reason === 'expired'
              ? 'This password reset link has expired.'
              : 'Invalid password reset link.',
        });
      }
      return res.json({
        ok: true,
        data: {
          email: peek.email,
          name: peek.name,
          expiresAt: peek.expiresAt,
        },
      });
    } catch (error) {
      console.error('[auth/reset-password:get]', error.message);
      return res.status(500).json({ ok: false, message: 'Could not validate reset link.' });
    }
  });

  router.post('/reset-password', rateLimitAuth, async (req, res) => {
    try {
      const token = String(req.body?.token || '').trim();
      const newPassword = String(req.body?.new_password || req.body?.password || '').trim();
      if (!token || !newPassword) {
        return res.status(400).json({ ok: false, message: 'Reset token and new password are required.' });
      }

      const security = await getSecuritySettings();
      const minLength = Number(security.min_password_length || 8);
      if (newPassword.length < minLength) {
        return res.status(400).json({
          ok: false,
          message: `New password must be at least ${minLength} characters.`,
        });
      }

      await consumePasswordResetToken(pool, token, newPassword);
      return res.json({ ok: true, message: 'Password updated. You can sign in with your new password.' });
    } catch (error) {
      console.error('[auth/reset-password]', error.message);
      return res.status(error.status || 500).json({
        ok: false,
        message: error.message || 'Could not reset password.',
      });
    }
  });

  router.post('/change-password', async (req, res) => {
    try {
      const auth = authService.getAdminAuth(req);
      if (!auth.ok) return authService.sendAuthFailure(res, auth);

      const userId = auth.claims?.sub;
      const { current_password: currentPassword, new_password: newPassword } = req.body || {};

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ ok: false, message: 'Current and new password are required.' });
      }

      const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found.' });
      }

      const verification = verifyPassword(currentPassword, user.password_hash);
      if (!verification.valid) {
        return res.status(400).json({ ok: false, message: 'Current password is incorrect.' });
      }

      const security = await getSecuritySettings();
      const minLength = Number(security.min_password_length || 8);
      if (String(newPassword).length < minLength) {
        return res.status(400).json({
          ok: false,
          message: `New password must be at least ${minLength} characters.`,
        });
      }

      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), userId]);
      return res.json({ ok: true, message: 'Password updated successfully.' });
    } catch (error) {
      console.error('[auth/change-password]', error.message);
      return res.status(500).json({ ok: false, message: 'Could not update password.' });
    }
  });

  router.post('/refresh-session', async (req, res) => {
    try {
      const auth = authService.getAdminAuth(req);
      if (!auth.ok) return authService.sendAuthFailure(res, auth);

      const userId = auth.claims?.sub;
      const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ ok: false, message: 'User not found.' });
      }

      const adminPermissions = await loadUserAdminPermissions(pool, user.id, { legacyRole: user.role });
      const canAccessAdmin = userCanAccessAdmin(user.role, adminPermissions);
      if (!canAccessAdmin) {
        return res.status(403).json({ ok: false, message: 'Administrator privileges required.' });
      }

      const token = authService.signUserToken(user, {
        adminPermissions,
        canAccessAdmin,
      });

      return res.json({
        ok: true,
        data: {
          permissions: adminPermissions,
        },
        token,
      });
    } catch (error) {
      console.error('[auth/refresh-session]', error.message);
      return res.status(500).json({ ok: false, message: 'Could not refresh session.' });
    }
  });

  return router;
}
