import crypto from 'crypto';
import { EventEmitter } from 'events';
import { generateId } from './visitorSchema.js';
import { validateSignature } from './receptionDeskEntry.js';
import { writeAuditLog } from './auditService.js';

const boardEvents = new EventEmitter();
// Every open board tab plus every reception "waiting" step shares one
// site:<id> channel — realistic concurrent viewing easily exceeds Node's
// default listener cap of 10.
boardEvents.setMaxListeners(0);

const ACTIVE_STATUSES = ['pending', 'signed'];

export function generateBoardToken() {
  return crypto.randomBytes(24).toString('hex');
}

export async function ensureSignatureBoardSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signature_boards (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      site_id VARCHAR(90) NOT NULL,
      token VARCHAR(64) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_sigboard_site (site_id),
      UNIQUE KEY uq_sigboard_token (token)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS signature_requests (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      site_id VARCHAR(90) NOT NULL,
      station_id VARCHAR(90) NULL,
      full_name VARCHAR(255) NOT NULL,
      phone VARCHAR(60) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      signature_data MEDIUMTEXT NULL,
      requested_by VARCHAR(90) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      signed_at DATETIME NULL,
      INDEX idx_sigreq_site_status_created (site_id, status, created_at),
      INDEX idx_sigreq_org (organisation_id)
    )
  `);
}

function toPublicRow(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    status: row.status,
    signature_data: row.signature_data || null,
    created_at: row.created_at,
    signed_at: row.signed_at,
  };
}

function publish(siteId, type, payload) {
  boardEvents.emit(`site:${siteId}`, { type, payload });
}

export function subscribeToSiteBoard(siteId, listener) {
  const channel = `site:${siteId}`;
  boardEvents.on(channel, listener);
  return () => boardEvents.off(channel, listener);
}

export async function getOrCreateBoardForSite(pool, { organisationId, siteId }) {
  const [[existing]] = await pool.query(
    'SELECT * FROM signature_boards WHERE site_id = ? LIMIT 1',
    [siteId],
  );
  if (existing) return existing;

  const id = generateId('sigbrd');
  const token = generateBoardToken();
  try {
    await pool.query(
      `INSERT INTO signature_boards (id, organisation_id, site_id, token) VALUES (?, ?, ?, ?)`,
      [id, organisationId, siteId, token],
    );
    return { id, organisation_id: organisationId, site_id: siteId, token };
  } catch (error) {
    // Unique-key race — another request created the board first.
    const [[row]] = await pool.query('SELECT * FROM signature_boards WHERE site_id = ? LIMIT 1', [siteId]);
    if (row) return row;
    throw error;
  }
}

export async function resolveBoardByToken(pool, token) {
  const cleaned = String(token || '').trim();
  if (!cleaned) return null;

  const [[row]] = await pool.query(
    `SELECT b.*, s.name AS site_name, o.name AS organisation_name
     FROM signature_boards b
     LEFT JOIN sites s ON s.id = b.site_id
     LEFT JOIN organisations o ON o.id = b.organisation_id
     WHERE b.token = ? LIMIT 1`,
    [cleaned],
  );
  return row || null;
}

export async function listSignatureRequests(pool, { siteId, page = 1, pageSize = 10 }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
  const offset = (safePage - 1) * safeSize;

  const [[{ count }]] = await pool.query(
    `SELECT COUNT(*) AS count FROM signature_requests WHERE site_id = ? AND status IN (?, ?)`,
    [siteId, ...ACTIVE_STATUSES],
  );
  const [rows] = await pool.query(
    `SELECT * FROM signature_requests WHERE site_id = ? AND status IN (?, ?)
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [siteId, ...ACTIVE_STATUSES, safeSize, offset],
  );

  return {
    items: rows.map(toPublicRow),
    page: safePage,
    pageSize: safeSize,
    totalItems: Number(count),
  };
}

export async function createSignatureRequest(pool, { organisationId, siteId, stationId, fullName, phone, requestedBy }) {
  const trimmedName = String(fullName || '').trim();
  if (!trimmedName) {
    return { ok: false, status: 400, message: 'Visitor name is required.' };
  }

  const id = generateId('sigreq');
  await pool.query(
    `INSERT INTO signature_requests (id, organisation_id, site_id, station_id, full_name, phone, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, organisationId, siteId, stationId || null, trimmedName, phone?.trim() || null, requestedBy || null],
  );

  const [[row]] = await pool.query('SELECT * FROM signature_requests WHERE id = ?', [id]);
  const publicRow = toPublicRow(row);
  publish(siteId, 'request.created', publicRow);
  return { ok: true, data: publicRow };
}

export async function signSignatureRequest(pool, { boardSiteId, requestId, signatureData }) {
  const [[row]] = await pool.query(
    'SELECT * FROM signature_requests WHERE id = ? AND site_id = ? LIMIT 1',
    [requestId, boardSiteId],
  );
  if (!row) return { ok: false, status: 404, message: 'Signature request not found.' };
  if (row.status !== 'pending') {
    return { ok: false, status: 409, message: 'This request has already been signed.' };
  }

  const validated = validateSignature(signatureData);
  if (!validated.ok) return validated;

  await pool.query(
    `UPDATE signature_requests SET status = 'signed', signature_data = ?, signed_at = NOW() WHERE id = ?`,
    [validated.signature, requestId],
  );

  const [[updated]] = await pool.query('SELECT * FROM signature_requests WHERE id = ?', [requestId]);
  const publicRow = toPublicRow(updated);
  publish(boardSiteId, 'request.updated', publicRow);
  return { ok: true, data: publicRow };
}

export async function cancelSignatureRequest(pool, { siteId, requestId, actorUserId }) {
  const [[row]] = await pool.query(
    'SELECT * FROM signature_requests WHERE id = ? AND site_id = ? LIMIT 1',
    [requestId, siteId],
  );
  if (!row) return { ok: false, status: 404, message: 'Signature request not found.' };
  if (row.status !== 'pending') {
    return { ok: true, data: toPublicRow(row) };
  }

  await pool.query(`UPDATE signature_requests SET status = 'cancelled' WHERE id = ?`, [requestId]);
  publish(siteId, 'request.cancelled', { id: requestId });

  await writeAuditLog(pool, {
    organisationId: row.organisation_id,
    actorUserId,
    action: 'signature_request.cancelled',
    targetType: 'signature_request',
    targetId: requestId,
  });

  return { ok: true, data: { id: requestId, status: 'cancelled' } };
}
