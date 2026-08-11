import { getEmailConfig } from './deliveryConfig.js';
import {
  getEffectiveSmtpConfig,
  isSmtpConfigured,
  resolveSmtpPass,
} from '../services/adminSettingsService.js';

async function sendViaConsole({ to, subject, body }) {
  console.log('[email:console] ─────────────────────────');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(body);
  console.log('[email:console] ─────────────────────────');
  return { provider: 'console', messageId: `console-${Date.now()}` };
}

async function sendViaSendGrid({ to, subject, body }, config) {
  if (!config.sendgrid.apiKey) {
    throw new Error('SendGrid API key is not configured (SENDGRID_API_KEY)');
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.sendgrid.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.from, name: config.fromName },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`SendGrid error ${response.status}: ${detail || response.statusText}`);
  }

  const messageId = response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;
  return { provider: 'sendgrid', messageId };
}

async function sendViaSmtp({ to, subject, body }, smtpConfig) {
  if (!smtpConfig.host) {
    throw new Error('SMTP host is not configured (SMTP_HOST)');
  }

  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('SMTP provider requires the nodemailer package. Run: npm install nodemailer');
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: Number(smtpConfig.port || 587),
    secure: Boolean(smtpConfig.secure),
    auth: smtpConfig.user
      ? { user: smtpConfig.user, pass: smtpConfig.pass }
      : undefined,
  });

  const info = await transporter.sendMail({
    from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
    to,
    subject,
    text: body,
  });

  return { provider: 'smtp', messageId: info.messageId || `smtp-${Date.now()}` };
}

/**
 * Build runtime email delivery config:
 * - Prefer admin SMTP (getEffectiveSmtpConfig) when configured
 * - Else SendGrid when EMAIL_PROVIDER=sendgrid
 * - Else env SMTP / console
 *
 * @param {{ effectiveSmtp?: object }} [options] optional inject for tests
 */
export async function resolveEmailDeliveryConfig(options = {}) {
  const envConfig = getEmailConfig();
  const effectiveSmtp = options.effectiveSmtp !== undefined
    ? options.effectiveSmtp
    : await getEffectiveSmtpConfig();

  if (isSmtpConfigured(effectiveSmtp)) {
    return {
      provider: 'smtp',
      from: effectiveSmtp.from || envConfig.from,
      fromName: effectiveSmtp.from_name || envConfig.fromName,
      sendgrid: envConfig.sendgrid,
      smtp: {
        host: effectiveSmtp.host,
        port: Number(effectiveSmtp.port || 587),
        secure: Boolean(effectiveSmtp.secure),
        user: effectiveSmtp.user || '',
        pass: resolveSmtpPass(effectiveSmtp),
      },
      configured: true,
      source: effectiveSmtp.source || 'database',
    };
  }

  if (envConfig.provider === 'sendgrid' && envConfig.sendgrid.apiKey) {
    return { ...envConfig, configured: true, source: 'env' };
  }

  return { ...envConfig, source: envConfig.configured ? 'env' : 'none' };
}

/**
 * Send an email via effective SMTP (admin settings) with env fallback.
 */
export async function sendEmail({ to, subject, body }, options = {}) {
  if (!to) throw new Error('Email recipient is required');
  const config = await resolveEmailDeliveryConfig(options);

  switch (config.provider) {
    case 'sendgrid':
      return sendViaSendGrid({ to, subject, body }, config);
    case 'smtp':
      return sendViaSmtp({ to, subject, body }, {
        ...config.smtp,
        from: config.from,
        fromName: config.fromName,
      });
    case 'console':
    default:
      return sendViaConsole({ to, subject, body });
  }
}

export async function getEmailProviderStatus() {
  const config = await resolveEmailDeliveryConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    from: config.from,
    source: config.source,
  };
}
