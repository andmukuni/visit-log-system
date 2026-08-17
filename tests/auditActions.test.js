import { describe, it, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { auditVisitAccessDenied, auditFullRecordViewed } from '../server/visitorAccessPolicy.js';
import { upsertVisitorContactDetails } from '../server/accessSchema.js';
import pool from '../server/db.js';

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore if pool was never opened
  }
});

function mockPool() {
  return { query: mock.fn(async () => [[]]) };
}

describe('visitor.access_denied_zone audit (scenarios 9, 11)', () => {
  it('records the actor, target visit, and a machine-readable reason', async () => {
    const pool = mockPool();
    await auditVisitAccessDenied(pool, {
      organisationId: 'org1',
      actorUserId: 'guard-1',
      visitId: 'visit-1',
      reason: 'security_scope_mismatch',
    });

    assert.equal(pool.query.mock.callCount(), 1);
    const [sql, params] = pool.query.mock.calls[0].arguments;
    assert.match(sql, /INSERT INTO audit_logs/);
    assert.ok(params.includes('visitor.access_denied_zone'));
    assert.ok(params.includes('org1'));
    assert.ok(params.includes('guard-1'));
    assert.ok(params.includes('visit-1'));
    assert.ok(params.includes('denied'));
    const detailsJson = params.find((p) => typeof p === 'string' && p.includes('security_scope_mismatch'));
    assert.ok(detailsJson);
    assert.deepEqual(JSON.parse(detailsJson), { reason: 'security_scope_mismatch' });
  });
});

describe('visitor.full_record_viewed audit', () => {
  it('fires for a single-visit detail load, mirroring the existing vip.profile_access precedent', async () => {
    const pool = mockPool();
    await auditFullRecordViewed(pool, { organisationId: 'org1', actorUserId: 'r1', visitId: 'visit-1' });

    const [, params] = pool.query.mock.calls[0].arguments;
    assert.ok(params.includes('visitor.full_record_viewed'));
  });
});

describe('visitor.details_updated audit — never logs raw ID/notes values (Logic.md)', () => {
  it('logs only which fields changed, never the idNumber/confidentialNotes values', async () => {
    const pool = mockPool();
    await upsertVisitorContactDetails(pool, 'visitor-1', {
      idType: 'nrc',
      idNumber: '123456/78/9',
      confidentialNotes: 'Sensitive allergy information',
      actorUserId: 'host-1',
      organisationId: 'org1',
    });

    // Third call is the audit write (contact upsert, visitors masked ID update, then audit).
    assert.equal(pool.query.mock.callCount(), 3);
    const [sql, params] = pool.query.mock.calls[2].arguments;
    assert.match(sql, /INSERT INTO audit_logs/);
    assert.ok(params.includes('visitor.details_updated'));

    const detailsJson = params.find((p) => typeof p === 'string' && p.startsWith('{'));
    assert.ok(detailsJson);
    const details = JSON.parse(detailsJson);
    assert.deepEqual(details.fieldsUpdated.sort(), ['confidentialNotes', 'idNumber', 'idType']);

    // The raw values must never appear anywhere in the audit call's params.
    const serializedParams = JSON.stringify(params);
    assert.doesNotMatch(serializedParams, /123456\/78\/9/);
    assert.doesNotMatch(serializedParams, /Sensitive allergy information/);
  });

  it('writes nothing at all when no contact fields are provided', async () => {
    const pool = mockPool();
    await upsertVisitorContactDetails(pool, 'visitor-1', { actorUserId: 'host-1', organisationId: 'org1' });
    assert.equal(pool.query.mock.callCount(), 0);
  });
});
