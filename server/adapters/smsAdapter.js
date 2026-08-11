import { getSmsConfig } from './deliveryConfig.js';
import { sendOntechSms } from './ontechSmsClient.js';
import { getEffectiveSmsConfig, isSmsConfigured } from '../services/adminSettingsService.js';

async function sendViaConsole({ to, body }) {
  console.log('[sms:console] ─────────────────────────');
  console.log(`To: ${to}`);
  console.log(body);
  console.log('[sms:console] ─────────────────────────');
  return { provider: 'console', messageId: `console-${Date.now()}` };
}

async function sendViaTwilio({ to, body }, config) {
  const accountSid = config.twilio_account_sid || config.twilio?.accountSid;
  const authToken = config.twilio_auth_token || config.twilio?.authToken;
  const from = config.twilio_from || config.twilio?.from;
  if (!accountSid || !authToken || !from) {
    throw new Error('Twilio is not fully configured (account SID, auth token, from number)');
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
 * Send an SMS via the configured provider (admin settings, then env fallback).
 */
export async function sendSms({ to, body }) {
  if (!to) throw new Error('SMS recipient is required');

  let config;
  try {
    config = await getEffectiveSmsConfig();
  } catch {
    config = { ...getSmsConfig(), source: 'env' };
  }

  if (!isSmsConfigured(config) && config.provider !== 'console') {
    // Fall back to env-only console/twilio shape for unit tests without DB.
    const envConfig = getSmsConfig();
    if (envConfig.provider === 'console' || envConfig.configured) {
      config = {
        enabled: true,
        provider: envConfig.provider,
        twilio_account_sid: envConfig.twilio.accountSid,
        twilio_auth_token: envConfig.twilio.authToken,
        twilio_from: envConfig.twilio.from,
        email: envConfig.ontech?.email || '',
        password: envConfig.ontech?.password || '',
        sender_id: envConfig.ontech?.senderId || '',
        base_url: envConfig.ontech?.baseUrl || '',
        source: 'env',
      };
    }
  }

  const provider = String(config.provider || 'console').toLowerCase();

  switch (provider) {
    case 'twilio':
      return sendViaTwilio({ to, body }, config);
    case 'ontech':
      return sendOntechSms(config, { phone: to, message: body });
    case 'console':
    default:
      return sendViaConsole({ to, body });
  }
}

export async function getSmsProviderStatus() {
  try {
    const config = await getEffectiveSmsConfig();
    return {
      provider: config.provider,
      configured: isSmsConfigured(config),
      from: config.twilio_from || config.sender_id || null,
    };
  } catch {
    const config = getSmsConfig();
    return {
      provider: config.provider,
      configured: config.configured,
      from: config.twilio.from || config.ontech?.senderId || null,
    };
  }
}
