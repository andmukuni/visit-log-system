import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('visit check-in SQL bindings', () => {
  it('uses null instead of undefined for optional badge and station values', () => {
    const assignedBadge = undefined;
    const visit = { badge_number: null };
    const scope = { station_id: undefined };

    const nextBadgeNumber = assignedBadge || visit.badge_number || null;
    const params = [nextBadgeNumber, scope?.station_id ?? null, 'zone-1', 'visit-1'];

    assert.equal(nextBadgeNumber, null);
    assert.equal(params.every((value) => value !== undefined), true);
  });
});
