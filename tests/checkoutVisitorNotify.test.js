import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestPool,
  seedFixture,
  seedHost,
  seedVisit,
  FIXTURE,
} from './helpers/pgMemHarness.js';
import { notifyVisitEvent } from '../server/notificationService.js';
import { DEFAULT_NOTIFICATIONS } from '../server/services/adminSettingsService.js';
import { generateId } from '../server/visitorSchema.js';
import appPool from '../server/db.js';

after(async () => {
  try { await appPool.end(); } catch { /* never opened */ }
});

const CHECKOUT_NOTIFY_SETTINGS = {
  ...DEFAULT_NOTIFICATIONS,
  sms_visit_checked_out: true,
  email_visit_checked_out: true,
};

async function seedTemplate(pool, orgId, key, { subject, inApp, email, sms }) {
  for (const [channel, body] of [['in_app', inApp], ['email', email], ['sms', sms]]) {
    await pool.query(
      `INSERT INTO notification_templates (id, organisation_id, template_key, channel, subject, body_template, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [generateId('ntpl'), orgId, key, channel, subject, body],
    );
  }
}

describe('guest checkout notifications', () => {
  let pool;
  let host;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
    host = await seedHost(pool, {
      id: 'host-checkout',
      name: 'Checkout Host',
      roleSlug: 'host',
      zoneIds: [FIXTURE.zones.area],
    });

    await seedTemplate(pool, FIXTURE.orgId, 'visit.visitor_checked_out', {
      subject: 'Visit complete',
      inApp: 'Your visit is complete.',
      email: 'Hello {{visitor_name}}, thank you for visiting.',
      sms: 'Visit complete. Thank you.',
    });
    await seedTemplate(pool, FIXTURE.orgId, 'visit.checked_out', {
      subject: 'Visitor departed',
      inApp: '{{visitor_name}} has checked out.',
      email: '{{visitor_name}} has checked out.',
      sms: '{{visitor_name}} has checked out.',
    });
  });

  async function visitorCheckoutDeliveries(visitId) {
    const [rows] = await pool.query(
      `SELECT n.channel, n.notification_type, n.idempotency_key, d.recipient
       FROM notifications n
       LEFT JOIN notification_deliveries d ON d.notification_id = n.id
       WHERE n.notification_type = 'visit.visitor_checked_out'
         AND n.idempotency_key LIKE ?`,
      [`%:${visitId}:%`],
    );
    return rows;
  }

  it('sends guest email and SMS once on reception checkout, not again when the gate confirms left premises', async () => {
    const { visitId } = await seedVisit(pool, {
      id: 'visit-rcp-then-gate',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.area,
      status: 'checked_out',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'checked_out',
      actorUserId: 'usr-rcp-desk',
      orgSettings: CHECKOUT_NOTIFY_SETTINGS,
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'left_premises',
      actorUserId: 'usr-gate',
      notifyVisitor: false,
      orgSettings: CHECKOUT_NOTIFY_SETTINGS,
    });

    const rows = await visitorCheckoutDeliveries(visitId);
    const emails = rows.filter((r) => r.channel === 'email');
    const sms = rows.filter((r) => r.channel === 'sms');
    assert.equal(emails.length, 1);
    assert.equal(sms.length, 1);
    assert.equal(emails[0].recipient, 'jane@acme.example');
    assert.equal(sms[0].recipient, '+260971111111');
  });

  it('does not SMS the guest on left_premises even if notifyVisitor is left on', async () => {
    const { visitId } = await seedVisit(pool, {
      id: 'visit-left-premises-silent',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.area,
      status: 'checked_out',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'left_premises',
      actorUserId: 'usr-gate',
      orgSettings: CHECKOUT_NOTIFY_SETTINGS,
    });

    const rows = await visitorCheckoutDeliveries(visitId);
    assert.equal(rows.length, 0);
  });

  it('still notifies the guest once when they check out at the gate first', async () => {
    const { visitId } = await seedVisit(pool, {
      id: 'visit-gate-only',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.area,
      status: 'checked_in',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'checked_out',
      actorUserId: 'usr-gate',
      orgSettings: CHECKOUT_NOTIFY_SETTINGS,
    });

    const rows = await visitorCheckoutDeliveries(visitId);
    assert.equal(rows.filter((r) => r.channel === 'email').length, 1);
    assert.equal(rows.filter((r) => r.channel === 'sms').length, 1);
  });

  it('does not send a second guest SMS if checkout is notified twice', async () => {
    const { visitId } = await seedVisit(pool, {
      id: 'visit-double-checkout',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.area,
      status: 'checked_out',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'checked_out',
      actorUserId: 'usr-rcp-desk',
      orgSettings: CHECKOUT_NOTIFY_SETTINGS,
    });
    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'checked_out',
      actorUserId: 'usr-gate',
      orgSettings: CHECKOUT_NOTIFY_SETTINGS,
    });

    const rows = await visitorCheckoutDeliveries(visitId);
    assert.equal(rows.filter((r) => r.channel === 'email').length, 1);
    assert.equal(rows.filter((r) => r.channel === 'sms').length, 1);
  });
});
