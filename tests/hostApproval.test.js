import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestPool,
  seedFixture,
  seedHost,
  seedVisit,
  FIXTURE,
} from './helpers/pgMemHarness.js';
import {
  generateHostApprovalToken,
  hashHostApprovalToken,
  issueHostApprovalToken,
  invalidateOtherHostApprovalTokens,
  loadHostApprovalByToken,
  loadPublicHostApproval,
  applyHostApproval,
  applyHostRejection,
  decidePublicHostApproval,
  requestHostApproval,
  toPublicHostApprovalPayload,
  ensureHostApprovalSchema,
} from '../server/hostApprovalService.js';
import appPool from '../server/db.js';

after(async () => {
  try { await appPool.end(); } catch { /* never opened */ }
});

describe('generateHostApprovalToken', () => {
  it('returns a 64-char hex string', () => {
    const token = generateHostApprovalToken();
    assert.match(token, /^[a-f0-9]{64}$/);
  });

  it('generates unique tokens', () => {
    assert.notEqual(generateHostApprovalToken(), generateHostApprovalToken());
  });
});

describe('hashHostApprovalToken', () => {
  it('is sha256 hex and never equals the raw token', () => {
    const token = generateHostApprovalToken();
    const hashed = hashHostApprovalToken(token);
    assert.match(hashed, /^[a-f0-9]{64}$/);
    assert.notEqual(hashed, token);
    assert.equal(hashHostApprovalToken(token), hashed);
  });
});

describe('host approval tokens and decisions', () => {
  let pool;
  let host;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
    await ensureHostApprovalSchema(pool);
    host = await seedHost(pool, {
      id: 'host-ceo',
      name: 'Huang Yaochi',
      roleSlug: 'ceo',
      zoneIds: [FIXTURE.zones.ceo],
    });
  });

  async function insertPendingVisit(id, extra = {}) {
    return seedVisit(pool, {
      id,
      hostId: host.hostId,
      zoneId: FIXTURE.zones.ceo,
      status: 'pending_approval',
      createdBy: 'usr-rcp-1',
      approvalRequestedBy: 'usr-rcp-1',
      ...extra,
    });
  }

  it('stores only the hash and looks up by the raw token', async () => {
    const { visitId } = await insertPendingVisit('visit-token-hash');
    const issued = await issueHostApprovalToken(pool, visitId);
    const [[row]] = await pool.query(
      'SELECT token_hash, used_at FROM visit_host_approval_tokens WHERE visit_id = ? AND used_at IS NULL',
      [visitId],
    );
    assert.equal(row.token_hash, hashHostApprovalToken(issued.token));
    assert.notEqual(row.token_hash, issued.token);
    assert.match(issued.approvalUrl, /\/visit\/host-approval\//);
    assert.equal(issued.approvalUrl.endsWith(issued.token), true);

    const loaded = await loadHostApprovalByToken(pool, issued.token);
    assert.equal(loaded.visit.id, visitId);
    assert.equal(loaded.payload.active, true);
    assert.equal(loaded.payload.visitor_name, 'Jane Doe');
    assert.equal(loaded.payload.pass_code, undefined);
    assert.equal(loaded.payload.invite_token, undefined);
    assert.equal(loaded.payload.phone, undefined);
    assert.equal(loaded.payload.email, undefined);
    assert.equal(JSON.stringify(loaded.payload).includes('secret-invite-token'), false);
    assert.equal(JSON.stringify(loaded.payload).includes('PASS42'), false);
  });

  it('rotates unused tokens so the previous raw token is no longer active', async () => {
    const { visitId } = await insertPendingVisit('visit-token-rotate');
    const first = await issueHostApprovalToken(pool, visitId);
    const second = await issueHostApprovalToken(pool, visitId);
    const previous = await loadHostApprovalByToken(pool, first.token);
    const current = await loadHostApprovalByToken(pool, second.token);
    assert.equal(previous.payload.active, false);
    assert.equal(current.payload.active, true);
  });

  it('can issue a replacement token without killing the previous one until commit', async () => {
    const { visitId } = await insertPendingVisit('visit-token-keep-old');
    const first = await issueHostApprovalToken(pool, visitId);
    const second = await issueHostApprovalToken(pool, visitId, { invalidateExisting: false });
    assert.equal((await loadHostApprovalByToken(pool, first.token)).payload.active, true);
    assert.equal((await loadHostApprovalByToken(pool, second.token)).payload.active, true);
    await invalidateOtherHostApprovalTokens(pool, visitId, second.id);
    assert.equal((await loadHostApprovalByToken(pool, first.token)).payload.active, false);
    assert.equal((await loadHostApprovalByToken(pool, second.token)).payload.active, true);
  });

  it('reminder rotates only after the new request is issued', async () => {
    const { visitId } = await insertPendingVisit('visit-token-resend');
    const first = await requestHostApproval(pool, { visitId, requestedByUserId: 'usr-rcp-1', notify: false });
    const second = await requestHostApproval(pool, { visitId, requestedByUserId: 'usr-rcp-1', resend: true, notify: false });
    assert.notEqual(first.approvalUrl, second.approvalUrl);
    const firstToken = first.approvalUrl.split('/').pop();
    const secondToken = second.approvalUrl.split('/').pop();
    assert.equal((await loadHostApprovalByToken(pool, firstToken)).payload.active, false);
    assert.equal((await loadHostApprovalByToken(pool, secondToken)).payload.active, true);
  });

  it('treats an expired unused token as inactive', async () => {
    const { visitId } = await insertPendingVisit('visit-token-expired');
    const token = generateHostApprovalToken();
    await pool.query(
      `INSERT INTO visit_host_approval_tokens (id, visit_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      ['hat-expired', visitId, hashHostApprovalToken(token), '2020-01-01 00:00:00'],
    );
    const loaded = await loadPublicHostApproval(pool, token);
    assert.equal(loaded.payload.active, false);
    assert.equal(loaded.payload.expired, true);
  });

  it('approves a booked appointment to expected', async () => {
    const { visitId } = await insertPendingVisit('visit-appt-approve');
    const [[visit]] = await pool.query('SELECT * FROM visits WHERE id = ?', [visitId]);
    const [[hostRow]] = await pool.query('SELECT * FROM hosts WHERE id = ?', [host.hostId]);
    const result = await applyHostApproval(pool, {
      visit,
      host: hostRow,
      actorUserId: host.userId,
      source: 'host_approval_token',
      notify: false,
    });
    assert.equal(result.nextStatus, 'expected');
    const [[updated]] = await pool.query('SELECT status FROM visits WHERE id = ?', [visitId]);
    assert.equal(updated.status, 'expected');
  });

  it('approves an on-site queued guest to waiting', async () => {
    const { visitId } = await insertPendingVisit('visit-guest-approve', {
      checkedInAt: '2026-08-17T10:00:00Z',
      expectedAt: null,
    });
    const [[visit]] = await pool.query('SELECT * FROM visits WHERE id = ?', [visitId]);
    const [[hostRow]] = await pool.query('SELECT * FROM hosts WHERE id = ?', [host.hostId]);
    const result = await applyHostApproval(pool, {
      visit,
      host: hostRow,
      actorUserId: host.userId,
      notify: false,
    });
    assert.equal(result.nextStatus, 'waiting');
    assert.equal(result.isReceptionQueue, true);
  });

  it('rejects only when a reason is provided', async () => {
    const { visitId } = await insertPendingVisit('visit-reject-reason');
    const [[visit]] = await pool.query('SELECT * FROM visits WHERE id = ?', [visitId]);
    await assert.rejects(
      () => applyHostRejection(pool, { visit, actorUserId: host.userId, notify: false }),
      (err) => err.status === 400 && /reason/i.test(err.message),
    );
    const result = await applyHostRejection(pool, {
      visit,
      actorUserId: host.userId,
      reason: 'Not available today',
      notify: false,
    });
    assert.equal(result.nextStatus, 'rejected');
  });

  it('public approve then replay returns already-decided', async () => {
    const { visitId } = await insertPendingVisit('visit-public-replay');
    const issued = await issueHostApprovalToken(pool, visitId);
    const first = await decidePublicHostApproval(pool, {
      token: issued.token,
      decision: 'approved',
      notify: false,
    });
    assert.equal(first.nextStatus, 'expected');
    await assert.rejects(
      () => decidePublicHostApproval(pool, { token: issued.token, decision: 'approved', notify: false }),
      (err) => err.status === 409 && err.data?.already_decided === true,
    );
  });

  it('public reject requires a reason', async () => {
    const { visitId } = await insertPendingVisit('visit-public-reject');
    const issued = await issueHostApprovalToken(pool, visitId);
    await assert.rejects(
      () => decidePublicHostApproval(pool, { token: issued.token, decision: 'rejected', notify: false }),
      (err) => err.status === 400,
    );
    const result = await decidePublicHostApproval(pool, {
      token: issued.token,
      decision: 'rejected',
      reason: 'Meeting cancelled',
      notify: false,
    });
    assert.equal(result.nextStatus, 'rejected');
  });

  it('public payload never includes invite token or pass code', () => {
    const payload = toPublicHostApprovalPayload({
      visitor_name: 'Jane Doe',
      company: 'Acme',
      purpose: 'Meeting',
      expected_at: '2026-08-20T09:00:00Z',
      site_name: 'HQ',
      host_name: 'Huang',
      status: 'pending_approval',
      pass_code: 'SECRET',
      invite_token: 'tok',
      phone: '+2609',
    });
    const json = JSON.stringify(payload);
    assert.equal(payload.pass_code, undefined);
    assert.doesNotMatch(json, /SECRET|tok|\+2609/);
  });
});
