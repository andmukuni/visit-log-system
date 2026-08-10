import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  DEFAULT_ADMIN_ROLES,
  RBAC_SUPER_ADMIN_SLUG,
  permissionMatches,
} from '../shared/rbacPermissions.js';

export {
  ADMIN_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  RBAC_SUPER_ADMIN_SLUG,
  permissionMatches,
};

export async function ensureRbacTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      id VARCHAR(90) PRIMARY KEY,
      perm_key VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      perm_group VARCHAR(60) DEFAULT 'General',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id VARCHAR(90) PRIMARY KEY,
      slug VARCHAR(60) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      is_system TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_role_permissions (
      role_id VARCHAR(90) NOT NULL,
      permission_key VARCHAR(80) NOT NULL,
      PRIMARY KEY (role_id, permission_key),
      INDEX idx_admin_role_permissions_perm (permission_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_admin_roles (
      user_id VARCHAR(90) NOT NULL,
      role_id VARCHAR(90) NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role_id),
      INDEX idx_user_admin_roles_role (role_id)
    )
  `);
}

function generateRbacId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function seedRbac(pool) {
  await ensureRbacTables(pool);

  for (const perm of ADMIN_PERMISSIONS) {
    await pool.query(
      `INSERT INTO admin_permissions (id, perm_key, name, perm_group, description)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), perm_group = VALUES(perm_group)`,
      [generateRbacId('perm'), perm.key, perm.name, perm.group || 'General', perm.description || ''],
    );
  }

  for (const roleDef of DEFAULT_ADMIN_ROLES) {
    const roleId = generateRbacId('role');
    await pool.query(
      `INSERT INTO admin_roles (id, slug, name, description, is_system)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = VALUES(is_system)`,
      [roleId, roleDef.slug, roleDef.name, roleDef.description || '', roleDef.is_system ? 1 : 0],
    );

    const [[roleRow]] = await pool.query('SELECT id FROM admin_roles WHERE slug = ? LIMIT 1', [roleDef.slug]);
    if (!roleRow?.id) continue;

    for (const permKey of roleDef.permissions) {
      await pool.query(
        'INSERT IGNORE INTO admin_role_permissions (role_id, permission_key) VALUES (?, ?)',
        [roleRow.id, permKey],
      );
    }

    // Ensure system roles pick up newly added permission keys on restart.
    if (roleDef.is_system) {
      const [existing] = await pool.query(
        'SELECT permission_key FROM admin_role_permissions WHERE role_id = ?',
        [roleRow.id],
      );
      const existingKeys = new Set(existing.map((row) => row.permission_key));
      const allowed = new Set(roleDef.permissions);
      const missing = roleDef.permissions.filter((key) => !existingKeys.has(key));
      for (const permKey of missing) {
        await pool.query(
          'INSERT INTO admin_role_permissions (role_id, permission_key) VALUES (?, ?)',
          [roleRow.id, permKey],
        );
      }
      for (const row of existing) {
        if (!allowed.has(row.permission_key)) {
          await pool.query(
            'DELETE FROM admin_role_permissions WHERE role_id = ? AND permission_key = ?',
            [roleRow.id, row.permission_key],
          );
        }
      }
    }
  }

  const [[superRole]] = await pool.query(
    'SELECT id FROM admin_roles WHERE slug = ? LIMIT 1',
    [RBAC_SUPER_ADMIN_SLUG],
  );
  if (superRole?.id) {
    const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await pool.query(
        'INSERT IGNORE INTO user_admin_roles (user_id, role_id) VALUES (?, ?)',
        [admin.id, superRole.id],
      );
    }
  }

  return { ok: true };
}

export async function loadUserAdminPermissions(pool, userId, { legacyRole = '' } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const [rows] = await pool.query(
    `SELECT DISTINCT arp.permission_key
     FROM user_admin_roles uar
     INNER JOIN admin_role_permissions arp ON arp.role_id = uar.role_id
     WHERE uar.user_id = ?`,
    [uid],
  );

  const keys = rows.map((r) => String(r.permission_key || '').trim()).filter(Boolean);

  if (keys.length === 0 && String(legacyRole || '').toLowerCase() === 'admin') {
    return [...ALL_PERMISSION_KEYS];
  }

  return keys;
}

export function userCanAccessAdmin(legacyRole, permissions = []) {
  if (String(legacyRole || '').toLowerCase() === 'admin') return true;
  return Array.isArray(permissions) && permissions.length > 0;
}

export function resolveRouteAdminPermission(req) {
  const path = String(req.path || '').replace(/^\/api/, '');
  const method = String(req.method || '').toUpperCase();

  if (path.includes('/rbac/me')) return null;
  if (path.includes('/rbac')) return 'admin.rbac';
  if (path.includes('/settings') && !path.includes('/org/')) return 'admin.settings';

  if (path.includes('/station/dashboard') || path.endsWith('/station/reference-data')) return 'station.dashboard';
  if (path.includes('/station/occupancy')) return 'station.occupancy';
  if (path.includes('/station/gate-entry/vehicle')) return 'station.vehicles.register';
  if (path.includes('/station/gate-entry')) return 'station.visitors.register';

  if (path.includes('/reception/dashboard')) return 'reception.dashboard';
  if (path.includes('/reception/reference-data')) return 'reception.dashboard';
  if (path.includes('/reception/check-in-appointments')) return 'reception.visitors.checkin';
  if (path.includes('/reception/calendar')) return 'reception.calendar';
  if (path.includes('/reception/host-availability')) return 'reception.hosts.availability';
  if (path.includes('/reception/host-queue')) return 'reception.host.queue';
  if (path.includes('/reception/queue-host') || path.includes('/reception/in-meeting')) return 'reception.host.queue';
  if (path.includes('/reception/request-approval')) return 'reception.approvals.track';
  if (path.includes('/reception/occupancy')) return 'reception.occupancy';

  if (path.includes('/host/dashboard')) return 'host.dashboard';
  if (path.includes('/host/reference-data') || path.includes('/host/invite')) return 'host.invite';
  if (path.includes('/host/approvals')) return 'host.approvals';
  if (path.includes('/host/on-site')) return 'host.onsite';
  if (path.includes('/host/visitors') && method === 'GET' && !path.includes('/visits/')) return 'host.visitors';
  if (path.includes('/host/notifications')) return 'host.notifications';
  if (path.includes('/host/profile')) return 'host.profile';

  if (path.includes('/executive/dashboard')) return 'executive.dashboard';
  if (path.includes('/executive/reference-data')) return 'executive.dashboard';
  if (path.includes('/executive/appointments') && method === 'POST') return 'executive.appointments';
  if (path.includes('/executive/appointments')) return 'executive.calendar';
  if (path.includes('/executive/visits')) return 'executive.visits';

  if (path.includes('/host/visits')) {
    if (path.includes('/approve') || path.includes('/reject')) return 'host.approvals';
    return 'host.visitors';
  }

  if (path.includes('/security/dashboard')) return 'security.dashboard';
  if (path.includes('/security/occupancy')) return 'security.occupancy';
  if (path.includes('/security/approvals')) return 'security.approvals';
  if (path.includes('/security/exceptions')) return 'security.exceptions';
  if (path.includes('/security/overdue')) return 'security.overdue';
  if (path.includes('/security/visitors')) return 'security.visitors';
  if (path.includes('/security/vehicles')) return 'security.vehicles';
  if (path.includes('/security/watchlist')) return 'security.watchlist';
  if (path.includes('/security/incidents')) return 'security.incidents';
  if (path.includes('/security/roll-call')) return 'security.rollcall';
  if (path.includes('/security/audit')) return 'security.audit';

  if (path.includes('/emergency/dashboard')) return 'emergency.dashboard';
  if (path.includes('/emergency/occupancy')) return 'emergency.occupancy';
  if (path.includes('/emergency/unresolved')) return 'emergency.unresolved';
  if (path.includes('/emergency/history')) return 'emergency.history';
  if (path.includes('/emergency/roll-call')) return 'emergency.rollcall';

  if (path.includes('/reports/types') || path.includes('/reports/preview')) return 'management.reports';
  if (path.includes('/reports/export')) return 'management.reports';
  if (path.includes('/reports/exports')) return 'management.exports';

  if (path.includes('/compliance/dashboard')) return 'compliance.dashboard';
  if (path.includes('/compliance/audit')) return 'compliance.audit';
  if (path.includes('/compliance/approvals')) return 'compliance.approvals';
  if (path.includes('/compliance/access')) return 'compliance.access';
  if (path.includes('/compliance/incidents')) return 'compliance.incidents';
  if (path.includes('/compliance/privacy')) return 'compliance.privacy';
  if (path.includes('/compliance/retention')) return 'compliance.retention';

  if (path.includes('/platform/visitors')) return 'platform.visitors';
  if (path.includes('/platform/vehicles')) return 'platform.vehicles';
  if (path.includes('/platform/log-book')) return 'platform.logbook';
  if (path.includes('/platform/calendar')) return 'platform.calendar';
  if (path.includes('/platform/organisations')) return 'platform.organisations';
  if (path.includes('/platform/subscriptions')) return 'platform.subscriptions';
  if (path.includes('/platform/users')) return 'platform.users';
  if (path.includes('/platform/health')) return 'platform.health';
  if (path.includes('/platform/audit')) return 'platform.audit';
  if (path.includes('/platform/')) return 'platform.dashboard';
  if (path.includes('/notifications/templates') || path.includes('/notifications/org')) return 'admin.notifications';
  if (path.includes('/notifications')) return 'host.notifications';

  if (path.includes('/visits')) {
    if (path.includes('/check-in')) return 'station.visitors.checkin';
    if (path.includes('/check-out')) return 'station.visitors.checkout';
    if (path.includes('/approve') || path.includes('/reject')) return 'host.approvals';
    if (method === 'GET') return 'station.visitors.view';
    return 'station.visitors.register';
  }

  if (path.includes('/vehicles')) {
    if (path.includes('/check-out')) return 'station.vehicles.register';
    if (method === 'GET') return 'station.vehicles.view';
    return 'station.vehicles.register';
  }

  if (path.includes('/org/dashboard') || path.includes('/org/nav-counts')) return 'admin.dashboard';
  if (path.includes('/org/organisations')) return 'admin.organisations';
  if (path.includes('/org/sites')) return 'admin.sites';
  if (path.includes('/org/stations')) return 'admin.stations';
  if (path.includes('/org/buildings') || path.includes('/org/zones')) return 'admin.zones';
  if (path.includes('/org/departments')) return 'admin.departments';
  if (path.includes('/org/offices')) return 'admin.offices';
  if (path.includes('/org/hosts')) return 'admin.hosts';
  if (path.includes('/org/receptionists')) return 'admin.receptionists';
  if (path.includes('/org/categories')) return 'admin.categories';
  if (path.includes('/org/badges')) return 'admin.badges';
  if (path.includes('/org/visitors')) return 'admin.visitors';
  if (path.includes('/org/vehicles')) return 'admin.vehicles';
  if (path.includes('/org/visits')) return 'admin.visitors';

  if (path.includes('/users')) return 'admin.users';
  if (path.includes('/items')) return 'admin.dashboard';
  if (path.includes('/dashboard/stats')) return 'admin.dashboard';

  return 'admin.dashboard';
}

/** Acceptable permissions for shared /admin/visits routes (station + reception). */
export function resolveVisitRoutePermissions(req) {
  const path = String(req.path || '').replace(/^\/api/, '');
  const method = String(req.method || '').toUpperCase();

  if (path.includes('/check-in')) {
    return ['station.visitors.checkin', 'reception.visitors.checkin'];
  }
  if (path.includes('/check-out')) {
    return ['station.visitors.checkout'];
  }
  if (path.includes('/approve') || path.includes('/reject')) {
    return ['host.approvals', 'security.approvals', 'station.visitors.view'];
  }
  if (path.includes('/waiting') || path.includes('/in-meeting')) {
    return ['reception.host.queue', 'station.visitors.checkin', 'station.visitors.register'];
  }
  if (method === 'GET') {
    return [
      'station.visitors.view',
      'reception.visitors.view',
      'host.visitors',
      'security.visitors',
      'admin.visitors',
      'executive.visits',
    ];
  }
  return ['station.visitors.register', 'reception.visitors.register'];
}
