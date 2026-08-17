import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestPool,
  seedFixture,
  seedHost,
  seedVisit,
  seedReceptionist,
  FIXTURE,
} from './helpers/pgMemHarness.js';
import { notifyVisitEvent } from '../server/notificationService.js';
import { DEFAULT_NOTIFICATIONS } from '../server/services/adminSettingsService.js';
import { generateId } from '../server/visitorSchema.js';
import appPool from '../server/db.js';

after(async () => {
  try { await appPool.end(); } catch { /* never opened */ }
});

async function seedTemplate(pool, orgId, key, { subject, inApp, email, sms }) {
  for (const [channel, body] of [['in_app', inApp], ['email', email], ['sms', sms]]) {
    await pool.query(
      `INSERT INTO notification_templates (id, organisation_id, template_key, channel, subject, body_template, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [generateId('ntpl'), orgId, key, channel, subject, body],
    );
  }
}

describe('host approval notification audiences', () => {
  let pool;
  let host;

  before(async () => {
    pool = await createTestPool();
    await seedFixture(pool);
    host = await seedHost(pool, {
      id: 'host-ceo',
      name: 'Huang Yaochi',
      roleSlug: 'ceo',
      zoneIds: [FIXTURE.zones.ceo],
    });
    await pool.query(
      `INSERT INTO users (id, name, email, phone, role, email_verified)
       VALUES (?, ?, ?, ?, 'user', 1)`,
      ['usr-rcp-desk', 'Desk Reception', 'desk@example.com', '+260970111111'],
    );

    await seedTemplate(pool, FIXTURE.orgId, 'visit.pending_approval', {
      subject: 'Approval required',
      inApp: 'Visitor {{visitor_name}} is awaiting your approval.',
      email: 'Hello {{host_name}}, {{visitor_name}} {{approval_context}}. {{approval_url}}',
      sms: '{{visitor_name}} needs your approval. {{approval_url}}',
    });
    await seedTemplate(pool, FIXTURE.orgId, 'visit.reception_host_approved', {
      subject: 'Host approved visitor',
      inApp: '{{host_name}} approved {{visitor_name}}.',
      email: '{{host_name}} approved {{visitor_name}}.',
      sms: '{{host_name}} approved {{visitor_name}}.',
    });
    await seedTemplate(pool, FIXTURE.orgId, 'visit.reception_host_rejected', {
      subject: 'Host rejected visitor',
      inApp: '{{host_name}} rejected {{visitor_name}}.',
      email: '{{host_name}} rejected {{visitor_name}}.',
      sms: '{{host_name}} rejected {{visitor_name}}.',
    });
    await seedTemplate(pool, FIXTURE.orgId, 'visit.approved', {
      subject: 'Visit approved',
      inApp: 'Your visit for {{visitor_name}} has been approved.',
      email: 'Hello {{visitor_name}}, approved.',
      sms: 'Visit approved.',
    });
    await seedTemplate(pool, FIXTURE.orgId, 'visit.rejected', {
      subject: 'Visit rejected',
      inApp: 'The visit for {{visitor_name}} was rejected.',
      email: 'Hello {{visitor_name}}, rejected.',
      sms: 'Visit rejected.',
    });
    await seedTemplate(pool, FIXTURE.orgId, 'visit.reception_new_expected', {
      subject: 'New expected visitor',
      inApp: '{{visitor_name}} is expected for {{host_name}} at {{expected_at}}.',
      email: '{{visitor_name}} expected for {{host_name}}.',
      sms: '{{visitor_name}} expected.',
    });
  });

  async function listDeliveries(visitId) {
    const [rows] = await pool.query(
      `SELECT n.channel, n.notification_type, n.user_id, n.body, n.metadata, d.recipient
       FROM notifications n
       LEFT JOIN notification_deliveries d ON d.notification_id = n.id
       WHERE n.idempotency_key LIKE ?`,
      [`%:${visitId}:%`],
    );
    return rows;
  }

  it('sends pending_approval SMS and email with the approval URL to the host only', async () => {
    const approvalUrl = 'https://app.example/visit/host-approval/raw-token-value';
    const { visitId } = await seedVisit(pool, {
      id: 'visit-notify-pending',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.ceo,
      status: 'pending_approval',
      createdBy: 'usr-rcp-desk',
      approvalRequestedBy: 'usr-rcp-desk',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'pending_approval',
      actorUserId: 'usr-rcp-desk',
      extra: {
        approval_url: approvalUrl,
        approval_context: 'has been booked to see you and needs your approval',
      },
      notifyVisitor: false,
      orgSettings: DEFAULT_NOTIFICATIONS,
    });

    const rows = await listDeliveries(visitId);
    const hostEmail = rows.filter((r) => r.channel === 'email' && r.notification_type === 'visit.pending_approval');
    const hostSms = rows.filter((r) => r.channel === 'sms' && r.notification_type === 'visit.pending_approval');
    assert.equal(hostEmail.length, 1);
    assert.equal(hostSms.length, 1);
    assert.match(hostEmail[0].body, /raw-token-value/);
    assert.match(hostSms[0].body, /raw-token-value/);
    assert.equal(hostEmail[0].recipient, `${host.hostId}@example.com`);
    assert.equal(hostSms[0].recipient, '+260977000001');

    const toReceptionist = rows.filter((r) => r.user_id === 'usr-rcp-desk');
    assert.equal(toReceptionist.length, 0);

    const visitorRows = rows.filter((r) => r.recipient === 'jane@acme.example' || r.recipient === '+260971111111');
    assert.equal(visitorRows.length, 0);
    assert.equal(rows.some((r) => r.notification_type === 'visit.approved'), false);
  });

  it('notifies the requesting receptionist on approve and never the visitor', async () => {
    const { visitId } = await seedVisit(pool, {
      id: 'visit-notify-approved',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.ceo,
      status: 'expected',
      createdBy: 'usr-rcp-desk',
      approvalRequestedBy: 'usr-rcp-desk',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'approved',
      actorUserId: host.userId,
      notifyVisitor: false,
      orgSettings: DEFAULT_NOTIFICATIONS,
    });

    const rows = await listDeliveries(visitId);
    const requester = rows.filter((r) => r.notification_type === 'visit.reception_host_approved');
    assert.equal(requester.length, 3);
    assert.deepEqual(requester.map((r) => r.channel).sort(), ['email', 'in_app', 'sms']);
    assert.ok(requester.every((r) => r.user_id === 'usr-rcp-desk' || r.channel !== 'in_app'));

    const visitorFacing = rows.filter((r) => (
      r.notification_type === 'visit.approved'
      || r.recipient === 'jane@acme.example'
      || r.recipient === '+260971111111'
    ));
    assert.equal(visitorFacing.length, 0);
  });

  it('notifies the requesting receptionist on reject and never the visitor', async () => {
    const { visitId } = await seedVisit(pool, {
      id: 'visit-notify-rejected',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.ceo,
      status: 'rejected',
      createdBy: 'usr-rcp-desk',
      approvalRequestedBy: 'usr-rcp-desk',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'rejected',
      actorUserId: host.userId,
      notifyVisitor: false,
      orgSettings: DEFAULT_NOTIFICATIONS,
    });

    const rows = await listDeliveries(visitId);
    const requester = rows.filter((r) => r.notification_type === 'visit.reception_host_rejected');
    assert.equal(requester.length, 3);
    const visitorFacing = rows.filter((r) => (
      r.notification_type === 'visit.rejected'
      || r.recipient === 'jane@acme.example'
      || r.recipient === '+260971111111'
    ));
    assert.equal(visitorFacing.length, 0);
  });

  it('sends a reminder with a new approval URL instead of dropping it as a duplicate', async () => {
    const { visitId } = await seedVisit(pool, {
      id: 'visit-notify-resend',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.ceo,
      status: 'pending_approval',
      createdBy: 'usr-rcp-desk',
      approvalRequestedBy: 'usr-rcp-desk',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'pending_approval',
      actorUserId: 'usr-rcp-desk',
      extra: { approval_url: 'https://app.example/visit/host-approval/first-token' },
      notifyVisitor: false,
      orgSettings: DEFAULT_NOTIFICATIONS,
    });
    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'pending_approval',
      actorUserId: 'usr-rcp-desk',
      extra: { approval_url: 'https://app.example/visit/host-approval/second-token' },
      notifyVisitor: false,
      skipReceptionExpected: true,
      notificationKeySuffix: 'nudge:abc123',
      orgSettings: DEFAULT_NOTIFICATIONS,
    });

    const rows = await listDeliveries(visitId);
    const hostEmail = rows.filter((r) => r.channel === 'email' && r.notification_type === 'visit.pending_approval');
    assert.equal(hostEmail.length, 2);
    assert.equal(hostEmail.some((r) => /first-token/.test(r.body)), true);
    assert.equal(hostEmail.some((r) => /second-token/.test(r.body)), true);
  });

  it('does not ping other receptionists when an on-site guest is queued for approval', async () => {
    await seedReceptionist(pool, {
      id: 'rcp-ceo-desk',
      name: 'CEO Desk',
      zoneIds: [FIXTURE.zones.ceo],
    });
    const { visitId } = await seedVisit(pool, {
      id: 'visit-notify-onsite-queue',
      hostId: host.hostId,
      zoneId: FIXTURE.zones.ceo,
      status: 'pending_approval',
      createdBy: 'usr-rcp-desk',
      approvalRequestedBy: 'usr-rcp-desk',
      checkedInAt: '2026-08-17T10:00:00Z',
    });

    await notifyVisitEvent(pool, {
      visitId,
      eventType: 'pending_approval',
      actorUserId: 'usr-rcp-desk',
      extra: { approval_url: 'https://app.example/visit/host-approval/onsite-token' },
      notifyVisitor: false,
      orgSettings: DEFAULT_NOTIFICATIONS,
    });

    const rows = await listDeliveries(visitId);
    assert.equal(rows.some((r) => r.notification_type === 'visit.reception_new_expected'), false);
    assert.equal(rows.some((r) => r.notification_type === 'visit.pending_approval'), true);
  });
});
