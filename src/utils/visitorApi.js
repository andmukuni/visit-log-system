import { getApiBase } from './apiBase';
import { getAdminAuthHeaders } from './authHeaders';

const API_BASE = getApiBase();

async function apiFetch(path, options = {}) {
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
  return json.data;
}

export const visitorApi = {
  getStationDashboard: () => apiFetch('/admin/station/dashboard'),
  getOccupancy: () => apiFetch('/admin/station/occupancy'),
  getReferenceData: () => apiFetch('/admin/station/reference-data'),
  getVisits: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/visits${qs ? `?${qs}` : ''}`);
  },
  getVisit: (id) => apiFetch(`/admin/visits/${id}`),
  registerVisit: (body) => apiFetch('/admin/visits', { method: 'POST', body: JSON.stringify(body) }),
  approveVisit: (id, reason) => apiFetch(`/admin/visits/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
  rejectVisit: (id, reason) => apiFetch(`/admin/visits/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  checkInVisit: (id, badgeNumber) => apiFetch(`/admin/visits/${id}/check-in`, { method: 'POST', body: JSON.stringify({ badgeNumber }) }),
  checkOutVisit: (id) => apiFetch(`/admin/visits/${id}/check-out`, { method: 'POST' }),
  lookupVisit: (query) => apiFetch('/admin/visits/lookup', { method: 'POST', body: JSON.stringify({ query }) }),
  getVehicles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/vehicles${qs ? `?${qs}` : ''}`);
  },
  registerVehicle: (body) => apiFetch('/admin/vehicles', { method: 'POST', body: JSON.stringify(body) }),
  checkOutVehicle: (id) => apiFetch(`/admin/vehicles/${id}/check-out`, { method: 'POST' }),
  getOrgDashboard: () => apiFetch('/admin/org/dashboard'),
  getOrgVisitors: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/org/visitors${qs ? `?${qs}` : ''}`);
  },
  getOrgVehicles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/org/vehicles${qs ? `?${qs}` : ''}`);
  },
  getOrgVisits: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/org/visits${qs ? `?${qs}` : ''}`);
  },
  getSites: () => apiFetch('/admin/org/sites'),
  getStations: () => apiFetch('/admin/org/stations'),
  getDepartments: () => apiFetch('/admin/org/departments'),
  getHosts: () => apiFetch('/admin/org/hosts'),
  getCategories: () => apiFetch('/admin/org/categories'),
  getBadges: () => apiFetch('/admin/org/badges'),
};

export const hostApi = {
  getDashboard: () => apiFetch('/admin/host/dashboard'),
  getReferenceData: () => apiFetch('/admin/host/reference-data'),
  getVisitors: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/host/visitors${qs ? `?${qs}` : ''}`);
  },
  getApprovals: () => apiFetch('/admin/host/approvals'),
  getOnSite: () => apiFetch('/admin/host/on-site'),
  getVisit: (id) => apiFetch(`/admin/host/visits/${id}`),
  inviteVisitor: (body) => apiFetch('/admin/host/invite', { method: 'POST', body: JSON.stringify(body) }),
  approveVisit: (id, reason) => apiFetch(`/admin/host/visits/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
  rejectVisit: (id, reason) => apiFetch(`/admin/host/visits/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

export const securityApi = {
  getDashboard: () => apiFetch('/admin/security/dashboard'),
  getOccupancy: () => apiFetch('/admin/security/occupancy'),
  getApprovals: () => apiFetch('/admin/security/approvals'),
  getExceptions: () => apiFetch('/admin/security/exceptions'),
  getOverdue: () => apiFetch('/admin/security/overdue'),
  getVisitors: (q) => apiFetch(`/admin/security/visitors${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getVehicles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/security/vehicles${qs ? `?${qs}` : ''}`);
  },
  getWatchlist: () => apiFetch('/admin/security/watchlist'),
  createWatchlistEntry: (body) => apiFetch('/admin/security/watchlist', { method: 'POST', body: JSON.stringify(body) }),
  updateWatchlistEntry: (id, body) => apiFetch(`/admin/security/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getIncidents: () => apiFetch('/admin/security/incidents'),
  createIncident: (body) => apiFetch('/admin/security/incidents', { method: 'POST', body: JSON.stringify(body) }),
  updateIncident: (id, body) => apiFetch(`/admin/security/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getRollCalls: () => apiFetch('/admin/security/roll-call'),
  startRollCall: (body) => apiFetch('/admin/security/roll-call', { method: 'POST', body: JSON.stringify(body || {}) }),
  getRollCall: (id) => apiFetch(`/admin/security/roll-call/${id}`),
  markRollCallEntry: (id, body) => apiFetch(`/admin/security/roll-call/${id}/mark`, { method: 'POST', body: JSON.stringify(body) }),
  closeRollCall: (id, body) => apiFetch(`/admin/security/roll-call/${id}/close`, { method: 'POST', body: JSON.stringify(body || {}) }),
  getAudit: () => apiFetch('/admin/security/audit'),
};

export const emergencyApi = {
  getDashboard: () => apiFetch('/admin/emergency/dashboard'),
  getOccupancy: () => apiFetch('/admin/emergency/occupancy'),
  getRollCalls: () => apiFetch('/admin/emergency/roll-call'),
  startRollCall: (body) => apiFetch('/admin/emergency/roll-call', { method: 'POST', body: JSON.stringify(body || {}) }),
  getRollCall: (id) => apiFetch(`/admin/emergency/roll-call/${id}`),
  markRollCallEntry: (id, body) => apiFetch(`/admin/emergency/roll-call/${id}/mark`, { method: 'POST', body: JSON.stringify(body) }),
  closeRollCall: (id, body) => apiFetch(`/admin/emergency/roll-call/${id}/close`, { method: 'POST', body: JSON.stringify(body || {}) }),
  getUnresolved: () => apiFetch('/admin/emergency/unresolved'),
  getHistory: () => apiFetch('/admin/emergency/history'),
};

export const reportsApi = {
  getTypes: () => apiFetch('/admin/reports/types'),
  preview: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/reports/preview${qs ? `?${qs}` : ''}`);
  },
  getExports: () => apiFetch('/admin/reports/exports'),
};

export async function downloadReportExport({ type, purpose, filters = {}, format = 'csv' }) {
  const API_BASE = getApiBase();
  const res = await fetch(`${API_BASE}/admin/reports/export`, {
    method: 'POST',
    headers: {
      ...getAdminAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, purpose, filters, format }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Export failed');
  }

  if (format === 'json') {
    const json = await res.json();
    if (!json?.ok) throw new Error(json?.message || 'Export failed');
    return json.data;
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `${type}-report.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const complianceApi = {
  getDashboard: () => apiFetch('/admin/compliance/dashboard'),
  getAudit: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/compliance/audit${qs ? `?${qs}` : ''}`);
  },
  getApprovals: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/compliance/approvals${qs ? `?${qs}` : ''}`);
  },
  getAccessReview: () => apiFetch('/admin/compliance/access'),
  getIncidents: () => apiFetch('/admin/compliance/incidents'),
  getPrivacyRequests: () => apiFetch('/admin/compliance/privacy'),
  createPrivacyRequest: (body) => apiFetch('/admin/compliance/privacy', { method: 'POST', body: JSON.stringify(body) }),
  updatePrivacyRequest: (id, body) => apiFetch(`/admin/compliance/privacy/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getRetentionPolicies: () => apiFetch('/admin/compliance/retention'),
};

export const platformApi = {
  getDashboard: () => apiFetch('/admin/platform/dashboard'),
  getCalendar: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/platform/calendar${qs ? `?${qs}` : ''}`);
  },
  getLogBook: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/platform/log-book${qs ? `?${qs}` : ''}`);
  },
  getVisitors: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/platform/visitors${qs ? `?${qs}` : ''}`);
  },
  getVehicles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/platform/vehicles${qs ? `?${qs}` : ''}`);
  },
  getOrganisations: () => apiFetch('/admin/platform/organisations'),
  updateOrganisation: (id, body) => apiFetch(`/admin/platform/organisations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getSubscriptions: () => apiFetch('/admin/platform/subscriptions'),
  getHealth: () => apiFetch('/admin/platform/health'),
  getAudit: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/platform/audit${qs ? `?${qs}` : ''}`);
  },
  getUsers: () => apiFetch('/admin/platform/users'),
};

export const notificationsApi = {
  list: (unreadOnly = false) => apiFetch(`/admin/notifications${unreadOnly ? '?unread=1' : ''}`),
  markRead: (id) => apiFetch(`/admin/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => apiFetch('/admin/notifications/read-all', { method: 'POST' }),
  getTemplates: () => apiFetch('/admin/notifications/templates'),
  getOrgRecent: () => apiFetch('/admin/notifications/org/recent'),
};

export const executiveApi = {
  getDashboard: () => apiFetch('/admin/executive/dashboard'),
  getReferenceData: () => apiFetch('/admin/executive/reference-data'),
  getAppointments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/executive/appointments${qs ? `?${qs}` : ''}`);
  },
  listAppointments: (params = {}) => {
    const qs = new URLSearchParams({ list: '1', ...params }).toString();
    return apiFetch(`/admin/executive/appointments?${qs}`);
  },
  createAppointment: (payload) => apiFetch('/admin/executive/appointments', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getVisits: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/executive/visits${qs ? `?${qs}` : ''}`);
  },
  listVisits: (params = {}) => {
    const qs = new URLSearchParams({ list: '1', ...params }).toString();
    return apiFetch(`/admin/executive/visits?${qs}`);
  },
  getVisit: (id) => apiFetch(`/admin/executive/visits/${id}`),
  getContacts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/executive/contacts${qs ? `?${qs}` : ''}`);
  },
  searchContacts: (params = {}) => {
    const qs = new URLSearchParams({ limit: 8, ...params }).toString();
    return apiFetch(`/admin/executive/contacts?${qs}`);
  },
};
