import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from '../server/adapters/emailAdapter.js';
import { sendSms } from '../server/adapters/smsAdapter.js';
import { getEmailConfig, getSmsConfig } from '../server/adapters/deliveryConfig.js';

describe('email adapter', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'console';
    process.env.EMAIL_FROM = 'test@vm360.local';
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
      body: 'VM360 test message',
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
