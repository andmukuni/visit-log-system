import { getEmailConfig } from './deliveryConfig.js';
import {
  getEffectiveSmtpConfig,
  getGeneralSettings,
  isSmtpConfigured,
  resolveSmtpPass,
} from '../services/adminSettingsService.js';
import { EMAIL_FROM_NAME_DEFAULT } from '../../shared/branding.js';

/**
 * From-names carried over from earlier product brandings. A stored value equal
 * to one of these is treated as "never customised" so the Application name from
 * System Settings wins instead.
 */
const LEGACY_FROM_NAMES = new Set(['VM360', EMAIL_FROM_NAME_DEFAULT]);

/**
 * Sender display name: explicit (non-legacy) SMTP from-name, else the
 * Application name from System Settings, else the given fallback.
 * `options.generalSettings` can be injected for tests to avoid DB access.
 */
export async function resolveEmailFromName(configuredName, options = {}, fallback = EMAIL_FROM_NAME_DEFAULT) {
  const name = String(configuredName || '').trim();
  if (name && !LEGACY_FROM_NAMES.has(name)) return name;
  const general = options.generalSettings !== undefined
    ? options.generalSettings
    : await getGeneralSettings().catch(() => null);
  const appName = String(general?.app_name || '').trim();
  return appName || name || fallback;
}

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
      fromName: await resolveEmailFromName(effectiveSmtp.from_name, options, envConfig.fromName),
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

  const fromName = await resolveEmailFromName(envConfig.fromName, options, envConfig.fromName);

  if (envConfig.provider === 'sendgrid' && envConfig.sendgrid.apiKey) {
    return { ...envConfig, fromName, configured: true, source: 'env' };
  }

  return { ...envConfig, fromName, source: envConfig.configured ? 'env' : 'none' };
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
