import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

async function kioskFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const err = new Error(json?.message || 'Request failed');
    err.status = res.status;
    err.data = json?.data;
    throw err;
  }
  return json.data;
}

export const kioskApi = {
  getConfig: (org) => kioskFetch(`/kiosk/config${org ? `?org=${encodeURIComponent(org)}` : ''}`),
  getInvite: (token) => kioskFetch(`/kiosk/invite/${token}`),
  confirmInvite: (token, body) => kioskFetch(`/kiosk/invite/${token}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  lookup: (query, org) => kioskFetch('/kiosk/lookup', { method: 'POST', body: JSON.stringify({ query, org }) }),
  checkIn: (body) => kioskFetch('/kiosk/check-in', { method: 'POST', body: JSON.stringify(body) }),
  checkOut: (body) => kioskFetch('/kiosk/check-out', { method: 'POST', body: JSON.stringify(body) }),
  getHostApproval: (token) => kioskFetch(`/visit/host-approval/${encodeURIComponent(token)}`),
  approveHostApproval: (token) => kioskFetch(`/visit/host-approval/${encodeURIComponent(token)}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  rejectHostApproval: (token, reason) => kioskFetch(`/visit/host-approval/${encodeURIComponent(token)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
};
