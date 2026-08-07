import { EMAIL_FROM_NAME_DEFAULT } from '../../shared/branding.js';

function truthy(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

export function getAppBaseUrl() {
  return String(process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export function getEmailConfig() {
  const provider = String(process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  const from = process.env.EMAIL_FROM || 'noreply@visitors.local';
  const fromName = process.env.EMAIL_FROM_NAME || EMAIL_FROM_NAME_DEFAULT;

  const sendgrid = {
    apiKey: process.env.SENDGRID_API_KEY || '',
  };

  const smtp = {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: truthy(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  };

  const configured = provider === 'console'
    || (provider === 'sendgrid' && Boolean(sendgrid.apiKey))
    || (provider === 'smtp' && Boolean(smtp.host));

  return { provider, from, fromName, sendgrid, smtp, configured };
}

export function getSmsConfig() {
  const provider = String(process.env.SMS_PROVIDER || 'console').toLowerCase();
  const twilio = {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM_NUMBER || '',
  };

  const configured = provider === 'console'
    || (provider === 'twilio' && Boolean(twilio.accountSid && twilio.authToken && twilio.from));

  return { provider, twilio, configured };
}

export function getDeliveryConfig() {
  const email = getEmailConfig();
  const sms = getSmsConfig();
  return {
    email,
    sms,
    maxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 3),
    retryIntervalMs: Number(process.env.NOTIFICATION_RETRY_INTERVAL_MS || 60000),
  };
}
