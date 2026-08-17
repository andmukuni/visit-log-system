export function normalizeNrc(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}/${digits.slice(6)}`;
  return `${digits.slice(0, 6)}/${digits.slice(6, 8)}/${digits.slice(8)}`;
}

export function isCompleteNrc(value) {
  return /^\d{6}\/\d{2}\/\d{1}$/.test(normalizeNrc(value));
}

export function maskNrc(value) {
  const nrc = normalizeNrc(value);
  if (!isCompleteNrc(nrc)) return null;
  return `${nrc.slice(0, 2)}****/${nrc.slice(7, 9)}/${nrc.slice(10)}`;
}

/** Prefer visitors.id_number_masked; derive a masked NRC from contact details when missing. */
export function resolveVisitorIdNumberMasked(row = {}) {
  if (row.id_number_masked) return row.id_number_masked;
  if (String(row.id_type || '').toLowerCase() === 'nrc' && row.id_number) {
    return maskNrc(row.id_number);
  }
  return null;
}
