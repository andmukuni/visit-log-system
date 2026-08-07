/**
 * Field masking for on-screen views and exports — same rules apply to both.
 */

export const MASK_LEVELS = ['full', 'security', 'operational', 'management', 'compliance', 'minimum'];

export function maskPhone(phone = '') {
  const p = String(phone || '').replace(/\s/g, '');
  if (!p) return '';
  if (p.length <= 4) return '****';
  return `${p.slice(0, 3)}****${p.slice(-2)}`;
}

export function maskEmail(email = '') {
  const e = String(email || '').trim();
  if (!e.includes('@')) return e ? '***@***' : '';
  const [local, domain] = e.split('@');
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

export function resolveMaskLevel(permissions = []) {
  const perms = new Set((permissions || []).map((p) => String(p).trim()).filter(Boolean));
  if (perms.has('super_admin') || perms.has('*')) return 'full';
  if (perms.has('admin.dashboard') || perms.has('admin.users')) return 'full';
  if (perms.has('security.watchlist')) return 'full';

  const list = [...perms];
  if (list.some((p) => p.startsWith('security.'))) return 'security';
  if (list.some((p) => p.startsWith('station.'))) return 'operational';
  if (list.some((p) => p.startsWith('management.'))) return 'management';
  if (list.some((p) => p.startsWith('compliance.'))) return 'compliance';
  if (list.some((p) => p.startsWith('host.'))) return 'management';
  return 'minimum';
}

export function maskVisitorFields(row = {}, maskLevel = 'minimum') {
  if (maskLevel === 'full' || maskLevel === 'security' || maskLevel === 'operational') {
    return { ...row };
  }

  const masked = { ...row };
  if (masked.phone) masked.phone = maskPhone(masked.phone);
  if (masked.email) masked.email = maskEmail(masked.email);
  if (masked.id_number_masked) masked.id_number_masked = '***';

  if (maskLevel === 'minimum') {
    if (masked.full_name) {
      const parts = String(masked.full_name).trim().split(/\s+/);
      masked.full_name = parts.length > 1
        ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
        : `${parts[0]?.charAt(0) || ''}***`;
    }
  }

  return masked;
}

export function maskRows(rows = [], maskLevel = 'minimum', { rowMapper = maskVisitorFields } = {}) {
  return rows.map((row) => rowMapper(row, maskLevel));
}
