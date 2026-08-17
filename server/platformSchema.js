import crypto from 'crypto';
import pool from './db.js';
import { generateId } from './visitorSchema.js';
import { resolveAppName } from './services/adminSettingsService.js';

export function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

export async function ensurePlatformSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      plan_name VARCHAR(60) DEFAULT 'standard',
      status VARCHAR(30) DEFAULT 'active',
      max_sites INT DEFAULT 10,
      max_users INT DEFAULT 100,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_sub_org (organisation_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      template_key VARCHAR(60) NOT NULL,
      channel VARCHAR(20) DEFAULT 'in_app',
      subject VARCHAR(255),
      body_template TEXT,
      enabled TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_template (organisation_id, template_key, channel)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(90) PRIMARY KEY,
      organisation_id VARCHAR(90) NOT NULL,
      user_id VARCHAR(90),
      channel VARCHAR(20) DEFAULT 'in_app',
      notification_type VARCHAR(60) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      status VARCHAR(30) DEFAULT 'delivered',
      read_at DATETIME,
      metadata JSON,
      idempotency_key VARCHAR(120),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_notification_idempotency (idempotency_key),
      INDEX idx_notifications_user (user_id),
      INDEX idx_notifications_org (organisation_id),
      INDEX idx_notifications_read (read_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id VARCHAR(90) PRIMARY KEY,
      notification_id VARCHAR(90) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      status VARCHAR(30) DEFAULT 'pending',
      recipient VARCHAR(255),
      error_message TEXT,
      provider_message_id VARCHAR(120),
      attempt_count INT DEFAULT 0,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,
      INDEX idx_deliveries_notification (notification_id),
      INDEX idx_deliveries_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      id VARCHAR(90) PRIMARY KEY,
      user_id VARCHAR(90) NOT NULL,
      organisation_id VARCHAR(90) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      category_key VARCHAR(60) NOT NULL,
      enabled TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_notif_pref (user_id, organisation_id, channel, category_key),
      INDEX idx_user_notif_pref_user (user_id),
      INDEX idx_user_notif_pref_org (organisation_id)
    )
  `);

  const deliveryColumns = [
    { name: 'recipient', ddl: 'ADD COLUMN recipient VARCHAR(255)' },
    { name: 'provider_message_id', ddl: 'ADD COLUMN provider_message_id VARCHAR(120)' },
    { name: 'attempt_count', ddl: 'ADD COLUMN attempt_count INT DEFAULT 0' },
    { name: 'delivered_at', ddl: 'ADD COLUMN delivered_at DATETIME' },
  ];
  for (const col of deliveryColumns) {
    const [[exists]] = await pool.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_deliveries' AND COLUMN_NAME = ?`,
      [col.name],
    );
    if (!Number(exists?.count)) {
      await pool.query(`ALTER TABLE notification_deliveries ${col.ddl}`);
    }
  }

  const [[col]] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visits' AND COLUMN_NAME = 'invite_token'`,
  );
  if (!Number(col?.count)) {
    await pool.query(`ALTER TABLE visits ADD COLUMN invite_token VARCHAR(64) NULL`);
    await pool.query(`CREATE UNIQUE INDEX idx_visits_invite_token ON visits (invite_token)`);
  }

  const [[privacyCol]] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visits' AND COLUMN_NAME = 'privacy_ack_at'`,
  );
  if (!Number(privacyCol?.count)) {
    await pool.query(`ALTER TABLE visits ADD COLUMN privacy_ack_at DATETIME NULL`);
  }
}

/** System template keys refreshed on boot even if already present. */
const REFRESH_TEMPLATE_KEYS = new Set([
  'visit.pre_arrival_alert',
  'visit.entered_premises',
  'visit.in_meeting',
  'visit.visitor_cancelled',
  'visit.visitor_rescheduled',
  'visit.visitor_checked_in',
  'visit.visitor_checked_out',
  'visit.visitor_reminder',
  'visit.host_approved',
  'visit.host_rejected',
  'visit.pending_approval',
  'visit.reception_host_approved',
  'visit.reception_host_rejected',
  'visit.reception_new_expected',
  'visit.reception_new_expected_restricted',
  'visit.arrived_at_gate_restricted',
  'visit.entered_premises_restricted',
  'visit.pre_arrival_alert_restricted',
]);

const DEFAULT_TEMPLATES = [
  {
    key: 'visit.pending_approval',
    subject: 'Approval required',
    inApp: 'Visitor {{visitor_name}} is awaiting your approval.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} {{approval_context}}.\n\nApprove or reject (no login required):\n{{approval_url}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} needs your approval. {{approval_url}}`,
  },
  {
    key: 'visit.approved',
    subject: 'Visit approved',
    inApp: 'Your visit for {{visitor_name}} has been approved.',
    email: `Hello {{visitor_name}},\n\nYour visit has been approved.\n\nPass code: {{pass_code}}\nConfirm details: {{invite_url}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit approved. Pass code {{pass_code}}. {{invite_url}}`,
  },
  {
    key: 'visit.host_approved',
    subject: 'Visit approved',
    inApp: 'Visit for {{visitor_name}} was approved.',
    email: `Hello {{host_name}},\n\nThe visit for {{visitor_name}} has been approved.\n\nPass code: {{pass_code}}\nExpected: {{expected_at}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit approved for {{visitor_name}}. Code {{pass_code}}.`,
  },
  {
    key: 'visit.host_booking',
    subject: 'Visit confirmed',
    inApp: 'Host booking confirmed for {{visitor_name}}.',
    email: `Hello {{visitor_name}},\n\nYour visit with {{host_name}} is confirmed.\n\nPass code: {{pass_code}}\nExpected: {{expected_at}}\nDetails: {{invite_url}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit confirmed. Pass code {{pass_code}}. Expected {{expected_at}}. {{invite_url}}`,
  },
  {
    key: 'visit.pre_arrival_alert',
    subject: 'Expected arrival in 1 hour',
    inApp: '{{visitor_name}} is expected in about 1 hour (host: {{host_name}}). Pass code {{pass_code}}.',
    email: `Expected arrival in about 1 hour\n\nVisitor: {{visitor_name}}\nHost: {{host_name}}\nSite: {{site_name}}\nExpected: {{expected_at}}\nPass code: {{pass_code}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: Expected in ~1h — {{visitor_name}} ({{host_name}}). Code {{pass_code}}.`,
  },
  {
    key: 'visit.visitor_reminder',
    subject: 'Visit reminder',
    inApp: 'Reminder: your visit is expected soon.',
    email: `Hello {{visitor_name}},\n\nReminder: your visit with {{host_name}} is expected at {{expected_at}}.\n\nPass code: {{pass_code}}\nDetails: {{invite_url}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: Reminder — visit at {{expected_at}}. Code {{pass_code}}. {{invite_url}}`,
  },
  {
    key: 'visit.rejected',
    subject: 'Visit rejected',
    inApp: 'The visit for {{visitor_name}} was rejected.',
    email: `Hello {{visitor_name}},\n\nUnfortunately your visit request was not approved.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Your visit request was not approved.`,
  },
  {
    key: 'visit.host_rejected',
    subject: 'Visit rejected',
    inApp: 'The visit for {{visitor_name}} was rejected.',
    email: `Hello {{host_name}},\n\nThe visit for {{visitor_name}} was not approved.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit for {{visitor_name}} was rejected.`,
  },
  {
    key: 'visit.reception_host_approved',
    subject: 'Host approved visitor',
    inApp: '{{host_name}} approved {{visitor_name}}.',
    email: `Hello,\n\n{{host_name}} approved {{visitor_name}} ({{company}}).\n\nExpected: {{expected_at}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{host_name}} approved {{visitor_name}}.`,
  },
  {
    key: 'visit.reception_host_rejected',
    subject: 'Host rejected visitor',
    inApp: '{{host_name}} rejected {{visitor_name}}.',
    email: `Hello,\n\n{{host_name}} rejected {{visitor_name}}.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{host_name}} rejected {{visitor_name}}.`,
  },
  {
    key: 'visit.checked_in',
    subject: 'Visitor arrived',
    inApp: '{{visitor_name}} has checked in at reception.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} has checked in.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} has checked in.`,
  },
  {
    key: 'visit.visitor_checked_in',
    subject: 'You are checked in',
    inApp: 'You have checked in.',
    email: `Hello {{visitor_name}},\n\nYou have checked in at reception. Your host {{host_name}} has been notified.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Checked in. Host {{host_name}} notified.`,
  },
  {
    key: 'visit.waiting_at_reception',
    subject: 'Visitor waiting',
    inApp: '{{visitor_name}} is waiting for you at reception.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} is waiting for you at reception.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} is waiting at reception.`,
  },
  {
    key: 'visit.in_meeting',
    subject: 'Meeting started',
    inApp: 'Meeting with {{visitor_name}} has started.',
    email: `Hello {{host_name}},\n\nYour meeting with {{visitor_name}} has started.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Meeting with {{visitor_name}} started.`,
  },
  {
    key: 'visit.checked_out',
    subject: 'Visitor departed',
    inApp: '{{visitor_name}} has checked out.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} has checked out.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} has checked out.`,
  },
  {
    key: 'visit.visitor_checked_out',
    subject: 'Visit complete',
    inApp: 'Your visit is complete.',
    email: `Hello {{visitor_name}},\n\nThank you for visiting. Your check-out is complete.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit complete. Thank you.`,
  },
  {
    key: 'visit.invite_sent',
    subject: 'Visitor invitation',
    inApp: 'An invitation was sent to {{visitor_name}}.',
    email: `Hello {{visitor_name}},\n\nYou are invited to visit. Please confirm your details:\n{{invite_url}}\n\nYour pass code: {{pass_code}}\n\n— {{app_name}}`,
    sms: `{{app_name}} invite: confirm at {{invite_url}} Pass code {{pass_code}}`,
  },
  {
    key: 'visit.arrived_at_gate',
    subject: 'Visitor at gate',
    inApp: '{{visitor_name}} has arrived at the gate.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} has arrived at the gate.\n\nPass code: {{pass_code}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} at gate. Code {{pass_code}}`,
  },
  {
    key: 'visit.entered_premises',
    subject: 'Visitor on premises',
    inApp: '{{visitor_name}} has entered the premises.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} has entered the premises.\n\nPass code: {{pass_code}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} entered premises. Code {{pass_code}}`,
  },
  {
    key: 'visit.vip_arrival',
    subject: 'VIP visitor arrival',
    inApp: 'VIP/VVIP visitor {{visitor_name}} has arrived.',
    email: `VIP/VVIP visitor {{visitor_name}} has arrived.\n\nHost: {{host_name}}\nPass code: {{pass_code}}\n\n— {{app_name}}`,
    sms: `{{app_name}} VIP arrival: {{visitor_name}}`,
  },
  {
    key: 'visit.cancelled',
    subject: 'Visit cancelled',
    inApp: 'The visit for {{visitor_name}} was cancelled.',
    email: `Hello {{host_name}},\n\nThe visit for {{visitor_name}} has been cancelled.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit for {{visitor_name}} cancelled.`,
  },
  {
    key: 'visit.visitor_cancelled',
    subject: 'Visit cancelled',
    inApp: 'Your visit was cancelled.',
    email: `Hello {{visitor_name}},\n\nYour visit with {{host_name}} has been cancelled.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Your visit has been cancelled.`,
  },
  {
    key: 'visit.rescheduled',
    subject: 'Visit rescheduled',
    inApp: 'The visit for {{visitor_name}} was rescheduled to {{expected_at}}.',
    email: `Hello {{host_name}},\n\nThe visit for {{visitor_name}} was rescheduled to {{expected_at}}.\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit rescheduled for {{visitor_name}} to {{expected_at}}.`,
  },
  {
    key: 'visit.visitor_rescheduled',
    subject: 'Visit rescheduled',
    inApp: 'Your visit was rescheduled.',
    email: `Hello {{visitor_name}},\n\nYour visit with {{host_name}} was rescheduled to {{expected_at}}.\n\nPass code: {{pass_code}}\nDetails: {{invite_url}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: Visit rescheduled to {{expected_at}}. Code {{pass_code}}.`,
  },
  // Zone-based access control (Logic.md) — same-zone reception gets the full
  // picture; different-zone reception gets name + time only, nothing else.
  {
    key: 'visit.reception_new_expected',
    subject: 'New expected visitor',
    inApp: '{{visitor_name}} is expected for {{host_name}} at {{expected_at}}.',
    email: `Hello,\n\n{{visitor_name}} ({{company}}) is expected for {{host_name}} at {{expected_at}}.\n\nPass code: {{pass_code}}\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} expected for {{host_name}} at {{expected_at}}. Code {{pass_code}}.`,
  },
  {
    key: 'visit.reception_new_expected_restricted',
    subject: 'New expected visitor',
    inApp: '{{visitor_name}} — expected {{expected_at}}.',
    email: `A visitor is expected in another zone.\n\n{{visitor_name}} — expected {{expected_at}}.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} expected {{expected_at}}.`,
  },
  {
    key: 'visit.arrived_at_gate_restricted',
    subject: 'Visitor at gate',
    inApp: '{{visitor_name}} — expected {{expected_at}}.',
    email: `A visitor has arrived at the gate in another zone.\n\n{{visitor_name}} — expected {{expected_at}}.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} expected {{expected_at}}.`,
  },
  {
    key: 'visit.entered_premises_restricted',
    subject: 'Visitor on premises',
    inApp: '{{visitor_name}} — expected {{expected_at}}.',
    email: `A visitor has entered the premises in another zone.\n\n{{visitor_name}} — expected {{expected_at}}.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} expected {{expected_at}}.`,
  },
  {
    key: 'visit.pre_arrival_alert_restricted',
    subject: 'Expected arrival in 1 hour',
    inApp: '{{visitor_name}} — expected {{expected_at}}.',
    email: `A visitor is expected soon in another zone.\n\n{{visitor_name}} — expected {{expected_at}}.\n\n— {{app_name}}`,
    sms: `{{app_name}}: {{visitor_name}} expected {{expected_at}}.`,
  },
];

async function seedTemplatesForOrg(organisationId) {
  for (const tpl of DEFAULT_TEMPLATES) {
    for (const [channel, body] of [
      ['in_app', tpl.inApp],
      ['email', tpl.email],
      ['sms', tpl.sms],
    ]) {
      const [[existing]] = await pool.query(
        `SELECT id FROM notification_templates
         WHERE organisation_id = ? AND template_key = ? AND channel = ? LIMIT 1`,
        [organisationId, tpl.key, channel],
      );
      if (existing) {
        if (REFRESH_TEMPLATE_KEYS.has(tpl.key)) {
          await pool.query(
            `UPDATE notification_templates
             SET subject = ?, body_template = ?
             WHERE id = ?`,
            [tpl.subject, body, existing.id],
          );
        }
        continue;
      }

      await pool.query(
        `INSERT INTO notification_templates (id, organisation_id, template_key, channel, subject, body_template, enabled)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [generateId('ntpl'), organisationId, tpl.key, channel, tpl.subject, body],
      );
    }
  }
}

/**
 * Rows seeded before templates switched to the {{app_name}} variable have the
 * product name of that era baked into their bodies ("VM360", later "Visitors
 * Log System"). Swap those literals for {{app_name}} so every send renders
 * the Application name currently set in System Settings. Idempotent; leaves
 * admin-customised wording otherwise untouched.
 */
async function migrateLegacyTemplateBranding() {
  await pool.query(
    `UPDATE notification_templates
     SET body_template = REPLACE(REPLACE(REPLACE(body_template,
       'Visitors Log System', '{{app_name}}'),
       'Visitors Log', '{{app_name}}'),
       'VM360', '{{app_name}}')
     WHERE body_template LIKE '%VM360%'
        OR body_template LIKE '%Visitors Log%'`,
  );

  // Notification bodies are rendered at creation time, so rows still awaiting
  // external delivery carry whatever brand the template had back then — and the
  // retry worker will happily send them. Rewrite the not-yet-delivered ones to
  // the current Application name; delivered history is left untouched.
  const appName = await resolveAppName();
  await pool.query(
    `UPDATE notifications
     SET title = REPLACE(REPLACE(REPLACE(title, 'Visitors Log System', ?), 'Visitors Log', ?), 'VM360', ?),
         body = REPLACE(REPLACE(REPLACE(body, 'Visitors Log System', ?), 'Visitors Log', ?), 'VM360', ?)
     WHERE status IN ('pending', 'failed')
       AND (body LIKE '%VM360%' OR body LIKE '%Visitors Log%'
         OR title LIKE '%VM360%' OR title LIKE '%Visitors Log%')`,
    [appName, appName, appName, appName, appName, appName],
  );
}

export async function seedPlatformData() {
  const [orgs] = await pool.query('SELECT id FROM organisations');
  if (!orgs.length) return;

  await migrateLegacyTemplateBranding();

  for (const org of orgs) {
    const [[existingSub]] = await pool.query(
      'SELECT id FROM subscriptions WHERE organisation_id = ? LIMIT 1',
      [org.id],
    );
    if (!existingSub) {
      await pool.query(
        `INSERT INTO subscriptions (id, organisation_id, plan_name, status, max_sites, max_users)
         VALUES (?, ?, 'professional', 'active', 5, 50)`,
        [generateId('sub'), org.id],
      );
    }

    await seedTemplatesForOrg(org.id);
  }

  console.log(`[platform] Subscriptions and notification templates seeded for ${orgs.length} organisation(s).`);
}
