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
        destinationAddress: [destination],
        message: text,
        metaData: { subAccountId },
      }),
    },
  };
}

export async function sendAirtelSms(config, payload) {
  const { url, destination, init } = buildAirtelSmsRequest(config, payload);
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const detail = data?.message || data?.error || data?.statusMessage || data?.description;
    throw new Error(detail || `Airtel SMS API returned HTTP ${res.status}.`);
  }

  return {
    provider: 'airtel',
    messageId: data?.messageId || data?.message_id || data?.id || data?.transactionId || data?.requestId || `airtel-${Date.now()}`,
    destination,
    raw: data,
  };
}
