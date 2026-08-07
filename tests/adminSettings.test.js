import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_SECURITY,
  DEFAULT_GENERAL,
  VISITOR_NOTIFICATION_KEYS,
  isSmtpConfigured,
  isSmsConfigured,
} from '../server/services/adminSettingsService.js';

describe('admin settings defaults', () => {
  it('includes all visitor notification keys', () => {
    for (const key of VISITOR_NOTIFICATION_KEYS) {
      assert.equal(DEFAULT_NOTIFICATIONS[`email_${key}`], true, `email_${key}`);
      assert.ok(`sms_${key}` in DEFAULT_NOTIFICATIONS, `sms_${key}`);
    }
    assert.equal(DEFAULT_NOTIFICATIONS.in_app_notifications, true);
  });

  it('has sensible security defaults', () => {
    assert.equal(DEFAULT_SECURITY.min_password_length, 8);
    assert.equal(DEFAULT_SECURITY.session_timeout_minutes, 480);
    assert.equal(DEFAULT_SECURITY.mfa_enabled, true);
  });

  it('has VM360 general defaults', () => {
    assert.match(DEFAULT_GENERAL.app_name, /VM360/i);
  });

  it('detects SMTP configuration state', () => {
    assert.equal(isSmtpConfigured({ enabled: true, host: 'smtp.example.com', user: '', pass: '' }), true);
    assert.equal(isSmtpConfigured({ enabled: true, host: 'smtp.example.com', user: 'u', pass: '' }), false);
    assert.equal(isSmtpConfigured({ enabled: false, host: 'smtp.example.com' }), false);
  });

  it('detects SMS configuration state', () => {
    assert.equal(isSmsConfigured({ enabled: true, provider: 'console', source: 'database' }), true);
    assert.equal(isSmsConfigured({
      enabled: true,
      provider: 'twilio',
      twilio_account_sid: 'sid',
      twilio_auth_token: 'token',
      twilio_from: '+123',
      source: 'database',
    }), true);
    assert.equal(isSmsConfigured({
      enabled: true,
      provider: 'ontech',
      access_id: 'key',
      sender_id: 'VM360',
      source: 'database',
    }), true);
  });
});
