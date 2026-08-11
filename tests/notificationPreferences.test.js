import { describe, it, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChannelAllowed } from '../server/notificationService.js';
import {
  EVENT_CATEGORY_MAP,
  categoryKeyForEvent,
} from '../shared/notificationCategories.js';
import pool from '../server/db.js';

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore if pool was never opened
  }
});

function mockPool(rows = []) {
  return {
    query: mock.fn(async () => [rows]),
  };
}

describe('notification category mapping', () => {
  it('maps lifecycle events to org category keys', () => {
    assert.equal(categoryKeyForEvent('pre_registered'), 'visit_registered');
    assert.equal(categoryKeyForEvent('arrived_at_gate'), 'visit_arrived_gate');
    assert.equal(categoryKeyForEvent('in_meeting'), 'visit_waiting');
    assert.equal(categoryKeyForEvent('entered_premises'), 'visit_arrived_gate');
    assert.equal(categoryKeyForEvent('host_booking'), 'visit_host_booking');
    assert.ok(EVENT_CATEGORY_MAP.cancelled);
  });
});

describe('resolveChannelAllowed', () => {
  it('skips email when org category is disabled', async () => {
    const pool = mockPool();
    const result = await resolveChannelAllowed(pool, {
      organisationId: 'org_1',
      userId: 'user_1',
      channel: 'email',
      categoryKey: 'visit_approved',
      orgSettings: {
        in_app_notifications: true,
        email_visit_approved: false,
        sms_visit_approved: true,
      },
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'org_email_disabled');
    assert.equal(pool.query.mock.callCount(), 0);
  });

  it('skips in-app when master switch is off', async () => {
    const pool = mockPool();
    const result = await resolveChannelAllowed(pool, {
      organisationId: 'org_1',
      userId: 'user_1',
      channel: 'in_app',
      categoryKey: 'visit_approved',
      orgSettings: { in_app_notifications: false },
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'org_in_app_disabled');
  });

  it('skips when user muted the channel category', async () => {
    const pool = mockPool([
      { channel: 'sms', category_key: 'visit_arrived_gate', enabled: 0 },
    ]);
    const result = await resolveChannelAllowed(pool, {
      organisationId: 'org_1',
      userId: 'user_1',
      channel: 'sms',
      categoryKey: 'visit_arrived_gate',
      orgSettings: {
        in_app_notifications: true,
        sms_visit_arrived_gate: true,
      },
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'user_category_muted');
  });

  it('skips when user muted the whole channel with *', async () => {
    const pool = mockPool([
      { channel: 'email', category_key: '*', enabled: 0 },
    ]);
    const result = await resolveChannelAllowed(pool, {
      organisationId: 'org_1',
      userId: 'user_1',
      channel: 'email',
      categoryKey: 'visit_checked_in',
      orgSettings: {
        in_app_notifications: true,
        email_visit_checked_in: true,
      },
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'user_channel_muted');
  });

  it('allows send when org and user prefs permit', async () => {
    const pool = mockPool([]);
    const result = await resolveChannelAllowed(pool, {
      organisationId: 'org_1',
      userId: 'user_1',
      channel: 'email',
      categoryKey: 'visit_approved',
      orgSettings: {
        in_app_notifications: true,
        email_visit_approved: true,
      },
    });
    assert.equal(result.allowed, true);
  });

  it('allows visitor (no userId) when org category is on', async () => {
    const pool = mockPool();
    const result = await resolveChannelAllowed(pool, {
      organisationId: 'org_1',
      channel: 'sms',
      categoryKey: 'visit_registered',
      orgSettings: {
        sms_visit_registered: true,
      },
    });
    assert.equal(result.allowed, true);
    assert.equal(pool.query.mock.callCount(), 0);
  });
});
