import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotificationDeepLink } from '../shared/notificationDeepLinks.js';

describe('resolveNotificationDeepLink', () => {
  it('routes host pending approval to approvals page', () => {
    assert.equal(
      resolveNotificationDeepLink({ eventType: 'pending_approval', audience: 'host', visitId: 'vis-1' }),
      '/host/approvals',
    );
  });

  it('routes host visit alerts to host visitor detail', () => {
    assert.equal(
      resolveNotificationDeepLink({ eventType: 'in_meeting', audience: 'host', visitId: 'vis-2' }),
      '/host/visitors/vis-2',
    );
  });

  it('routes reception alerts to reception visitor detail', () => {
    assert.equal(
      resolveNotificationDeepLink({ eventType: 'rejected', audience: 'reception_requester', visitId: 'vis-3' }),
      '/reception/visitors/vis-3',
    );
  });

  it('falls back to portal notification inbox when no visit id', () => {
    assert.equal(resolveNotificationDeepLink({ audience: 'host' }), '/host/notifications');
    assert.equal(resolveNotificationDeepLink({ audience: 'reception_same_zone' }), '/reception/notifications');
  });
});
