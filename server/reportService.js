import { generateId } from './visitorSchema.js';
import { writeAuditLog } from './auditService.js';
import { resolveMaskLevel, maskRows, maskVisitorFields } from '../shared/reportMasking.js';

export const REPORT_DEFINITIONS = {
  visitors: {
    label: 'Visitor log',
    description: 'Visitor visits with status, host and timing',
    permissions: ['management.reports', 'security.reports', 'admin.dashboard', 'station.visitors.view'],
  },
  vehicles: {
    label: 'Vehicle log',
    description: 'Vehicle entries and exits',
    permissions: ['management.reports', 'security.reports', 'admin.dashboard', 'station.vehicles.view'],
  },
  occupancy: {
    label: 'Current occupancy',
    description: 'Visitors currently checked in',
    permissions: ['management.occupancy', 'management.reports', 'security.reports', 'security.occupancy', 'station.occupancy'],
  },
  exceptions: {
    label: 'Exceptions',
    description: 'Rejected, denied, overdue and expired visits',
    permissions: ['management.reports', 'security.reports', 'security.exceptions', 'admin.dashboard'],
  },
  summary: {
    label: 'Activity summary',
    description: 'Visit counts grouped by status',
    permissions: ['management.reports', 'management.analytics', 'admin.dashboard'],
  },
  audit: {
    label: 'Audit trail',
    description: 'System audit events (metadata)',
    permissions: ['compliance.audit', 'compliance.exports', 'security.audit', 'admin.dashboard'],
  },
};

const VISITOR_COLUMNS = [
  { key: 'full_name', label: 'Visitor' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'host_name', label: 'Host' },
  { key: 'site_name', label: 'Site' },
  { key: 'category_name', label: 'Category' },
  { key: 'status', label: 'Status' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'badge_number', label: 'Badge' },
  { key: 'pass_code', label: 'Pass code' },
  { key: 'checked_in_at', label: 'Checked in' },
  { key: 'checked_out_at', label: 'Checked out' },
  { key: 'created_at', label: 'Created' },
];

const VEHICLE_COLUMNS = [
  { key: 'plate_number', label: 'Plate' },
  { key: 'driver_name', label: 'Driver' },
  { key: 'vehicle_type', label: 'Type' },
  { key: 'make', label: 'Make' },
  { key: 'colour', label: 'Colour' },
  { key: 'status', label: 'Status' },
  { key: 'entered_at', label: 'Entered' },
  { key: 'exited_at', label: 'Exited' },
  { key: 'created_at', label: 'Created' },
];

const AUDIT_COLUMNS = [
  { key: 'created_at', label: 'Timestamp' },
  { key: 'action', label: 'Action' },
  { key: 'actor_name', label: 'User' },
  { key: 'target_type', label: 'Target type' },
  { key: 'target_id', label: 'Target ID' },
  { key: 'result', label: 'Result' },
];

export function userCanRunReport(permissions = [], reportType = '') {
  const def = REPORT_DEFINITIONS[reportType];
  if (!def) return false;
  const perms = new Set((permissions || []).map((p) => String(p).trim()));
  if (perms.has('super_admin') || perms.has('*')) return true;
  return def.permissions.some((need) => perms.has(need));
}

export function listAvailableReports(permissions = []) {
  return Object.entries(REPORT_DEFINITIONS)
    .filter(([type]) => userCanRunReport(permissions, type))
    .map(([type, def]) => ({ type, ...def }));
}

function scopeSiteFilter(scope, elevated, column = 'vis.site_id') {
  if (elevated || !scope?.site_id) return { sql: '', params: [] };
  return { sql: ` AND ${column} = ?`, params: [scope.site_id] };
}

function parseFilters(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
    dateFrom: query.dateFrom || query.from || null,
    dateTo: query.dateTo || query.to || null,
    status: query.status || null,
    siteId: query.siteId || null,
    hostId: query.hostId || null,
    search: String(query.search || query.q || '').trim(),
  };
}

function buildDateFilter(column, filters, params) {
  let sql = '';
  if (filters.dateFrom) {
    sql += ` AND ${column} >= ?`;
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    sql += ` AND ${column} <= ?`;
    params.push(`${filters.dateTo} 23:59:59`);
  }
  return sql;
}

export async function runReportQuery(pool, {
  reportType,
  scope,
  elevated = false,
  filters: rawFilters = {},
}) {
  const filters = parseFilters(rawFilters);
  const orgId = scope.organisation_id;
  const params = [orgId];
  const { sql: siteSql, params: siteParams } = scopeSiteFilter(scope, elevated);
  params.push(...siteParams);

  if (filters.siteId && elevated) {
    // explicit site filter for org-wide users
  }

  let rows = [];
  let total = 0;
  let columns = VISITOR_COLUMNS;

  if (reportType === 'visitors') {
    const extraParams = [];
    let extra = buildDateFilter('vis.created_at', filters, extraParams);
    if (filters.status) {
      extra += ' AND vis.status = ?';
      extraParams.push(filters.status);
    }
    if (filters.hostId) {
      extra += ' AND vis.host_id = ?';
      extraParams.push(filters.hostId);
    }
    if (filters.search) {
      extra += ' AND (v.full_name LIKE ? OR v.phone LIKE ? OR v.company LIKE ?)';
      const like = `%${filters.search}%`;
      extraParams.push(like, like, like);
    }

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS count FROM visits vis
       INNER JOIN visitors v ON v.id = vis.visitor_id
       WHERE vis.organisation_id = ?${siteSql}${extra}`,
      [...params, ...extraParams],
    );
    total = Number(countRow?.count || 0);

    const [result] = await pool.query(
      `SELECT vis.id, vis.status, vis.purpose, vis.badge_number, vis.pass_code,
              vis.checked_in_at, vis.checked_out_at, vis.created_at,
              v.full_name, v.phone, v.email, v.company, v.id_number_masked,
              h.name AS host_name, s.name AS site_name, vc.name AS category_name
       FROM visits vis
       INNER JOIN visitors v ON v.id = vis.visitor_id
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN sites s ON s.id = vis.site_id
       LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
       WHERE vis.organisation_id = ?${siteSql}${extra}
       ORDER BY vis.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, ...extraParams, filters.limit, filters.offset],
    );
    rows = result;
    columns = VISITOR_COLUMNS;
  } else if (reportType === 'vehicles') {
    const vehicleParams = [orgId];
    const vehicleExtraParams = [];
    let vehicleExtra = buildDateFilter('veh.created_at', filters, vehicleExtraParams);
    if (filters.status) {
      vehicleExtra += ' AND veh.status = ?';
      vehicleExtraParams.push(filters.status);
    }
    if (filters.search) {
      vehicleExtra += ' AND (veh.plate_number LIKE ? OR veh.driver_name LIKE ?)';
      const like = `%${filters.search}%`;
      vehicleExtraParams.push(like, like);
    }

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS count FROM vehicles veh WHERE veh.organisation_id = ?${vehicleExtra}`,
      [...vehicleParams, ...vehicleExtraParams],
    );
    total = Number(countRow?.count || 0);

    const [result] = await pool.query(
      `SELECT veh.* FROM vehicles veh
       WHERE veh.organisation_id = ?${vehicleExtra}
       ORDER BY veh.created_at DESC
       LIMIT ? OFFSET ?`,
      [...vehicleParams, ...vehicleExtraParams, filters.limit, filters.offset],
    );
    rows = result;
    columns = VEHICLE_COLUMNS;
  } else if (reportType === 'occupancy') {
    const [result] = await pool.query(
      `SELECT vis.id, vis.status, vis.badge_number, vis.checked_in_at,
              v.full_name, v.phone, v.email, v.company,
              h.name AS host_name, s.name AS site_name, vc.name AS category_name
       FROM visits vis
       INNER JOIN visitors v ON v.id = vis.visitor_id
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN sites s ON s.id = vis.site_id
       LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
       WHERE vis.organisation_id = ?${siteSql} AND vis.status = 'checked_in'
       ORDER BY vis.checked_in_at DESC`,
      params,
    );
    rows = result;
    total = result.length;
    columns = VISITOR_COLUMNS.filter((c) => !['checked_out_at', 'pass_code', 'created_at', 'purpose'].includes(c.key));
  } else if (reportType === 'exceptions') {
    const extraParams = [];
    let extra = buildDateFilter('vis.created_at', filters, extraParams);

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS count FROM visits vis
       WHERE vis.organisation_id = ?${siteSql}
       AND vis.status IN ('rejected', 'denied', 'overdue', 'expired')${extra}`,
      [...params, ...extraParams],
    );
    total = Number(countRow?.count || 0);

    const [result] = await pool.query(
      `SELECT vis.id, vis.status, vis.purpose, vis.created_at, vis.checked_in_at,
              v.full_name, v.phone, v.email, v.company,
              h.name AS host_name, s.name AS site_name
       FROM visits vis
       INNER JOIN visitors v ON v.id = vis.visitor_id
       LEFT JOIN hosts h ON h.id = vis.host_id
       LEFT JOIN sites s ON s.id = vis.site_id
       WHERE vis.organisation_id = ?${siteSql}
       AND vis.status IN ('rejected', 'denied', 'overdue', 'expired')${extra}
       ORDER BY vis.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, ...extraParams, filters.limit, filters.offset],
    );
    rows = result;
    columns = VISITOR_COLUMNS.filter((c) => !['badge_number', 'pass_code', 'checked_out_at'].includes(c.key));
  } else if (reportType === 'summary') {
    const extraParams = [];
    const extra = buildDateFilter('vis.created_at', filters, extraParams);
    const [result] = await pool.query(
      `SELECT vis.status, COUNT(*) AS count
       FROM visits vis
       WHERE vis.organisation_id = ?${siteSql}${extra}
       GROUP BY vis.status
       ORDER BY count DESC`,
      [...params, ...extraParams],
    );
    rows = result;
    total = result.length;
    columns = [
      { key: 'status', label: 'Status' },
      { key: 'count', label: 'Count' },
    ];
  } else if (reportType === 'audit') {
    const extraParams = [];
    let extra = buildDateFilter('al.created_at', filters, extraParams);
    if (filters.search) {
      extra += ' AND (al.action LIKE ? OR al.target_type LIKE ?)';
      const like = `%${filters.search}%`;
      extraParams.push(like, like);
    }

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS count FROM audit_logs al WHERE al.organisation_id = ?${extra}`,
      [orgId, ...extraParams],
    );
    total = Number(countRow?.count || 0);

    const [result] = await pool.query(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.result, al.created_at,
              u.name AS actor_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE al.organisation_id = ?${extra}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [orgId, ...extraParams, filters.limit, filters.offset],
    );
    rows = result;
    columns = AUDIT_COLUMNS;
  } else {
    throw new Error('Unknown report type.');
  }

  return { rows, total, columns, filters };
}

export function applyMasking(rows, permissions, reportType) {
  const maskLevel = resolveMaskLevel(permissions);
  if (reportType === 'audit' || reportType === 'summary') {
    return { rows, maskLevel };
  }
  if (reportType === 'vehicles') {
    return { rows, maskLevel };
  }
  return {
    rows: maskRows(rows, maskLevel, { rowMapper: maskVisitorFields }),
    maskLevel,
  };
}

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows, columns) {
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsv(row[c.key])).join(','));
  return `\uFEFF${[header, ...lines].join('\n')}`;
}

export async function recordExport(pool, {
  organisationId,
  userId,
  reportType,
  format,
  purpose,
  filters,
  rowCount,
  maskLevel,
  ipAddress,
}) {
  const id = generateId('export');
  await pool.query(
    `INSERT INTO report_exports
     (id, organisation_id, exported_by, report_type, format, purpose, filters, row_count, mask_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      organisationId,
      userId,
      reportType,
      format,
      purpose || null,
      JSON.stringify(filters || {}),
      rowCount,
      maskLevel,
    ],
  );

  await writeAuditLog(pool, {
    organisationId,
    actorUserId: userId,
    action: 'report.exported',
    targetType: 'report_export',
    targetId: id,
    details: { reportType, format, rowCount, maskLevel, purpose, filters },
    ipAddress,
  });

  return id;
}

export async function listExports(pool, scope, { elevated = false, limit = 50 } = {}) {
  const params = [scope.organisation_id];
  let siteSql = '';
  // exports are org-scoped
  const [rows] = await pool.query(
    `SELECT re.*, u.name AS exported_by_name, u.email AS exported_by_email
     FROM report_exports re
     LEFT JOIN users u ON u.id = re.exported_by
     WHERE re.organisation_id = ?${siteSql}
     ORDER BY re.created_at DESC
     LIMIT ?`,
    [...params, limit],
  );
  return rows;
}

export function getReportColumns(reportType) {
  if (reportType === 'vehicles') return VEHICLE_COLUMNS;
  if (reportType === 'audit') return AUDIT_COLUMNS;
  if (reportType === 'summary') {
    return [
      { key: 'status', label: 'Status' },
      { key: 'count', label: 'Count' },
    ];
  }
  return VISITOR_COLUMNS;
}
