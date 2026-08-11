/**
 * Ontech Bulk SMS HTTP API client (API key + sender ID).
 * Endpoint: GET {base}/httpapi?api_key=&phone=&msg=&sender_id=
 */

const DEFAULT_BASE_URL = 'https://bulksms.ontech.co.zm/smsservice';

export function normalizeBaseUrl(baseUrl) {
  let url = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  // Prefer the HTTP API service root when someone pasted the Platform /api URL.
  if (/\/api$/i.test(url)) {
    url = url.replace(/\/api$/i, '/smsservice');
  }
  if (!/\/smsservice$/i.test(url) && /bulksms\.ontech\.co\.zm$/i.test(url)) {
    url = `${url}/smsservice`;
  }
  return url;
}

/** Normalize Zambian mobiles to 260XXXXXXXXX (no +). */
export function normalizeZmPhone(phone) {
  let digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `260${digits.slice(1)}`;
  }
  if (digits.startsWith('260') && digits.length === 12) return digits;
  return String(phone || '').replace(/[^\d]/g, '');
}

/**
 * Send a single SMS via Ontech HTTP API.
 * @param {{ access_id: string, sender_id: string, base_url?: string }} config
 * @param {{ phone: string, message: string }} payload
 */
export async function sendOntechSms(config, { phone, message }) {
  const apiKey = String(config.access_id || config.api_key || '').trim();
  const senderId = String(config.sender_id || '').trim();
  const baseUrl = normalizeBaseUrl(config.base_url);
  const normalizedPhone = normalizeZmPhone(phone);

  if (!apiKey) {
    throw new Error('Ontech API key is required.');
  }
  if (!senderId) {
    throw new Error('Ontech Sender ID is required.');
  }
  if (!normalizedPhone) {
    throw new Error('Recipient phone number is required.');
  }
  if (!message) {
    throw new Error('SMS message is required.');
  }

  const url = new URL(`${baseUrl}/httpapi`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('phone', normalizedPhone);
  url.searchParams.set('msg', String(message));
  url.searchParams.set('sender_id', senderId.slice(0, 11));

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Ontech SMS API returned HTTP ${res.status}.`);
  }

  const status = Number(data?.status);
  if (Number.isFinite(status) && status !== 100) {
    throw new Error(data?.message || `Ontech SMS failed (status ${status}).`);
  }

  return {
    provider: 'ontech',
    messageId: data?.message_id || data?.id || data?.messageId || `ontech-${Date.now()}`,
    raw: data,
  };
}

export { DEFAULT_BASE_URL };
