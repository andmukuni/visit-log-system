import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail, resolveEmailDeliveryConfig } from '../server/adapters/emailAdapter.js';
import { sendSms } from '../server/adapters/smsAdapter.js';
import { getEmailConfig, getSmsConfig } from '../server/adapters/deliveryConfig.js';
import pool from '../server/db.js';

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore if pool was never opened
  }
});

describe('email adapter', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'console';
    process.env.EMAIL_FROM = 'test@visitors.local';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('uses console provider by default', async () => {
    const config = getEmailConfig();
    assert.equal(config.provider, 'console');
    assert.equal(config.configured, true);

    const result = await sendEmail({
      to: 'visitor@example.com',
      subject: 'Test',
      body: 'Hello world',
    }, {
      effectiveSmtp: { enabled: false, host: '', source: 'none' },
    });
    assert.equal(result.provider, 'console');
    assert.ok(result.messageId);
  });

  it('reports sendgrid as unconfigured without API key', () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    delete process.env.SENDGRID_API_KEY;
    const config = getEmailConfig();
    assert.equal(config.provider, 'sendgrid');
    assert.equal(config.configured, false);
  });

  it('prefers effective admin SMTP when configured', async () => {
    const config = await resolveEmailDeliveryConfig({
      effectiveSmtp: {
        enabled: true,
        host: 'smtp.admin.example',
        port: 587,
        secure: false,
        user: 'mailer',
        pass: 'secret',
        from: 'alerts@admin.example',
        from_name: 'Visitors Log',
        source: 'database',
      },
    });
    assert.equal(config.provider, 'smtp');
    assert.equal(config.configured, true);
    assert.equal(config.source, 'database');
    assert.equal(config.smtp.host, 'smtp.admin.example');
    assert.equal(config.from, 'alerts@admin.example');
  });
});

describe('sms adapter', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.SMS_PROVIDER = 'console';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('uses console provider by default', async () => {
    const config = getSmsConfig();
    assert.equal(config.provider, 'console');
    assert.equal(config.configured, true);

    const result = await sendSms({
      to: '+260971000001',
      body: 'Visitors Log test message',
    });
    assert.equal(result.provider, 'console');
    assert.ok(result.messageId);
  });

  it('reports twilio as unconfigured without credentials', () => {
    process.env.SMS_PROVIDER = 'twilio';
    delete process.env.TWILIO_ACCOUNT_SID;
    const config = getSmsConfig();
    assert.equal(config.provider, 'twilio');
    assert.equal(config.configured, false);
  });
});
