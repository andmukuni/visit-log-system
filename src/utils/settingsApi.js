import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

async function settingsRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAdminAuthHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || 'Request failed');
  }
  return json;
}

export const settingsApi = {
  getSettings: async () => {
    const json = await settingsRequest('/admin/settings');
    return json.data;
  },

  updateAccount: async (body) => {
    const json = await settingsRequest('/admin/settings/account', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json.data;
  },

  updateGeneral: async (body) => {
    const json = await settingsRequest('/admin/settings/general', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json.data;
  },

  updateSecurity: async (body) => {
    const json = await settingsRequest('/admin/settings/security', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json.data;
  },

  updateNotifications: async (body) => {
    const json = await settingsRequest('/admin/settings/notifications', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json.data;
  },

  updateSmtp: async (body) => {
    const json = await settingsRequest('/admin/settings/smtp', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json.data;
  },

  testSmtp: async (body) => settingsRequest('/admin/settings/smtp/test', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  updateDojah: async (body) => {
    const json = await settingsRequest('/admin/settings/dojah', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json.data;
  },

  testDojah: async (body) => settingsRequest('/admin/settings/dojah/test', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  updateSms: async (body) => {
    const json = await settingsRequest('/admin/settings/sms', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json.data;
  },

  testSms: async (body) => settingsRequest('/admin/settings/sms/test', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  changePassword: async (body) => settingsRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
};
