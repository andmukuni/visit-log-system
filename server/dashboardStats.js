export function calcVisitTrend(today, yesterday) {
  if (yesterday === 0) return today > 0 ? 100 : 0;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

export async function fetchVisitsTodayYesterday(pool, organisationId = null) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND organisation_id = ?';
    params.push(organisationId);
  }
  const [[todayRow]] = await pool.query(
    `SELECT COUNT(*) AS count FROM visits WHERE created_at >= CURDATE()${orgFilter}`,
    params,
  );
  const [[yesterdayRow]] = await pool.query(
    `SELECT COUNT(*) AS count FROM visits WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND created_at < CURDATE()${orgFilter}`,
    params,
  );
  const visitsToday = Number(todayRow?.count || 0);
  const visitsYesterday = Number(yesterdayRow?.count || 0);
  return { visitsToday, visitsYesterday, visitTrend: calcVisitTrend(visitsToday, visitsYesterday) };
}

export async function fetchWeeklyVisits(pool, organisationId = null) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND organisation_id = ?';
    params.push(organisationId);
  }
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS visit_date, COUNT(*) AS count
     FROM visits
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${orgFilter}
     GROUP BY DATE(created_at)`,
    params,
  );
  return mapRowsToWeeklySeries(rows);
}

function mapRowsToWeeklySeries(rows) {
  const weekly = [0, 0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    const dateStr = row.visit_date instanceof Date
      ? row.visit_date.toISOString().slice(0, 10)
      : String(row.visit_date).slice(0, 10);
    const d = new Date(`${dateStr}T12:00:00`);
    weekly[(d.getDay() + 6) % 7] = Number(row.count || 0);
  }
  return weekly;
}

export async function fetchWeeklyWalkingVisits(pool, organisationId = null) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  const [rows] = await pool.query(
    `SELECT DATE(vis.created_at) AS visit_date, COUNT(*) AS count
     FROM visits vis
     WHERE vis.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${orgFilter}
       AND NOT EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)
     GROUP BY DATE(vis.created_at)`,
    params,
  );
  return mapRowsToWeeklySeries(rows);
}

export async function fetchWeeklyDriveInVisits(pool, organisationId = null) {
  const params = [];
  let orgFilter = '';
  if (organisationId) {
    orgFilter = ' AND vis.organisation_id = ?';
    params.push(organisationId);
  }
  const [rows] = await pool.query(
    `SELECT DATE(vis.created_at) AS visit_date, COUNT(*) AS count
     FROM visits vis
     WHERE vis.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${orgFilter}
       AND EXISTS (SELECT 1 FROM vehicles veh WHERE veh.visit_id = vis.id)
     GROUP BY DATE(vis.created_at)`,
    params,
  );
  return mapRowsToWeeklySeries(rows);
}

export function buildWeeklyTrend(weeklyVisits, weeklyWalking = [], weeklyDriveIn = []) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => ({
    period: label,
    visits: weeklyVisits[index] || 0,
    walking: weeklyWalking[index] || 0,
    driveIn: weeklyDriveIn[index] || 0,
  }));
}
