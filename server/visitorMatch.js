import { generateId } from './visitorSchema.js';
import { isCompleteNrc, normalizeNrc } from './visitorIdentity.js';

/** Last 9 digits so +260971234567 and 0971234567 match the same person. */
export function phoneMatchKey(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 9 ? digits : digits.slice(-9);
}

function nrcDigits(value) {
  const nrc = isCompleteNrc(value) ? normalizeNrc(value) : String(value || '');
  return nrc.replace(/\D/g, '');
}

/**
 * Find an existing visitor in the organisation by NRC, then by phone.
 * NRC wins when both are present and point at different records.
 * Compared in code so +260 / 0-prefix phones and slashed / digit NRCs match
 * on both MySQL and Postgres.
 */
export async function findExistingVisitor(pool, { organisationId, phone, idNumber } = {}) {
  const orgId = String(organisationId || '').trim();
  if (!orgId) return null;

  const wantedNrc = nrcDigits(idNumber);
  if (wantedNrc.length >= 9) {
    const [nrcRows] = await pool.query(
      `SELECT v.id, vcd.id_number
       FROM visitors v
       INNER JOIN visitor_contact_details vcd ON vcd.visitor_id = v.id
       WHERE v.organisation_id = ? AND vcd.id_number IS NOT NULL`,
      [orgId],
    );
    const byNrc = (nrcRows || []).find((row) => nrcDigits(row.id_number) === wantedNrc);
    if (byNrc?.id) return { id: byNrc.id, matchedBy: 'nrc' };
  }

  const phoneKey = phoneMatchKey(phone);
  if (phoneKey.length >= 9) {
    const [phoneRows] = await pool.query(
      `SELECT id, phone FROM visitors WHERE organisation_id = ? AND phone IS NOT NULL`,
      [orgId],
    );
    const byPhone = (phoneRows || []).find((row) => phoneMatchKey(row.phone) === phoneKey);
    if (byPhone?.id) return { id: byPhone.id, matchedBy: 'phone' };
  }

  return null;
}

/**
 * Reuse a visitor matched by phone or NRC, otherwise insert one.
 * @returns {{ id: string, matched: boolean, matchedBy: string|null }}
 */
export async function findOrCreateVisitor(pool, {
  organisationId,
  fullName,
  phone,
  email,
  company,
  idType,
  idNumber,
} = {}) {
  const existing = await findExistingVisitor(pool, { organisationId, phone, idNumber });
  const name = String(fullName || '').trim();
  const nextPhone = String(phone || '').trim() || null;
  const nextEmail = String(email || '').trim() || null;
  const nextCompany = String(company || '').trim() || null;
  const placeholderName = !name || name === 'Vehicle driver';

  if (existing?.id) {
    await pool.query(
      `UPDATE visitors
       SET full_name = CASE WHEN ? = '' THEN full_name ELSE ? END,
           phone = COALESCE(?, phone),
           email = COALESCE(?, email),
           company = COALESCE(?, company)
       WHERE id = ?`,
      [
        placeholderName ? '' : name,
        placeholderName ? '' : name,
        nextPhone,
        nextEmail,
        nextCompany,
        existing.id,
      ],
    );
    return { id: existing.id, matched: true, matchedBy: existing.matchedBy };
  }

  const id = generateId('vis');
  await pool.query(
    `INSERT INTO visitors (id, organisation_id, full_name, phone, email, company, id_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      organisationId,
      name || 'Visitor',
      nextPhone,
      nextEmail,
      nextCompany,
      idType || null,
    ],
  );
  return { id, matched: false, matchedBy: null };
}
