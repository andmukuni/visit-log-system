/**
 * Airtel Zambia SMS gateway.
 * POST {base}/sendDefaultSms or {base}/sendFlashSms
 * Authorization: Basic base64(username:password)
 */

import { normalizeZmPhone } from './ontechSmsClient.js';

export const DEFAULT_AIRTEL_BASE_URL = 'https://www.airtel.co.zm/gateway/v1';

/** Airtel shows the sub-account as the username, with underscores instead of hyphens. */
export function resolveAirtelSubAccountId(username, subAccountId) {
  const explicit = String(subAccountId || '').trim();
  if (explicit) return explicit;
  return String(username || '').trim().replace(/_/g, '-');
}

export function resolveAirtelEndpoint(baseUrl, messageType) {
  let root = String(baseUrl || DEFAULT_AIRTEL_BASE_URL).trim().replace(/\/$/, '');
  root = root.replace(/\/send(?:Default|Flash)Sms$/i, '');
  const flash = String(messageType || 'default').toLowerCase() === 'flash';
  return `${root}/${flash ? 'sendFlashSms' : 'sendDefaultSms'}`;
}

export function buildAirtelSmsRequest(config, { phone, message }) {
  const customerId = String(config.airtel_customer_id || '').trim();
  const username = String(config.airtel_username || '').trim();
  const password = String(config.airtel_password || '');
  const senderId = String(config.sender_id || '').trim();
  const subAccountId = resolveAirtelSubAccountId(username, config.airtel_sub_account_id);
  const destination = normalizeZmPhone(phone);
  const text = String(message || '');

  if (!customerId) throw new Error('Airtel Customer ID is required.');
  if (!username || !password) throw new Error('Airtel username and password are required.');
  if (!senderId) throw new Error('Airtel Sender ID is required.');
  if (!subAccountId) throw new Error('Airtel sub-account ID is required.');
  if (!destination) throw new Error('Recipient phone number is required.');
  if (!text) throw new Error('SMS message is required.');

  const url = resolveAirtelEndpoint(config.airtel_base_url, config.airtel_message_type);
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');

  return {
    url,
    destination,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId,
        senderId,
        sourceAddress: senderId,
        destinationAddress: [destination],
        message: text,
        metaData: { subAccountId },
      }),
    },
  };
}

export function describeAirtelError(status, data, rawText) {
  const parts = [];
  if (data && typeof data === 'object') {
    const push = (value) => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text && text !== 'Bad Request') parts.push(text);
    };
    push(data.errorMessage);
    push(data.statusMessage);
    push(data.description);
    if (typeof data.message === 'string') push(data.message);
    else if (data.message && typeof data.message === 'object') {
      push(data.message.message || data.message.error || data.message.description);
    }
    if (Array.isArray(data.errors)) {
      for (const item of data.errors) {
        const field = item?.field || item?.property;
        const msg = item?.defaultMessage || item?.message || item?.error;
        if (msg) parts.push(field ? `${field}: ${msg}` : String(msg));
      }
    }
    if (Array.isArray(data.incorrectNum) && data.incorrectNum.length) {
      parts.push(`Incorrect numbers: ${data.incorrectNum.join(', ')}`);
    }
    push(data.error);
  }
  const unique = [...new Set(parts)];
  if (unique.length) return unique.join(' ');
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 300);
  return `Airtel SMS API returned HTTP ${status}.`;
}

export async function sendAirtelSms(config, payload) {
  const { url, destination, init } = buildAirtelSmsRequest(config, payload);
  const res = await fetch(url, init);
  const rawText = await res.text();
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  }
  const errorMessage = typeof data?.errorMessage === 'string' ? data.errorMessage.trim() : '';
  if (!res.ok || data?.success === false || errorMessage) {
    throw new Error(describeAirtelError(res.status, data, rawText));
  }

  return {
    provider: 'airtel',
    messageId: data?.messageId || data?.message_id || data?.id || data?.transactionId || data?.requestId || `airtel-${Date.now()}`,
    destination,
    raw: data,
  };
}
