/**
 * Provider-bound notification payload verification.
 *
 * Asserts the FINAL object handed to the email adapter, the SMS adapter and
 * the in-app notification repository — after template rendering, not before.
 * Nothing is actually sent: the adapters are stubbed at the module boundary
 * and every send is captured.
 */
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

import { createTestPool, seedFixture, FIXTURE } from './helpers/pgMemHarness.js';
import {
  sendFromTemplate,
  retryFailedDeliveries,
  buildRestrictedReceptionVars,
  buildRestrictedReceptionMetadata,
} from '../server/notificationService.js';
import appPool from '../server/db.js';

after(async () => {
  try { await appPool.end(); } catch { /* never opened */ }
});

let pool;
const sent = { email: [], sms: [] };

/**
 * Parse the console provider's output back into the {to, subject, body}
 * payload it was given. Both adapters delimit each message with a banner.
 */
function installTransportCapture() {
  const realLog = console.log;
  let channel = null;
  let lines = [];

  console.log = (...args) => {
    const line = args.map(String).join(' ');
    if (line.startsWith('[email:console]') || line.startsWith('[sms:console]')) {
      const kind = line.startsWith('[email:') ? 'email' : 'sms';
      if (channel === kind) {
        // Closing banner — assemble the captured message.
        const to = (lines.find((l) => l.startsWith('To: ')) || '').slice(4);
        const subjectLine = lines.find((l) => l.startsWith('Subject: '));
        const bodyLines = lines.filter((l) => l !== `To: ${to}` && l !== subjectLine);
        sent[kind].push({
          to,
          subject: subjectLine ? subjectLine.slice('Subject: '.length) : undefined,
          body: bodyLines.join('\n'),
        });
        channel = null;
        lines = [];
      } else {
        channel = kind;
        lines = [];
      }
      return;
    }
    if (channel) lines.push(line);
    else realLog(...args);
  };
}

/** The full var bag a same-zone recipient would get. */
const FULL_VARS = {
  visitor_name: 'Jane Doe',
  expected_at: '20 Aug 2026, 09:00',
  host_name: 'Huang Yaochi',
  company: 'Acme Holdings',
  pass_code: 'PASS42',
  site_name: 'HQ-Main Office',
  invite_url: 'https://app.example/visit/invite/secret-token',
  status: 'arrived_at_gate',
};

async function seedTemplate(key, { subject, inApp, email, sms }) {
  for (const [channel, body] of [['in_app', inApp], ['email', email], ['sms', sms]]) {
    await pool.query(
      `INSERT INTO notification_templates (id, organisation_id, template_key, channel, subject, body_template, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [`tpl-${key}-${channel}`, FIXTURE.orgId, key, channel, subject, body],
    );
  }
}

before(async () => {
  pool = await createTestPool();
  await seedFixture(pool);

  // Capture at the real transport boundary. With no SMTP/SendGrid/Twilio
  // credentials configured, both adapters route to their console provider,
  // which prints exactly the {to, subject, body} handed to a real provider —
  // so this observes the genuine provider-bound payload, not a stub of it.
  installTransportCapture();

  await seedTemplate('visit.reception_new_expected', {
    subject: 'New expected visitor',
    inApp: '{{visitor_name}} is expected for {{host_name}} at {{expected_at}}.',
    email: 'Hello,\n\n{{visitor_name}} ({{company}}) is expected for {{host_name}} at {{expected_at}}.\n\nPass code: {{pass_code}}',
    sms: 'WGVL: {{visitor_name}} expected for {{host_name}} at {{expected_at}}. Code {{pass_code}}.',
  });
  await seedTemplate('visit.reception_new_expected_restricted', {
    subject: 'New expected visitor',
    inApp: '{{visitor_name}} — expected {{expected_at}}.',
    email: 'A visitor is expected in another zone.\n\n{{visitor_name}} — expected {{expected_at}}.',
    sms: 'WGVL: {{visitor_name}} expected {{expected_at}}.',
  });
});

const FORBIDDEN_IN_RESTRICTED = [
  'Acme', 'Acme Holdings',          // company
  'Huang', 'Huang Yaochi',          // host
  'PASS42',                          // pass code
  'secret-token', 'invite',          // secure link
  'HQ-Main Office',                  // site
  'arrived_at_gate',                 // lifecycle status
  '+260', '@',                       // phone / email
];

describe('PROVIDER PAYLOADS: different-zone recipient (restricted)', () => {
  let results;
  before(async () => {
    sent.email.length = 0;
    sent.sms.length = 0;
    results = await sendFromTemplate(pool, {
      organisationId: FIXTURE.orgId,
      userId: 'usr-rcp-dceo',
      recipient: { email: 'dceo.desk@example.com', phone: '+260970000001' },
      templateKey: 'visit.reception_new_expected_restricted',
      vars: buildRestrictedReceptionVars(FULL_VARS),
      idempotencyKey: 'pending_approval:visit-1:reception_diff:rcp-dceo',
      metadata: buildRestrictedReceptionMetadata('visit-1'),
      channels: ['in_app', 'email', 'sms'],
      categoryKey: 'visit_registered',
      orgSettings: { in_app_notifications: true },
      skipPreferenceCheck: true,
    });
    assert.ok(results.length >= 3, 'expected all three channels to be attempted');
  });

  it('EMAIL body contains only visitor name and expected time', () => {
    const [email] = sent.email;
    assert.ok(email, 'no email captured');
    assert.match(email.body, /Jane Doe/);
    assert.match(email.body, /20 Aug 2026, 09:00/);
    for (const needle of FORBIDDEN_IN_RESTRICTED) {
      assert.equal(email.body.includes(needle), false, `email leaked "${needle}"`);
    }
  });

  it('SMS body contains only visitor name and expected time', () => {
    const [sms] = sent.sms;
    assert.ok(sms, 'no sms captured');
    assert.match(sms.body, /Jane Doe/);
    for (const needle of FORBIDDEN_IN_RESTRICTED) {
      assert.equal(sms.body.includes(needle), false, `sms leaked "${needle}"`);
    }
  });

  it('IN-APP row stored in the repository contains no forbidden data in title, body or metadata', async () => {
    const [rows] = await pool.query(
      `SELECT title, body, metadata FROM notifications WHERE channel = 'in_app' AND notification_type = ?`,
      ['visit.reception_new_expected_restricted'],
    );
    assert.equal(rows.length, 1);
    const blob = `${rows[0].title} ${rows[0].body} ${rows[0].metadata}`;
    assert.match(blob, /Jane Doe/);
    for (const needle of FORBIDDEN_IN_RESTRICTED) {
      assert.equal(blob.includes(needle), false, `stored in-app row leaked "${needle}"`);
    }
    // Metadata must be the fresh allowlist, not the shared bag.
    const meta = JSON.parse(rows[0].metadata);
    assert.deepEqual(Object.keys(meta).sort(), ['audience', 'visitId']);
    assert.equal(meta.eventType, undefined);
  });

  it('unresolved placeholders are rendered empty, never left as {{token}}', () => {
    for (const payload of [...sent.email, ...sent.sms]) {
      assert.doesNotMatch(payload.body, /\{\{\w+\}\}/, 'template placeholder leaked verbatim');
    }
  });
});

describe('PROVIDER PAYLOADS: same-zone recipient (full)', () => {
  before(async () => {
    sent.email.length = 0;
    sent.sms.length = 0;
    await sendFromTemplate(pool, {
      organisationId: FIXTURE.orgId,
      userId: 'usr-rcp-ceo',
      recipient: { email: 'ceo.desk@example.com', phone: '+260970000002' },
      templateKey: 'visit.reception_new_expected',
      vars: FULL_VARS,
      idempotencyKey: 'pending_approval:visit-1:reception_same:rcp-ceo',
      metadata: { visitId: 'visit-1', eventType: 'pending_approval', audience: 'reception_same_zone' },
      channels: ['in_app', 'email', 'sms'],
      categoryKey: 'visit_registered',
      orgSettings: { in_app_notifications: true },
      skipPreferenceCheck: true,
    });
  });

  it('receives the operational detail it is entitled to', () => {
    const [email] = sent.email;
    assert.match(email.body, /Jane Doe/);
    assert.match(email.body, /Acme Holdings/);
    assert.match(email.body, /Huang Yaochi/);
  });

  it('still never carries raw ID numbers, addresses or private notes', () => {
    for (const payload of [...sent.email, ...sent.sms]) {
      assert.doesNotMatch(payload.body, /\d{5,6}\/\d{2}\/\d/, 'raw NRC in provider payload');
      assert.equal(payload.body.includes('HOST PRIVATE'), false, 'private note in provider payload');
      assert.equal(payload.body.toLowerCase().includes('confidential'), false, 'confidential note in provider payload');
    }
  });
});

describe('PROVIDER PAYLOADS: idempotency and retry', () => {
  it('re-sending the same idempotency key creates no duplicate row', async () => {
    const [before] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE idempotency_key LIKE ?`,
      ['pending_approval:visit-1:reception_diff:rcp-dceo%'],
    );
    await sendFromTemplate(pool, {
      organisationId: FIXTURE.orgId,
      userId: 'usr-rcp-dceo',
      recipient: { email: 'dceo.desk@example.com', phone: '+260970000001' },
      templateKey: 'visit.reception_new_expected_restricted',
      vars: buildRestrictedReceptionVars(FULL_VARS),
      idempotencyKey: 'pending_approval:visit-1:reception_diff:rcp-dceo',
      metadata: buildRestrictedReceptionMetadata('visit-1'),
      channels: ['in_app', 'email', 'sms'],
      categoryKey: 'visit_registered',
      orgSettings: { in_app_notifications: true },
      skipPreferenceCheck: true,
    });
    const [after] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE idempotency_key LIKE ?`,
      ['pending_approval:visit-1:reception_diff:rcp-dceo%'],
    );
    assert.equal(Number(after[0].count), Number(before[0].count), 'duplicate notification created on re-send');
  });

  it('a retry re-sends the STORED restricted text, never a re-rendered full payload', async () => {
    // Mark the restricted email delivery failed, then retry it.
    await pool.query(
      `UPDATE notification_deliveries SET status = 'failed', attempt_count = 1
       WHERE channel = 'email' AND notification_id IN (
         SELECT id FROM notifications WHERE notification_type = ?
       )`,
      ['visit.reception_new_expected_restricted'],
    );
    sent.email.length = 0;

    const result = await retryFailedDeliveries(pool, { limit: 10 });
    assert.ok(result.retried >= 1, 'expected at least one retry');

    for (const payload of sent.email) {
      assert.match(payload.body, /Jane Doe/);
      for (const needle of FORBIDDEN_IN_RESTRICTED) {
        assert.equal(payload.body.includes(needle), false, `retry leaked "${needle}"`);
      }
    }
  });

  it('retry reuses the existing notification rows instead of creating new ones', async () => {
    // sendFromTemplate writes one notification row per channel (in_app, email,
    // sms). After the earlier re-send AND the retry, that must still be three:
    // idempotency prevents the re-send from duplicating, and retryFailedDeliveries
    // only re-attempts the existing delivery rows.
    const [rows] = await pool.query(
      `SELECT channel, COUNT(*) AS count FROM notifications
       WHERE notification_type = ? GROUP BY channel`,
      ['visit.reception_new_expected_restricted'],
    );
    const byChannel = Object.fromEntries(rows.map((r) => [r.channel, Number(r.count)]));
    assert.deepEqual(byChannel, { in_app: 1, email: 1, sms: 1 },
      'exactly one row per channel — no duplicates from re-send or retry');
  });
});
