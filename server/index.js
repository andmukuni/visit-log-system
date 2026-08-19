import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { createAuthService } from './auth.js';
import { bootstrapDatabase } from './schema.js';
import { evaluateCorsOrigin } from './securityHelpers.js';
import {
  ALL_PERMISSION_KEYS,
  permissionMatches,
  hasAnyPermission,
} from '../shared/rbacPermissions.js';
import { resolveRouteAdminPermission, loadUserAdminPermissions, resolveVisitRoutePermissions } from './rbacService.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';
import {
  createStationRouter,
  createVisitsRouter,
  createVehiclesRouter,
  createOrgAdminRouter,
} from './routes/visitor.js';
import { createHostRouter } from './routes/host.js';
import { createSecurityRouter } from './routes/security.js';
import { createEmergencyRouter } from './routes/emergency.js';
import { createReportsRouter } from './routes/reports.js';
import { createComplianceRouter } from './routes/compliance.js';
import { createPlatformRouter } from './routes/platform.js';
import { createExecutiveRouter } from './routes/executive.js';
import { createReceptionRouter } from './routes/reception.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createAdminSettingsRouter } from './routes/adminSettings.js';
import { createKioskRouter } from './routes/kiosk.js';
import { createHostApprovalRouter } from './routes/hostApproval.js';
import { createSignatureBoardRouter } from './routes/signatureBoard.js';
import pool from './db.js';
import { waitForDatabase } from './waitForDatabase.js';
import { retryFailedDeliveries, notifyPreArrivalReminders } from './notificationService.js';
import { markOverdueVisits } from './visitOverdue.js';
import { getDeliveryConfig } from './adapters/deliveryConfig.js';
import { APP_NAME } from '../shared/branding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });
dotenv.config({ quiet: true });

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 4000);
const DEFAULT_AUTH_TOKEN_SECRET = 'dev-only-auth-secret';
const AUTH_TOKEN_SECRET_SOURCE = String(process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET || '').trim();
const AUTH_TOKEN_SECRET = AUTH_TOKEN_SECRET_SOURCE || DEFAULT_AUTH_TOKEN_SECRET;
const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || '').trim();

if (IS_PRODUCTION && (!AUTH_TOKEN_SECRET_SOURCE || AUTH_TOKEN_SECRET === DEFAULT_AUTH_TOKEN_SECRET)) {
  throw new Error('AUTH_TOKEN_SECRET or JWT_SECRET must be set to a strong value in production.');
}

const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const appUrl = String(process.env.APP_URL || '').trim().replace(/\/$/, '');
const serverOrigin = appUrl || undefined;

const app = express();

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const authService = createAuthService({
  secret: AUTH_TOKEN_SECRET,
  adminApiKey: ADMIN_API_KEY,
  allPermissionKeys: ALL_PERMISSION_KEYS,
});

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/api', cors({
  origin(origin, callback) {
    const result = evaluateCorsOrigin(origin, {
      corsOrigins,
      serverOrigin,
      nodeEnv: process.env.NODE_ENV || 'development',
    });
    if (result.allowed) return callback(null, true);
    return callback(new Error(result.reason || 'CORS blocked'));
  },
  credentials: false,
}));

app.use(express.json({ limit: '2mb' }));

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function isAdminProtectedRoute(req) {
  const method = String(req.method || '').toUpperCase();
  const routePath = String(req.path || '');

  if (routePath.startsWith('/auth/')) return false;
  if (routePath === '/health' || routePath === '/db-test') return false;

  if (routePath.startsWith('/admin/')) return true;
  return false;
}

app.use('/api', async (req, res, next) => {
  if (!isAdminProtectedRoute(req)) return next();

  const auth = authService.getAdminAuth(req);
  if (!auth.ok) return authService.sendAuthFailure(res, auth);

  let perms = Array.isArray(auth.claims.permissions) ? auth.claims.permissions : [];
  if (auth.source === 'jwt' && auth.claims.sub) {
    try {
      const [[user]] = await pool.query('SELECT id, role, email, name FROM users WHERE id = ?', [auth.claims.sub]);
      if (user) {
        perms = await loadUserAdminPermissions(pool, user.id, { legacyRole: user.role });
        auth.claims.permissions = perms;
        auth.claims.email = user.email || auth.claims.email || '';
        auth.claims.name = user.name || auth.claims.name || '';
      }
    } catch (error) {
      console.error('[auth] permission reload failed:', error.message);
    }
  }

  const requiredPerm = resolveRouteAdminPermission(req);
  const isLegacyAdmin = auth.claims.role === 'admin' && perms.length === 0;
  const routePath = String(req.path || '');

  const reportGate = [
    'management.reports',
    'management.exports',
    'management.analytics',
    'security.reports',
    'compliance.audit',
    'compliance.exports',
    'admin.dashboard',
  ];

  if (!isLegacyAdmin && routePath.startsWith('/admin/reports')) {
    if (!hasAnyPermission(perms, reportGate)) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && routePath.includes('/settings') && !routePath.includes('/org/')) {
    if (!hasAnyPermission(perms, ['admin.settings', 'platform.settings'])) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && routePath.startsWith('/admin/notifications')) {
    const notificationGate = [
      'host.notifications',
      'admin.notifications',
      'admin.dashboard',
      'station.dashboard',
      'security.dashboard',
      'executive.dashboard',
      'reception.dashboard',
    ];
    if (!hasAnyPermission(perms, notificationGate)) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && (routePath.includes('/admin/org/visitors') || routePath.includes('/admin/org/vehicles'))) {
    const registerGate = routePath.includes('/admin/org/vehicles')
      ? ['admin.vehicles', 'admin.dashboard']
      : ['admin.visitors', 'admin.dashboard'];
    if (!hasAnyPermission(perms, registerGate)) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && routePath.includes('/admin/org/visits')) {
    const visitType = String(req.query?.type || 'walking').toLowerCase();
    const visitGate = visitType === 'vehicle'
      ? ['admin.vehicles', 'admin.dashboard']
      : ['admin.visitors', 'admin.dashboard'];
    if (!hasAnyPermission(perms, visitGate)) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && routePath.includes('/admin/platform/log-book')) {
    const visitType = String(req.query?.type || 'walking').toLowerCase();
    const logBookGate = visitType === 'vehicle'
      ? ['platform.vehicles', 'platform.logbook', 'platform.dashboard']
      : ['platform.visitors', 'platform.logbook', 'platform.dashboard'];
    if (!hasAnyPermission(perms, logBookGate)) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && (routePath.includes('/platform/visitors') || routePath.includes('/platform/vehicles'))) {
    const platformRegisterGate = ['platform.visitors', 'platform.vehicles', 'platform.logbook', 'platform.dashboard'];
    if (!hasAnyPermission(perms, platformRegisterGate)) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && routePath.includes('/admin/visits')) {
    if (!hasAnyPermission(perms, resolveVisitRoutePermissions(req))) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
    }
  } else if (!isLegacyAdmin && !permissionMatches(perms, requiredPerm)) {
    return res.status(403).json({ ok: false, message: 'Insufficient permissions for this action.' });
  }

  req.adminClaims = auth.claims;
  return next();
});

app.use('/api', createHealthRouter());
app.use('/api/auth', createAuthRouter({ authService }));
app.use('/api/admin', createAdminRouter());
app.use('/api/admin', createAdminSettingsRouter());
app.use('/api/admin/station', createStationRouter());
app.use('/api/admin/reception', createReceptionRouter());
app.use('/api/admin/visits', createVisitsRouter());
app.use('/api/admin/vehicles', createVehiclesRouter());
app.use('/api/admin/org', createOrgAdminRouter());
app.use('/api/admin/host', createHostRouter());
app.use('/api/admin/executive', createExecutiveRouter());
app.use('/api/admin/security', createSecurityRouter());
app.use('/api/admin/emergency', createEmergencyRouter());
app.use('/api/admin/reports', createReportsRouter());
app.use('/api/kiosk', createKioskRouter());
app.use('/api/visit/host-approval', createHostApprovalRouter());
app.use('/api/signature-board', createSignatureBoardRouter());
app.use('/api/admin/compliance', createComplianceRouter());
app.use('/api/admin/platform', createPlatformRouter());
app.use('/api/admin/notifications', createNotificationsRouter());

const uploadsDir = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

async function startHttpServer() {
  await fs.mkdir(uploadsDir, { recursive: true });

  const distDir = path.join(__dirname, '..', 'dist');
  if (IS_PRODUCTION) {
    try {
      await fs.access(distDir);
      app.use(express.static(distDir));
      app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } catch {
      console.warn('[server] dist/ not found — API-only mode');
    }
  } else {
    const frontendUrl = appUrl || 'http://localhost:5173';
    app.get('/', (_req, res) => {
      res.redirect(frontendUrl);
    });
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: 'This port serves the API only in development. Open the app in your browser.',
        appUrl: frontendUrl,
        apiBase: `http://localhost:${PORT}/api`,
      });
    });
  }

  const listenTarget = process.env.PASSENGER === '1' ? 'passenger' : '0.0.0.0';
  app.listen(listenTarget === 'passenger' ? PORT : PORT, listenTarget === 'passenger' ? undefined : '0.0.0.0', () => {
    console.log(`[server] ${APP_NAME} API listening on port ${PORT}`);
  });
}

async function main() {
  await waitForDatabase();
  await bootstrapDatabase();
  startNotificationRetryWorker();
  startPreArrivalReminderWorker();
  startOverdueVisitWorker();
  await startHttpServer();
}

function startNotificationRetryWorker() {
  const { retryIntervalMs } = getDeliveryConfig();
  setInterval(async () => {
    try {
      const result = await retryFailedDeliveries(pool);
      if (result.retried > 0) {
        console.log(`[notifications] Retried ${result.retried} deliveries (${result.delivered} succeeded)`);
      }
    } catch (error) {
      console.error('[notifications] Retry worker error:', error.message);
    }
  }, retryIntervalMs);
}

function startPreArrivalReminderWorker() {
  const intervalMs = Number(process.env.PRE_ARRIVAL_REMINDER_INTERVAL_MS || 60_000);
  const tick = async () => {
    try {
      const result = await notifyPreArrivalReminders(pool);
      if (result.notified > 0) {
        console.log(`[notifications] Pre-arrival reminders sent for ${result.notified} visit(s)`);
      }
    } catch (error) {
      console.error('[notifications] Pre-arrival reminder worker error:', error.message);
    }
  };
  // Run soon after boot, then on interval.
  setTimeout(tick, 5_000);
  setInterval(tick, Number.isFinite(intervalMs) && intervalMs >= 15_000 ? intervalMs : 60_000);
}

function startOverdueVisitWorker() {
  const intervalMs = Number(process.env.OVERDUE_VISIT_INTERVAL_MS || 60_000);
  const tick = async () => {
    try {
      const result = await markOverdueVisits(pool);
      if (result.marked > 0) {
        console.log(`[visits] Marked ${result.marked} visit(s) overdue`);
      }
    } catch (error) {
      console.error('[visits] Overdue worker error:', error.message);
    }
  };
  setTimeout(tick, 8_000);
  setInterval(tick, Number.isFinite(intervalMs) && intervalMs >= 15_000 ? intervalMs : 60_000);
}

main().catch((error) => {
  console.error('[server] Failed to start:', error);
  process.exit(1);
});

export default app;
