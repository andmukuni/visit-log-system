import {
  getEffectiveSmtpConfig,
  getEffectiveSmsConfig,
  getGeneralSettings,
  isSmtpConfigured,
  isSmsConfigured,
  resolveSmtpPass,
} from './adminSettingsService.js';

function formatSmtpError(error) {
  const code = error?.code || '';
  if (code === 'EAUTH') return 'SMTP authentication failed. Check username and password.';
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT') return 'Could not connect to SMTP server. Check host and port.';
  return error?.message || 'SMTP delivery failed.';
}

export async function sendTestEmail(to) {
  const recipient = String(to || '').trim();
  if (!recipient) {
    const err = new Error('Recipient email is required.');
    err.status = 400;
    throw err;
  }

  const smtp = await getEffectiveSmtpConfig();
  if (!isSmtpConfigured(smtp)) {
    const err = new Error('SMTP is not configured. Save SMTP settings or set SMTP_* environment variables.');
    err.status = 400;
    throw err;
  }

  const general = await getGeneralSettings();
  const appName = general.app_name || 'VM360 Visitor Management';
  const fromAddress = smtp.from || smtp.user || 'noreply@vm360.local';
  const fromName = smtp.from_name || appName;

  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    const err = new Error('SMTP test requires the nodemailer package. Run: npm install nodemailer');
    err.status = 500;
    throw err;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 587),
    secure: Boolean(smtp.secure),
    auth: smtp.user
      ? { user: smtp.user, pass: resolveSmtpPass(smtp) }
      : undefined,
  });

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: recipient,
      subject: `${appName} — SMTP test`,
      text: `This is a test email from ${appName}. SMTP delivery is working.`,
      html: `<p>This is a test email from <strong>${appName}</strong>.</p><p>SMTP delivery is working.</p>`,
    });
  } catch (error) {
    const err = new Error(formatSmtpError(error));
    err.status = 400;
    throw err;
  }

  return { message: `Test email sent to ${recipient}.` };
}

async function sendOntechTestSms(config, { phone, message }) {
  const baseUrl = String(config.base_url || 'https://bulksms.ontech.co.zm/smsservice').trim().replace(/\/$/, '');
  const url = new URL(`${baseUrl}/httpapi`);
  url.searchParams.set('api_key', String(config.access_id || '').trim());
  url.searchParams.set('phone', phone);
  url.searchParams.set('msg', message);
  url.searchParams.set('sender_id', String(config.sender_id || '').trim());

  const res = await fetch(url.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || body?.error || `Ontech SMS API returned HTTP ${res.status}.`);
  }
  const status = Number(body?.status);
  if (Number.isFinite(status) && status !== 100) {
    throw new Error(body?.message || `Ontech SMS failed (status ${status}).`);
  }
  return { provider: 'ontech', messageId: body?.message_id || `ontech-${Date.now()}` };
}

async function sendTwilioTestSms(config, { phone, message }) {
  const { twilio_account_sid: accountSid, twilio_auth_token: authToken, twilio_from: from } = config;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const payload = new URLSearchParams({ To: phone, From: from, Body: message });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Twilio error ${res.status}`);
  }
  return { provider: 'twilio', messageId: data.sid || `twilio-${Date.now()}` };
}

export async function testSmsConnection({ phone, message } = {}) {
  const config = await getEffectiveSmsConfig();
  if (!isSmsConfigured(config)) {
    const err = new Error('SMS is not configured. Save SMS settings or set provider environment variables.');
    err.status = 400;
    throw err;
  }

  const provider = String(config.provider || 'console').toLowerCase();
  const testPhone = String(phone || '').trim();
  const testMessage = String(message || '').trim() || 'VM360 SMS test — connection successful.';

  if (provider === 'console') {
    console.log('[sms:test:console] ─────────────────────────');
    console.log(`To: ${testPhone || '(no phone — console mode)'}`);
    console.log(testMessage);
    console.log('[sms:test:console] ─────────────────────────');
    return {
      message: testPhone
        ? `Console SMS logged for ${testPhone} (no external provider configured).`
        : 'Console SMS provider is active — message logged to server output.',
    };
  }

  if (!testPhone) {
    const err = new Error('Phone number is required for SMS test when using an external provider.');
    err.status = 400;
    throw err;
  }

  let result;
  if (provider === 'twilio') {
    result = await sendTwilioTestSms(config, { phone: testPhone, message: testMessage });
  } else if (provider === 'ontech') {
    result = await sendOntechTestSms(config, { phone: testPhone, message: testMessage });
  } else {
    const err = new Error(`Unsupported SMS provider: ${provider}`);
    err.status = 400;
    throw err;
  }

  return {
    message: `Test SMS sent via ${result.provider} to ${testPhone}.`,
    provider: result.provider,
    messageId: result.messageId,
  };
}
