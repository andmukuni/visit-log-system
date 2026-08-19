import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

async function boardFetch(path, options = {}) {
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
    throw err;
  }
  return json.data;
}

export const signBoardApi = {
  getBoard: (token) => boardFetch(`/signature-board/${encodeURIComponent(token)}`),
  getRequests: (token, { page = 1, pageSize = 10 } = {}) =>
    boardFetch(`/signature-board/${encodeURIComponent(token)}/requests?page=${page}&pageSize=${pageSize}`),
  sign: (token, requestId, signatureData) =>
    boardFetch(`/signature-board/${encodeURIComponent(token)}/requests/${encodeURIComponent(requestId)}/sign`, {
      method: 'POST',
      body: JSON.stringify({ signatureData }),
    }),
  streamUrl: (token) => `${API_BASE}/signature-board/${encodeURIComponent(token)}/stream`,
};
