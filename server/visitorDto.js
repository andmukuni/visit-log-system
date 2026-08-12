/**
 * Explicit allowlist response DTOs for expected-visitor records (Logic.md).
 *
 * Field naming deliberately matches whatever the source row already used
 * (snake_case, e.g. `visitor_name` from CALENDAR_SELECT vs `full_name` from
 * VISIT_SELECT_FIELDS, `expected_at` vs `scheduled_at`) rather than
 * restructuring into a new shape — every existing frontend page reads these
 * flat fields directly off the row, and Logic.md's own UI section says
 * same-zone/full-access viewers keep "the existing detailed visitor
 * card/table" unchanged. The allowlisting/restriction happens by field
 * *presence*, not by renaming.
 */

const NAME_KEYS = ['full_name', 'visitor_name'];
const TIME_KEYS = ['expected_at', 'scheduled_at', 'appointment_scheduled_at'];

function firstPresent(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined) return key;
  }
  return null;
}

/**
 * Full visitor record — same-zone reception, host owner, elevated admin.
 * Passes the (already VIP-masked) row through unchanged, tagged with
 * _accessLevel, minus invite_token/check_in_signature unless explicitly
 * requested (those aren't rendered in any list/expected-arrivals view today).
 */
export function buildFullExpectedVisitorDTO(row, {
  includeInviteToken = false,
  includeCheckInSignature = false,
} = {}) {
  if (!row) return row;
  const dto = { ...row, _accessLevel: 'full' };
  if (!includeInviteToken) delete dto.invite_token;
  if (!includeCheckInSignature) delete dto.check_in_signature;
  return dto;
}

/**
 * Different-zone receptionist view — "nothing else" per Logic.md. Keeps only
 * id + whichever name/time keys the source row actually had (so existing
 * `row.visitor_name` / `row.full_name` / `row.expected_at` / `row.scheduled_at`
 * reads keep working, just every other field is gone).
 */
export function buildRestrictedExpectedVisitorDTO(row, { reason = 'zone_mismatch' } = {}) {
  if (!row) return row;
  const dto = { id: row.id, _accessLevel: 'restricted', _restrictedReason: reason };

  const nameKey = firstPresent(row, NAME_KEYS);
  if (nameKey) dto[nameKey] = row[nameKey];

  const timeKey = firstPresent(row, TIME_KEYS);
  if (timeKey) dto[timeKey] = row[timeKey];

  return dto;
}

/**
 * Gate-operational view for security officers within their site/building/gate
 * scope. Security list/detail queries are purpose-built (Part 3) so this can
 * allowlist a fixed field set without breaking a pre-existing shape.
 */
export function buildSecurityExpectedVisitorDTO(row) {
  if (!row) return row;
  return {
    id: row.id,
    visitor_name: row.full_name ?? row.visitor_name ?? null,
    expected_at: row.expected_at ?? row.scheduled_at ?? null,
    host_name: row.host_name ?? null,
    destination_building_name: row.destination_building_name ?? null,
    destination_office_number: row.destination_office_number ?? row.host_office_number ?? null,
    gate_name: row.gate_name ?? row.station_name ?? null,
    status: row.status ?? null,
    checked_in_at: row.checked_in_at ?? null,
    plate_numbers: row.plate_numbers ?? row.expected_plates ?? null,
    identity_verification_status: row.checked_in_at ? 'verified' : 'pending',
    _accessLevel: 'gate',
  };
}
