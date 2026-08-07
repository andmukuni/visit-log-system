import { getEffectiveDojahConfig } from './adminSettingsService.js';

const PRODUCTION_BASE_URL = 'https://api.dojah.io';
const SANDBOX_BASE_URL = 'https://sandbox.dojah.io';

function getBaseUrl(config) {
  return config.use_sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
}

function buildHeaders(config) {
  return {
    AppId: config.app_id,
    Authorization: config.private_key,
    Accept: 'application/json',
  };
}

async function parseDojahResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error || body?.message || `Dojah API returned ${res.status}.`;
    const err = new Error(message);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw err;
  }
  return body;
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

export async function lookupNrc(nrc) {
  const normalized = String(nrc || '').trim();
  if (!normalized) {
    const err = new Error('NRC is required.');
    err.status = 400;
    throw err;
  }

  const config = await getEffectiveDojahConfig();
  assertConfigured(config);

  const url = new URL('/api/v1/zm/kyc/nrc', getBaseUrl(config));
  url.searchParams.set('nrc', normalized);

  const res = await fetch(url, { headers: buildHeaders(config) });
  const body = await parseDojahResponse(res);

  return {
    nrc: body?.entity?.nrc || normalized,
    taxpayer_name: body?.entity?.taxpayer_name || '',
    current_status: body?.entity?.current_status || '',
    is_deregistered: body?.entity?.is_deregistered ?? null,
    tax_types: body?.entity?.tax_types || '',
    tpin: body?.entity?.tpin || '',
    raw: body?.entity || body,
  };
}

export async function testDojahConnection({ nrc } = {}) {
  const config = await getEffectiveDojahConfig();
  assertConfigured(config);

  const testNrc = String(nrc || '').trim();
  if (testNrc) {
    const result = await lookupNrc(testNrc);
    return {
      ok: true,
      mode: 'nrc_lookup',
      message: `NRC lookup succeeded for ${result.taxpayer_name || result.nrc}.`,
      sample: {
        nrc: result.nrc,
        taxpayer_name: result.taxpayer_name,
        current_status: result.current_status,
      },
    };
  }

  const url = new URL('/api/v1/balance', getBaseUrl(config));
  const res = await fetch(url, { headers: buildHeaders(config) });
  const body = await parseDojahResponse(res);
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
