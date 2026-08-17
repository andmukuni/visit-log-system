import { rollingWeekDates } from '../shared/rollingWeekChart.js';

export { rollingWeekDates } from '../shared/rollingWeekChart.js';

export function calcVisitTrend(today, yesterday) {
  if (yesterday === 0) return today > 0 ? 100 : 0;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

export const ON_SITE_VISIT_STATUSES = [
  'checked_in',
  'reception_check_in',
  'waiting',
  'in_meeting',
  'arrived_at_gate',
  'entered_premises',
];

export function buildSiteScopeFilter(scope, { alias = 'vis' } = {}) {
  if (!scope?.site_id) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.site_id = ?`, params: [scope.site_id] };
}

export function siteScopeFromId(siteId, { alias = 'vis' } = {}) {
  if (!siteId) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.site_id = ?`, params: [siteId] };
}

function formatLocalIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseVisitDate(raw) {
  if (raw instanceof Date) {
    return formatLocalIso(raw);
  }
  return String(raw).slice(0, 10);
}

function mapRowsToRollingWeekSeries(rows, endDate = new Date()) {
  const dates = rollingWeekDates(endDate);
  const countsByDate = Object.fromEntries(dates.map((entry) => [entry.iso, 0]));

  for (const row of rows) {
    const dateStr = parseVisitDate(row.visit_date);
    if (Object.prototype.hasOwnProperty.call(countsByDate, dateStr)) {
      countsByDate[dateStr] = Number(row.count || 0);
    }
  }

  return dates.map((entry) => countsByDate[entry.iso]);
}

export async function fetchVisitsTodayYesterday(
  pool,
  organisationId = null,
  siteSql = '',
  siteParams = [],
  { joins = '', dateExpr = 'vis.created_at' } = {},
) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  params.push(...siteParams);
  const [[todayRow]] = await pool.query(
    `SELECT COUNT(DISTINCT vis.id) AS count FROM visits vis
     ${joins}
     WHERE DATE(${dateExpr}) = CURDATE()${orgFilter}${siteSql}`,
    params,
  );
  const [[yesterdayRow]] = await pool.query(
    `SELECT COUNT(DISTINCT vis.id) AS count FROM visits vis
     ${joins}
     WHERE DATE(${dateExpr}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)${orgFilter}${siteSql}`,
    params,
  );
  const visitsToday = Number(todayRow?.count || 0);
  const visitsYesterday = Number(yesterdayRow?.count || 0);
  return { visitsToday, visitsYesterday, visitTrend: calcVisitTrend(visitsToday, visitsYesterday) };
}

export async function fetchWeeklyVisits(
  pool,
  organisationId = null,
  siteSql = '',
  siteParams = [],
  { joins = '', dateExpr = 'vis.created_at' } = {},
) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  params.push(...siteParams);
  const [rows] = await pool.query(
    `SELECT DATE(${dateExpr}) AS visit_date, COUNT(DISTINCT vis.id) AS count
     FROM visits vis
     ${joins}
     WHERE DATE(${dateExpr}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${orgFilter}${siteSql}
     GROUP BY DATE(${dateExpr})`,
    params,
  );
  return mapRowsToRollingWeekSeries(rows);
}

export async function fetchWeeklyWalkingVisits(
  pool,
  organisationId = null,
  siteSql = '',
  siteParams = [],
  { joins = '', dateExpr = 'vis.created_at' } = {},
) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  params.push(...siteParams);
  const [rows] = await pool.query(
    `SELECT DATE(${dateExpr}) AS visit_date, COUNT(DISTINCT vis.id) AS count
     FROM visits vis
     ${joins}
     WHERE DATE(${dateExpr}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${orgFilter}${siteSql}
       AND NOT EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)
     GROUP BY DATE(${dateExpr})`,
    params,
  );
  return mapRowsToRollingWeekSeries(rows);
}

export async function fetchWeeklyDriveInVisits(
  pool,
  organisationId = null,
  siteSql = '',
  siteParams = [],
  { joins = '', dateExpr = 'vis.created_at' } = {},
) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  params.push(...siteParams);
  const [rows] = await pool.query(
    `SELECT DATE(${dateExpr}) AS visit_date, COUNT(DISTINCT vis.id) AS count
     FROM visits vis
     ${joins}
     WHERE DATE(${dateExpr}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${orgFilter}${siteSql}
       AND EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)
     GROUP BY DATE(${dateExpr})`,
    params,
  );
  return mapRowsToRollingWeekSeries(rows);
}

export function buildWeeklyTrend(weeklyVisits, weeklyWalking = [], weeklyDriveIn = [], endDate = new Date()) {
  const dates = rollingWeekDates(endDate);
  return dates.map((entry, index) => ({
    period: entry.label,
    label: entry.label,
    date: entry.iso,
    visits: weeklyVisits[index] || 0,
    walking: weeklyWalking[index] || 0,
    driveIn: weeklyDriveIn[index] || 0,
  }));
}

export async function fetchWeeklySecurityEvents(pool, organisationId, siteSql = '', siteParams = []) {
  const params = [organisationId, ...siteParams];
  const [rows] = await pool.query(
    `SELECT DATE(ve.created_at) AS visit_date, COUNT(*) AS count
     FROM visit_events ve
     INNER JOIN visits vis ON vis.id = ve.visit_id
     WHERE vis.organisation_id = ?${siteSql}
       AND ve.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(ve.created_at)`,
    params,
  );
  return mapRowsToRollingWeekSeries(rows);
}

export async function fetchSecurityEventsByType(
  pool,
  organisationId,
  siteSql = '',
  siteParams = [],
  { joins = '' } = {},
) {
  const params = [organisationId, ...siteParams];
  const [rows] = await pool.query(
    `SELECT ve.event_type AS event_type, COUNT(*) AS total
     FROM visit_events ve
     INNER JOIN visits vis ON vis.id = ve.visit_id
     ${joins}
     WHERE vis.organisation_id = ?${siteSql}
       AND ve.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY ve.event_type
     ORDER BY total DESC`,
    params,
  );
  return rows.map((row) => ({
    event_type: row.event_type,
    total: Number(row.total || 0),
  }));
}

export async function fetchSecurityEventsTodayYesterday(pool, organisationId, siteSql = '', siteParams = []) {
  const params = [organisationId, ...siteParams];
  const [[todayRow]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM visit_events ve
     INNER JOIN visits vis ON vis.id = ve.visit_id
     WHERE vis.organisation_id = ?${siteSql}
       AND ve.created_at >= CURDATE()`,
    params,
  );
  const [[yesterdayRow]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM visit_events ve
     INNER JOIN visits vis ON vis.id = ve.visit_id
     WHERE vis.organisation_id = ?${siteSql}
       AND ve.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       AND ve.created_at < CURDATE()`,
    params,
  );
  const eventsToday = Number(todayRow?.count || 0);
  const eventsYesterday = Number(yesterdayRow?.count || 0);
  return { eventsToday, eventsYesterday, eventTrend: calcVisitTrend(eventsToday, eventsYesterday) };
}
