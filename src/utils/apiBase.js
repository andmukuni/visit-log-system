export function getApiBase() {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    // Local Vite dev — always use same-origin proxy (/api → :4000)
    if (/^https?:\/\/(localhost|127\.0\.0\.1):5173$/i.test(origin)) {
      return `${origin}/api`;
    }
  }

  const env = String(
    import.meta.env.VITE_API_URL
    || import.meta.env.VITE_API_BASE
    || '',
  ).trim();

  if (env) {
    const cleaned = env.replace(/\/$/, '');
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${cleaned.startsWith('/') ? cleaned : `/${cleaned}`}`;
    }
    return `http://localhost:4000${cleaned.startsWith('/') ? cleaned : `/${cleaned}`}`;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api`.replace(/\/$/, '');
  }

  return 'http://localhost:4000/api';
}

export function getAppOrigin() {
  return getApiBase().replace(/\/api\/?$/i, '');
}
