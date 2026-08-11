/**
 * Ontech Bulk SMS Platform client (JWT REST API).
 * Docs: POST /api/login → POST /api/send/sms
 */

const DEFAULT_BASE_URL = 'https://bulksms.ontech.co.zm/api';
const TOKEN_TTL_MS = 7.5 * 60 * 60 * 1000; // reuse until near the documented 8h expiry

const tokenCache = new Map();

function normalizeBaseUrl(baseUrl) {
  let url = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  // Migrate legacy /smsservice base to the Platform API root.
  if (/\/smsservice$/i.test(url)) {
    url = url.replace(/\/smsservice$/i, '/api');
  }
  if (!/\/api$/i.test(url) && /bulksms\.ontech\.co\.zm$/i.test(url)) {
    url = `${url}/api`;
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

async function login(baseUrl, email, password) {
  const cacheKey = `${baseUrl}|${email}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || data?.error || `Ontech login failed (HTTP ${res.status}).`);
  }

  const token = data?.access_token;
  if (!token) {
    throw new Error('Ontech login succeeded but no access_token was returned.');
  }

  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function clearOntechTokenCache() {
  tokenCache.clear();
}

/**
 * Send a single SMS via Ontech Platform API.
 * @param {{ email: string, password: string, sender_id?: string, base_url?: string }} config
 * @param {{ phone: string, message: string }} payload
 */
export async function sendOntechSms(config, { phone, message }) {
  const email = String(config.email || '').trim();
  const password = String(config.password || '').trim();
  const senderId = String(config.sender_id || '').trim();
  const baseUrl = normalizeBaseUrl(config.base_url);
  const normalizedPhone = normalizeZmPhone(phone);

  if (!email || !password) {
    throw new Error('Ontech email and password are required.');
  }
  if (!normalizedPhone) {
    throw new Error('Recipient phone number is required.');
  }
  if (!message) {
    throw new Error('SMS message is required.');
  }

  let token;
  try {
    token = await login(baseUrl, email, password);
  } catch (error) {
    tokenCache.delete(`${baseUrl}|${email}`);
    throw error;
  }

  const body = {
    phone: normalizedPhone,
    message: String(message),
  };
  if (senderId) body.sender_id = senderId.slice(0, 11);

  let res = await fetch(`${baseUrl}/send/sms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Retry once on auth failure with a fresh token.
  if (res.status === 401) {
    tokenCache.delete(`${baseUrl}|${email}`);
    token = await login(baseUrl, email, password);
    res = await fetch(`${baseUrl}/send/sms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.detail
      || data?.message
      || data?.error
      || (Array.isArray(data?.errors) ? data.errors.join(', ') : null)
      || `Ontech SMS API returned HTTP ${res.status}.`,
    );
  }

  return {
    provider: 'ontech',
    messageId: data?.id || data?.message_id || data?.messageId || `ontech-${Date.now()}`,
    raw: data,
  };
}

export { DEFAULT_BASE_URL, normalizeBaseUrl };
