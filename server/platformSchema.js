import crypto from 'crypto';
import pool from './db.js';
import { generateId } from './visitorSchema.js';
import { APP_NAME, SMS_SENDER_PREFIX } from '../shared/branding.js';

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

const DEFAULT_TEMPLATES = [
  {
    key: 'visit.pending_approval',
    subject: 'Approval required',
    inApp: 'Visitor {{visitor_name}} is awaiting your approval.',
    email: `Hello {{host_name}},\n\nVisitor {{visitor_name}} requires your approval before check-in.\n\nPass code: {{pass_code}}\n\n— ${APP_NAME}`,
    sms: `${SMS_SENDER_PREFIX}: {{visitor_name}} needs approval. Pass code {{pass_code}}.`,
  },
  {
    key: 'visit.approved',
    subject: 'Visit approved',
    inApp: 'Your visit for {{visitor_name}} has been approved.',
    email: `Hello {{visitor_name}},\n\nYour visit has been approved.\n\nPass code: {{pass_code}}\nConfirm details: {{invite_url}}\n\n— ${APP_NAME}`,
    sms: `${SMS_SENDER_PREFIX}: Visit approved. Pass code {{pass_code}}. {{invite_url}}`,
  },
  {
    key: 'visit.rejected',
    subject: 'Visit rejected',
    inApp: 'The visit for {{visitor_name}} was rejected.',
    email: `Hello {{visitor_name}},\n\nUnfortunately your visit request was not approved.\n\n— ${APP_NAME}`,
    sms: `${SMS_SENDER_PREFIX}: Your visit request was not approved.`,
  },
  {
    key: 'visit.checked_in',
    subject: 'Visitor arrived',
    inApp: '{{visitor_name}} has checked in at reception.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} has checked in.\n\n— ${APP_NAME}`,
    sms: `${SMS_SENDER_PREFIX}: {{visitor_name}} has checked in.`,
  },
  {
    key: 'visit.waiting_at_reception',
    subject: 'Visitor waiting',
    inApp: '{{visitor_name}} is waiting for you at reception.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} is waiting for you at reception.\n\n— ${APP_NAME}`,
    sms: `${SMS_SENDER_PREFIX}: {{visitor_name}} is waiting at reception.`,
  },
  {
    key: 'visit.checked_out',
    subject: 'Visitor departed',
    inApp: '{{visitor_name}} has checked out.',
    email: `Hello {{host_name}},\n\n{{visitor_name}} has checked out.\n\n— ${APP_NAME}`,
    sms: `${SMS_SENDER_PREFIX}: {{visitor_name}} has checked out.`,
  },
  {
    key: 'visit.invite_sent',
    subject: 'Visitor invitation',
    inApp: 'An invitation was sent to {{visitor_name}}.',
    email: `Hello {{visitor_name}},\n\nYou are invited to visit. Please confirm your details:\n{{invite_url}}\n\nYour pass code: {{pass_code}}\n\n— ${APP_NAME}`,
    sms: `${SMS_SENDER_PREFIX} invite: confirm at {{invite_url}} Pass code {{pass_code}}`,
  },
  {
    key: 'visit.arrived_at_gate',
    subject: 'Visitor at gate',
    inApp: '{{visitor_name}} has arrived at the gate.',
    email: '{{visitor_name}} has arrived at the gate.\n\nPass code: {{pass_code}}',
    sms: `${SMS_SENDER_PREFIX}: {{visitor_name}} at gate. Code {{pass_code}}`,
  },
  {
    key: 'visit.vip_arrival',
    subject: 'VIP visitor arrival',
    inApp: 'VIP/VVIP visitor {{visitor_name}} has arrived.',
    email: 'VIP/VVIP visitor {{visitor_name}} has arrived.\n\nHost: {{host_name}}',
    sms: `${SMS_SENDER_PREFIX} VIP arrival: {{visitor_name}}`,
  },
  {
    key: 'visit.cancelled',
    subject: 'Visit cancelled',
    inApp: 'The visit for {{visitor_name}} was cancelled.',
    email: 'The visit for {{visitor_name}} has been cancelled.',
    sms: `${SMS_SENDER_PREFIX}: Visit for {{visitor_name}} cancelled.`,
  },
  {
    key: 'visit.rescheduled',
    subject: 'Visit rescheduled',
    inApp: 'The visit for {{visitor_name}} was rescheduled.',
    email: 'The visit for {{visitor_name}} was rescheduled to {{expected_at}}.',
    sms: `${SMS_SENDER_PREFIX}: Visit rescheduled for {{visitor_name}}.`,
  },
];

export async function seedPlatformData() {
  const [[org]] = await pool.query('SELECT id FROM organisations LIMIT 1');
  if (!org?.id) return;

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

  for (const tpl of DEFAULT_TEMPLATES) {
    for (const [channel, body] of [
      ['in_app', tpl.inApp],
      ['email', tpl.email],
      ['sms', tpl.sms],
    ]) {
      const [[existing]] = await pool.query(
        `SELECT id FROM notification_templates
         WHERE organisation_id = ? AND template_key = ? AND channel = ? LIMIT 1`,
        [org.id, tpl.key, channel],
      );
      if (existing) continue;

      await pool.query(
        `INSERT INTO notification_templates (id, organisation_id, template_key, channel, subject, body_template, enabled)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [generateId('ntpl'), org.id, tpl.key, channel, tpl.subject, body],
      );
    }
  }

  console.log('[platform] Subscription and notification templates seeded.');
}
