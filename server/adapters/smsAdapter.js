import { getSmsConfig } from './deliveryConfig.js';

async function sendViaConsole({ to, body }) {
  console.log('[sms:console] ─────────────────────────');
  console.log(`To: ${to}`);
  console.log(body);
  console.log('[sms:console] ─────────────────────────');
  return { provider: 'console', messageId: `console-${Date.now()}` };
}

async function sendViaTwilio({ to, body }, config) {
  const { accountSid, authToken, from } = config.twilio;
  if (!accountSid || !authToken || !from) {
    throw new Error('Twilio is not fully configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const payload = new URLSearchParams({ To: to, From: from, Body: body });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Twilio error ${response.status}`);
  }

  return { provider: 'twilio', messageId: data.sid || `twilio-${Date.now()}` };
}

/**
 * Send an SMS via the configured provider.
 */
export async function sendSms({ to, body }) {
  if (!to) throw new Error('SMS recipient is required');
  const config = getSmsConfig();

  switch (config.provider) {
    case 'twilio':
      return sendViaTwilio({ to, body }, config);
    case 'console':
    default:
      return sendViaConsole({ to, body });
  }
}

export function getSmsProviderStatus() {
  const config = getSmsConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    from: config.twilio.from || null,
  };
}
