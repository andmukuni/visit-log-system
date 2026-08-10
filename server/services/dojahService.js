import { getEffectiveDojahConfig } from './adminSettingsService.js';

const PRODUCTION_BASE_URL = 'https://api.dojah.io';
const SANDBOX_BASE_URL = 'https://sandbox.dojah.io';
const NRC_LOOKUP_PATH = '/api/v1/zm/kyc/nrc';
const BALANCE_PATH = '/api/v1/balance';

function getBaseUrl(config) {
  return config.use_sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
}

function normalizePrivateKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  return key.replace(/^Bearer\s+/i, '');
}

function normalizeNrc(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}/${digits.slice(6)}`;
  return `${digits.slice(0, 6)}/${digits.slice(6, 8)}/${digits.slice(8)}`;
}

function isCompleteNrc(value) {
  return /^\d{6}\/\d{2}\/\d{1}$/.test(normalizeNrc(value));
}

function buildHeaders(config) {
  return {
    AppId: String(config.app_id || '').trim(),
    Authorization: normalizePrivateKey(config.private_key),
    Accept: 'application/json',
  };
}

function extractDojahError(body, status) {
  if (!body || typeof body !== 'object') {
    return `Dojah API returned ${status}.`;
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  return `Dojah API returned ${status}.`;
}

async function parseDojahResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = extractDojahError(body, res.status);
    const err = new Error(message);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    if (isUnavailableHttpStatus(res.status)) {
      err.code = 'DOJAH_UNAVAILABLE';
    }
    throw err;
  }
  return body;
}

function isUnavailableHttpStatus(status) {
  return status === 429 || status >= 500;
}

export function isDojahUnavailableError(error) {
  if (!error) return false;
  if (error.code === 'DOJAH_UNAVAILABLE') return true;
  const status = Number(error.status);
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function assertConfigured(config) {
  if (!config.enabled) {
    const err = new Error('Dojah KYC integration is disabled.');
    err.status = 400;
    throw err;
  }
  if (!config.app_id || !config.private_key) {
    const err = new Error('Dojah App ID and private key are required.');
    err.status = 400;
    throw err;
  }
}

async function dojahGet(config, path, query = {}) {
  const url = new URL(path, getBaseUrl(config));
  Object.entries(query).forEach(([key, value]) => {
    if (value != null && String(value).trim() !== '') {
      url.searchParams.set(key, String(value).trim());
    }
  });

  let res;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: buildHeaders(config),
    });
  } catch {
    const err = new Error('Dojah service is temporarily unavailable.');
    err.status = 503;
    err.code = 'DOJAH_UNAVAILABLE';
    throw err;
  }
  return parseDojahResponse(res);
}

export async function getDojahIntegrationStatus() {
  const config = await getEffectiveDojahConfig();
  return {
    enabled: Boolean(config.enabled),
    configured: Boolean(config.app_id && config.private_key),
    use_sandbox: Boolean(config.use_sandbox),
    source: config.source || 'none',
  };
}

function mapNrcLookupResult(body, normalizedNrc) {
  const entity = body?.entity || {};
  return {
    nrc: entity.nrc || normalizedNrc,
    taxpayer_name: entity.taxpayer_name || '',
    current_status: entity.current_status || '',
    is_deregistered: entity.is_deregistered ?? null,
    tax_types: entity.tax_types || '',
    tpin: entity.tpin || '',
    raw: entity,
  };
}

export function assertNrcEligibleForEntry(lookup) {
  if (!lookup) return;

  if (lookup.is_deregistered === 1) {
    const err = new Error('NRC is deregistered — entry blocked.');
    err.status = 403;
    throw err;
  }

  const status = String(lookup.current_status || '').trim().toUpperCase();
  if (status && status !== 'ACTIVE') {
    const err = new Error(`NRC status is ${lookup.current_status} — entry blocked.`);
    err.status = 403;
    throw err;
  }
}

export async function lookupNrc(nrc, { customerReference } = {}) {
  const normalized = normalizeNrc(nrc);
  if (!normalized) {
    const err = new Error('NRC is required.');
    err.status = 400;
    throw err;
  }
  if (!isCompleteNrc(normalized)) {
    const err = new Error('Enter a valid NRC in the format 123456/78/9.');
    err.status = 400;
    throw err;
  }

  const config = await getEffectiveDojahConfig();
  assertConfigured(config);

  const body = await dojahGet(config, NRC_LOOKUP_PATH, {
    nrc: normalized,
    customer_reference: customerReference,
  });

  const result = mapNrcLookupResult(body, normalized);
  assertNrcEligibleForEntry(result);
  return result;
}

export async function testDojahConnection({ nrc } = {}) {
  const config = await getEffectiveDojahConfig();
  assertConfigured(config);

  const testNrc = normalizeNrc(nrc);
  if (testNrc) {
    const result = await lookupNrc(testNrc, { customerReference: 'wgvl-settings-test' });
    return {
      ok: true,
      mode: 'nrc_lookup',
      message: `NRC lookup succeeded for ${result.taxpayer_name || result.nrc}.`,
      sample: {
        nrc: result.nrc,
        taxpayer_name: result.taxpayer_name,
        current_status: result.current_status,
        tpin: result.tpin || null,
      },
    };
  }

  const body = await dojahGet(config, BALANCE_PATH);
  const balance = body?.entity?.wallet_balance;

  return {
    ok: true,
    mode: 'balance',
    message: balance != null
      ? `Connection successful. Wallet balance: ${balance}.`
      : 'Connection successful.',
    wallet_balance: balance ?? null,
  };
}
