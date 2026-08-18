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

  it('maps on-site queued guests to waiting and rejected guests back to reception', () => {
    assert.equal(resolveJourneyStatusKey('pending_approval', true), 'waiting');
    assert.equal(resolveJourneyStatusKey('rejected', true), 'reception_check_in');
    assert.equal(resolveJourneyStatusKey('rejected', false), null);
  });

  it('resolveVisitStatusDisplay maps list rows to journey labels', async () => {
    const { resolveVisitStatusDisplay } = await import('../shared/visitJourney.js');
    assert.deepEqual(
      resolveVisitStatusDisplay('pending_approval', true),
      { status: 'waiting', label: 'Waiting for host' },
    );
    assert.deepEqual(
      resolveVisitStatusDisplay('waiting', true),
      { status: 'waiting', label: 'Waiting for host' },
    );
    assert.deepEqual(
      resolveVisitStatusDisplay('reception_check_in', true),
      { status: 'reception_check_in', label: 'Reception' },
    );
  });
});
