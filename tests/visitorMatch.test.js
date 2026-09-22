import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, seedFixture, FIXTURE } from './helpers/pgMemHarness.js';
import { findExistingVisitor, findOrCreateVisitor, phoneMatchKey } from '../server/visitorMatch.js';
import appPool from '../server/db.js';

after(async () => { try { await appPool.end(); } catch { /* never opened */ } });

describe('phoneMatchKey', () => {
  it('treats local and international Zambia numbers as the same key', () => {
    assert.equal(phoneMatchKey('+260971234567'), '971234567');
    assert.equal(phoneMatchKey('0971234567'), '971234567');
    assert.equal(phoneMatchKey('260 971 234 567'), '971234567');
  });
});

describe('findOrCreateVisitor', () => {
  let pool;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
  });

  it('reuses a visitor when the NRC already exists', async () => {
    const created = await findOrCreateVisitor(pool, {
      organisationId: FIXTURE.orgId,
      fullName: 'Mary Phiri',
      phone: '0971111222',
      idNumber: '123456/78/1',
    });
    await pool.query(
      `INSERT INTO visitor_contact_details (visitor_id, id_type, id_number) VALUES (?, 'nrc', ?)`,
      [created.id, '123456/78/1'],
    );

    const again = await findOrCreateVisitor(pool, {
      organisationId: FIXTURE.orgId,
      fullName: 'Mary Banda',
      phone: '+260970000099',
      idNumber: '123456781',
    });

    assert.equal(again.matched, true);
    assert.equal(again.matchedBy, 'nrc');
    assert.equal(again.id, created.id);

    const [[row]] = await pool.query('SELECT full_name FROM visitors WHERE id = ?', [created.id]);
    assert.equal(row.full_name, 'Mary Banda');
  });

  it('reuses a visitor when the phone is stored in another format', async () => {
    const created = await findOrCreateVisitor(pool, {
      organisationId: FIXTURE.orgId,
      fullName: 'John Chanda',
      phone: '+260971234567',
    });

    const match = await findExistingVisitor(pool, {
      organisationId: FIXTURE.orgId,
      phone: '0971234567',
    });
    assert.equal(match.id, created.id);
    assert.equal(match.matchedBy, 'phone');

    const [[count]] = await pool.query(
      'SELECT COUNT(*) AS count FROM visitors WHERE organisation_id = ? AND full_name = ?',
      [FIXTURE.orgId, 'John Chanda'],
    );
    assert.equal(Number(count.count), 1);
  });
});
