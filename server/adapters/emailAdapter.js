import { getEmailConfig } from './deliveryConfig.js';

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

async function sendViaSmtp({ to, subject, body }, config) {
  if (!config.smtp.host) {
    throw new Error('SMTP host is not configured (SMTP_HOST)');
  }

  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('SMTP provider requires the nodemailer package. Run: npm install nodemailer');
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  });

  const info = await transporter.sendMail({
    from: `"${config.fromName}" <${config.from}>`,
    to,
    subject,
    text: body,
  });

  return { provider: 'smtp', messageId: info.messageId || `smtp-${Date.now()}` };
}

/**
 * Send an email via the configured provider.
 */
export async function sendEmail({ to, subject, body }) {
  if (!to) throw new Error('Email recipient is required');
  const config = getEmailConfig();

  switch (config.provider) {
    case 'sendgrid':
      return sendViaSendGrid({ to, subject, body }, config);
    case 'smtp':
      return sendViaSmtp({ to, subject, body }, config);
    case 'console':
    default:
      return sendViaConsole({ to, subject, body });
  }
}

export function getEmailProviderStatus() {
  const config = getEmailConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    from: config.from,
  };
}
