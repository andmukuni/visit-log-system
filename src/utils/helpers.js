export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lusaka',
  });
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lusaka',
  });
}

export function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

export function formatCurrency(value, currency = 'USD') {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(num);
}

/** Zambian NRC: 6 digits / 2 digits / 1 digit (e.g. 123456/78/9) */
export const NRC_PLACEHOLDER = '123456/78/9';
export const NRC_INPUT_MAX_LENGTH = 11;

export function formatNrcInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}/${digits.slice(6)}`;
  return `${digits.slice(0, 6)}/${digits.slice(6, 8)}/${digits.slice(8)}`;
}

export function isCompleteNrc(value) {
  return /^\d{6}\/\d{2}\/\d{1}$/.test(formatNrcInput(value));
}

export function printNrcVerificationSlip({
  nrc,
  taxpayerName,
  currentStatus,
  tpin,
  verifiedAt = new Date(),
  appName = 'Visitor Log',
  source = 'Dojah KYC',
} = {}) {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=480,height=720');
  if (!win) return false;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const when = verifiedAt instanceof Date
    ? verifiedAt.toLocaleString(undefined, { timeZone: 'Africa/Lusaka' })
    : String(verifiedAt);

  const row = (label, value) => (
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value) || '—'}</td></tr>`
  );

  win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>NRC Verification — ${escapeHtml(nrc)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #111; }
      .slip { max-width: 360px; margin: 0 auto; border: 1px solid #d1d5db; border-radius: 12px; overflow: hidden; }
      .head { background: #0f172a; color: #fff; padding: 16px 18px; }
      .head h1 { margin: 0; font-size: 16px; }
      .head p { margin: 6px 0 0; font-size: 12px; opacity: 0.85; }
      .body { padding: 16px 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 0; text-align: left; vertical-align: top; border-bottom: 1px solid #e5e7eb; }
      th { width: 38%; color: #6b7280; font-weight: 600; }
      td { color: #111827; font-weight: 500; }
      .foot { padding: 12px 18px 16px; font-size: 11px; color: #6b7280; border-top: 1px dashed #d1d5db; }
      @media print { body { padding: 0; } .slip { border: none; max-width: none; } }
    </style>
  </head>
  <body>
    <div class="slip">
      <div class="head">
        <h1>${escapeHtml(appName)}</h1>
        <p>NRC verification via ${escapeHtml(source)}</p>
      </div>
      <div class="body">
        <table>
          ${row('NRC', nrc)}
          ${row('Registered name', taxpayerName)}
          ${row('Registry status', currentStatus)}
          ${row('TPIN', tpin)}
          ${row('Verified at', when)}
        </table>
      </div>
      <div class="foot">Printed from admin settings · Dojah Zambia NRC lookup</div>
    </div>
  </body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}

/** Common dial codes for gate entry / visitor phone capture (Zambia default). */
export const PHONE_COUNTRIES = [
  { code: 'ZM', name: 'Zambia', dial: '+260', flag: '🇿🇲', placeholder: '97 123 4567' },
  { code: 'ZW', name: 'Zimbabwe', dial: '+263', flag: '🇿🇼', placeholder: '77 123 4567' },
  { code: 'MW', name: 'Malawi', dial: '+265', flag: '🇲🇼', placeholder: '99 123 4567' },
  { code: 'TZ', name: 'Tanzania', dial: '+255', flag: '🇹🇿', placeholder: '712 345 678' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦', placeholder: '82 123 4567' },
  { code: 'BW', name: 'Botswana', dial: '+267', flag: '🇧🇼', placeholder: '71 123 456' },
  { code: 'NA', name: 'Namibia', dial: '+264', flag: '🇳🇦', placeholder: '81 123 4567' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪', placeholder: '712 345678' },
  { code: 'UG', name: 'Uganda', dial: '+256', flag: '🇺🇬', placeholder: '712 345678' },
  { code: 'CD', name: 'DR Congo', dial: '+243', flag: '🇨🇩', placeholder: '812 345 678' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧', placeholder: '7700 900123' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', placeholder: '555 123 4567' },
];

export const DEFAULT_PHONE_COUNTRY = 'ZM';

export function getPhoneCountry(code) {
  return PHONE_COUNTRIES.find((c) => c.code === code) || PHONE_COUNTRIES[0];
}

export function formatPhoneNational(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 15);
}

export function normalizePhoneNational(value) {
  let digits = formatPhoneNational(value);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function buildFullPhone(countryCode, nationalNumber) {
  const { dial } = getPhoneCountry(countryCode);
  const national = normalizePhoneNational(nationalNumber);
  if (!national) return '';
  return `${dial}${national}`;
}

export function formatPhoneDisplay(countryCode, nationalNumber) {
  const full = buildFullPhone(countryCode, nationalNumber);
  if (!full) return '—';
  const { dial } = getPhoneCountry(countryCode);
  const national = full.slice(dial.length);
  return `${dial} ${national}`;
}
