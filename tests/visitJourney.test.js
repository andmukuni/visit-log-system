import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISIT_STATUS_ALIASES,
  resolveJourneyStatusKey,
  resolveJourneyLabel,
} from '../shared/visitJourney.js';

describe('visit journey status mapping', () => {
  it('keeps waiting distinct from in_meeting', () => {
    assert.equal(VISIT_STATUS_ALIASES.waiting, undefined);
    assert.equal(resolveJourneyStatusKey('waiting', true), 'waiting');
    assert.equal(resolveJourneyLabel('waiting', true), 'Waiting for host');
    assert.equal(resolveJourneyStatusKey('in_meeting', true), 'in_meeting');
    assert.equal(resolveJourneyLabel('in_meeting', true), 'With host');
  });

  it('shows on-site guests at the desk step after host reject or queue', () => {
    assert.equal(resolveJourneyStatusKey('pending_approval', true), 'checked_in');
    assert.equal(resolveJourneyStatusKey('rejected', true), 'checked_in');
    assert.equal(resolveJourneyStatusKey('rejected', false), null);
  });

  it('resolveVisitStatusDisplay maps list rows to journey labels', async () => {
    const { resolveVisitStatusDisplay } = await import('../shared/visitJourney.js');
    assert.deepEqual(
      resolveVisitStatusDisplay('pending_approval', true),
      { status: 'checked_in', label: 'On site' },
    );
    assert.deepEqual(
      resolveVisitStatusDisplay('waiting', true),
      { status: 'waiting', label: 'Waiting for host' },
    );
  });
});
