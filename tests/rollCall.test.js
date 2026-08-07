import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROLL_CALL_ENTRY_STATUSES } from '../server/rollCallService.js';

describe('roll call entry statuses', () => {
  it('includes all required evacuation statuses', () => {
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('accounted_for'));
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('not_yet_accounted_for'));
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('left_site'));
    assert.ok(ROLL_CALL_ENTRY_STATUSES.includes('unknown'));
  });
});
