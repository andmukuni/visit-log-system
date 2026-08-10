function isViteDevOrigin(origin) {
  // Any host on the Vite port (localhost or LAN IP) should use the same-origin
  // /api proxy. Hardcoding localhost:4000 breaks login for network clients.
  return /^https?:\/\/[^/]+:5173$/i.test(origin);
}

export function getApiBase() {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (isViteDevOrigin(origin)) {
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
    // Absolute env URLs pointing at localhost are only valid on this machine.
    // Prefer same-origin /api when the page itself is not localhost.
    if (/^https?:\/\//i.test(cleaned)) {
      const isLocalhostApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(cleaned);
      const pageIsLocal =
        typeof window !== 'undefined'
        && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.host);
      if (isLocalhostApi && typeof window !== 'undefined' && !pageIsLocal) {
        return `${window.location.origin}/api`;
      }
      return cleaned;
    }
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
