/**
 * Watchlist matching — returns active matches for visitor or vehicle data.
 * Reason is only included when caller has watchlist view permission.
 */
export async function findWatchlistMatches(pool, organisationId, {
  fullName = '',
  phone = '',
  email = '',
  plateNumber = '',
} = {}) {
  const params = [organisationId];
  const conditions = [`organisation_id = ?`, `status = 'active'`];

  const orParts = [];
  const name = String(fullName || '').trim();
  const ph = String(phone || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const plate = String(plateNumber || '').trim().toUpperCase();

  if (name) {
    orParts.push('(entry_type = ? AND LOWER(full_name) = LOWER(?))');
    params.push('visitor', name);
  }
  if (ph) {
    orParts.push('(entry_type = ? AND phone = ?)');
    params.push('visitor', ph);
  }
  if (em) {
    orParts.push('(entry_type = ? AND LOWER(email) = LOWER(?))');
    params.push('visitor', em);
  }
  if (plate) {
    orParts.push('(entry_type = ? AND UPPER(plate_number) = ?)');
    params.push('vehicle', plate);
  }

  if (orParts.length === 0) return [];

  conditions.push(`(${orParts.join(' OR ')})`);
  conditions.push(`(valid_from IS NULL OR valid_from <= NOW())`);
  conditions.push(`(valid_until IS NULL OR valid_until >= NOW())`);

  const [rows] = await pool.query(
    `SELECT id, entry_type, full_name, phone, email, plate_number, reason, severity
     FROM watchlist_entries
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  return rows;
}

export function maskWatchlistForRole(rows, { canViewReason = false } = {}) {
  return rows.map((row) => ({
    id: row.id,
    entry_type: row.entry_type,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    plate_number: row.plate_number,
    severity: row.severity,
    matched: true,
    ...(canViewReason ? { reason: row.reason } : { reasonRestricted: true }),
  }));
}
