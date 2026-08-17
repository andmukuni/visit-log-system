import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROLL_CALL_ENTRY_STATUSES } from '../server/rollCallService.js';
import { visitOnSitePredicate } from '../shared/visitOnSite.js';

describe('roll call entry statuses', () => {
  it('includes all required evacuation statuses', () => {
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('accounted_for'));
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('not_yet_accounted_for'));
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('left_site'));
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('unknown'));
  });

  it('seeds roll-call entries from campus occupancy, not only status=checked_in', () => {
    const source = readFileSync(fileURLToPath(new URL('../server/rollCallService.js', import.meta.url)), 'utf8');
    assert.match(source, /visitOnSitePredicate\('vis'\)/);
    assert.equal(source.includes("vis.status = 'checked_in'"), false);
    const sql = visitOnSitePredicate('vis');
    assert.match(sql, /arrived_at_gate/);
    assert.match(sql, /pending_approval/);
    assert.match(sql, /checked_in_at IS NOT NULL/);
  });
});
