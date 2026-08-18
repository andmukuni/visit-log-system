import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import {
  createTestPool,
  seedFixture,
  seedHost,
  FIXTURE,
} from './helpers/pgMemHarness.js';
import {
  ensurePushSubscriptionSchema,
  savePushSubscription,
  removePushSubscription,
  listSubscriptionsForUser,
  getVapidConfig,
  sendPushToUser,
} from '../server/pushSubscriptionService.js';
import { sendFromTemplate } from '../server/notificationService.js';
import { generateId } from '../server/visitorSchema.js';
import appPool from '../server/db.js';

const TEST_VAPID = {
  publicKey: 'BB-W_4vrC9ys-Tui8fouea8ZhkR7uWriElV8zdnNCJpqpcNef7_92P1VbF57uzrCnfZTDe0r3-rnE7lp8_0_DPo',
  privateKey: 'Ww_2CL6C2vhJb2STFnX3E14s4y4fY0lc5QTAZrFV5_o',
};

after(async () => {
  try { await appPool.end(); } catch { /* never opened */ }
});

describe('push subscription storage', () => {
  let pool;
  let host;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
    await ensurePushSubscriptionSchema(pool);
    host = await seedHost(pool, {
      id: 'host-push',
      name: 'Push Host',
      roleSlug: 'ceo',
      zoneIds: [FIXTURE.zones.ceo],
    });
  });

  it('stores and lists a subscription for a user', async () => {
    const saved = await savePushSubscription(pool, {
      userId: host.userId,
      endpoint: 'https://push.example/subscriber/1',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      userAgent: 'test',
    });
    assert.ok(saved.id);
    const rows = await listSubscriptionsForUser(pool, host.userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].endpoint, 'https://push.example/subscriber/1');
  });

  it('updates an existing endpoint for the same user', async () => {
    await savePushSubscription(pool, {
      userId: host.userId,
      endpoint: 'https://push.example/subscriber/1',
      p256dh: 'next-p256dh',
      auth: 'next-auth',
    });
    const rows = await listSubscriptionsForUser(pool, host.userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].p256dh, 'next-p256dh');
  });

  it('removes a subscription by endpoint', async () => {
    const removed = await removePushSubscription(pool, {
      userId: host.userId,
      endpoint: 'https://push.example/subscriber/1',
    });
    assert.equal(removed, true);
    const rows = await listSubscriptionsForUser(pool, host.userId);
    assert.equal(rows.length, 0);
  });
});

describe('getVapidConfig', () => {
  it('reports unconfigured when env keys are missing', () => {
    const originalPublic = process.env.VAPID_PUBLIC_KEY;
    const originalPrivate = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const config = getVapidConfig();
    assert.equal(config.configured, false);
    process.env.VAPID_PUBLIC_KEY = originalPublic;
    process.env.VAPID_PRIVATE_KEY = originalPrivate;
  });
});

describe('sendPushToUser', () => {
  let pool;
  let host;
  let originalSend;
  let sendMock;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
    await ensurePushSubscriptionSchema(pool);
    host = await seedHost(pool, {
      id: 'host-push-send',
      name: 'Push Send Host',
      roleSlug: 'ceo',
      zoneIds: [FIXTURE.zones.ceo],
    });
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID.publicKey;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID.privateKey;
    sendMock = mock.fn(async () => {});
    webpush.sendNotification = sendMock;
    await savePushSubscription(pool, {
      userId: host.userId,
      endpoint: 'https://push.example/subscriber/send',
      p256dh: 'p256dh-send',
      auth: 'auth-send',
    });
  });

  after(() => {
    webpush.sendNotification = originalSend;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it('delivers a push payload for subscribed users', async () => {
    const result = await sendPushToUser(pool, {
      userId: host.userId,
      organisationId: FIXTURE.orgId,
      title: 'Approval required',
      body: 'Visitor waiting',
      metadata: { visitId: 'vis-push', eventType: 'pending_approval', audience: 'host' },
      categoryKey: 'visits',
    });
    assert.equal(result.ok, true);
    assert.equal(sendMock.mock.callCount(), 1);
    const [, payload] = sendMock.mock.calls[0].arguments;
    const parsed = JSON.parse(payload);
    assert.equal(parsed.title, 'Approval required');
    assert.match(parsed.url, /\/host\/approvals$/);
  });
});

describe('in_app notification mirrors to push', () => {
  let pool;
  let host;
  let originalSend;
  let sendMock;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
    await ensurePushSubscriptionSchema(pool);
    host = await seedHost(pool, {
      id: 'host-push-mirror',
      name: 'Mirror Host',
      roleSlug: 'ceo',
      zoneIds: [FIXTURE.zones.ceo],
    });
    await pool.query(
      `INSERT INTO notification_templates (id, organisation_id, template_key, channel, subject, body_template, enabled)
       VALUES (?, ?, ?, 'in_app', ?, ?, 1)`,
      [
        generateId('ntpl'),
        FIXTURE.orgId,
        'visit.pending_approval',
        'Approval required',
        'Visitor {{visitor_name}} is awaiting approval.',
      ],
    );
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID.publicKey;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID.privateKey;
    sendMock = mock.fn(async () => {});
    webpush.sendNotification = sendMock;
    await savePushSubscription(pool, {
      userId: host.userId,
      endpoint: 'https://push.example/subscriber/mirror',
      p256dh: 'p256dh-mirror',
      auth: 'auth-mirror',
    });
  });

  after(() => {
    webpush.sendNotification = originalSend;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it('sends push when an in_app template notification is created', async () => {
    const results = await sendFromTemplate(pool, {
      organisationId: FIXTURE.orgId,
      userId: host.userId,
      templateKey: 'visit.pending_approval',
      vars: { visitor_name: 'Jane Guest' },
      idempotencyKey: 'mirror-push-1',
      metadata: { visitId: 'vis-mirror', eventType: 'pending_approval', audience: 'host' },
      channels: ['in_app'],
      categoryKey: 'visits',
      skipPreferenceCheck: true,
    });
    const inApp = results.find((row) => row.channel === 'in_app');
    assert.equal(inApp?.ok, true);
    assert.equal(sendMock.mock.callCount(), 1);
  });
});
