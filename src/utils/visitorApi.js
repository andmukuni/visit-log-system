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
  gateEntryWalkIn: async (body) => {
    const res = await fetch(`${API_BASE}/admin/station/gate-entry/walk-in`, {
      method: 'POST',
      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const err = new Error(json?.message || 'Request failed');
      err.unavailable = Boolean(json?.unavailable);
      throw err;
    }
    return json.data;
  },
  gateEntryVehicle: (body) => apiFetch('/admin/station/gate-entry/vehicle', { method: 'POST', body: JSON.stringify(body) }),
  gateEntryNrcLookup: async (nrc) => {
    const res = await fetch(`${API_BASE}/admin/station/gate-entry/nrc-lookup`, {
      method: 'POST',
      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nrc }),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const err = new Error(json?.message || 'Request failed');
      err.unavailable = Boolean(json?.unavailable);
      throw err;
    }
    return json.data;
  },
  searchVehicleByPlate: (plate) => apiFetch(`/admin/vehicles/search?plate=${encodeURIComponent(plate)}`),
  getVisits: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/visits${qs ? `?${qs}` : ''}`);
  },
  getVisit: (id) => apiFetch(`/admin/visits/${id}`),
  registerVisit: (body) => apiFetch('/admin/visits', { method: 'POST', body: JSON.stringify(body) }),
  approveVisit: (id, reason) => apiFetch(`/admin/visits/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
  rejectVisit: (id, reason) => apiFetch(`/admin/visits/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  checkInVisit: (id, badgeNumber) => apiFetch(`/admin/visits/${id}/check-in`, {
    method: 'POST',
    body: JSON.stringify(badgeNumber != null && badgeNumber !== '' ? { badgeNumber } : {}),
  }),
  checkOutVisit: (id) => apiFetch(`/admin/visits/${id}/check-out`, { method: 'POST' }),
  lookupVisit: (query, type) => apiFetch('/admin/visits/lookup', { method: 'POST', body: JSON.stringify({ query, type }) }),
  getPendingCheckIns: (type = 'walk-in') => apiFetch(`/admin/visits/pending-check-in?type=${encodeURIComponent(type)}`),
  getExpectedArrivals: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/visits/expected-arrivals${qs ? `?${qs}` : ''}`);
  },
  getOnSiteVisits: (type = 'walk-in') => apiFetch(`/admin/visits/on-site?type=${encodeURIComponent(type)}`),
  getVehicles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/vehicles${qs ? `?${qs}` : ''}`);
  },
  registerVehicle: (body) => apiFetch('/admin/vehicles', { method: 'POST', body: JSON.stringify(body) }),
  checkOutVehicle: (id) => apiFetch(`/admin/vehicles/${id}/check-out`, { method: 'POST' }),
  getOrgDashboard: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/org/dashboard${qs ? `?${qs}` : ''}`);
  },
  getOrgNavCounts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/org/nav-counts${qs ? `?${qs}` : ''}`);
  },
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
  getOrgVisit: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/org/visits/${id}${qs ? `?${qs}` : ''}`);
  },
  getOrgAudit: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, value]) => value != null && value !== ''),
      ),
    ).toString();
    return apiFetch(`/admin/org/audit${qs ? `?${qs}` : ''}`);
  },
  getOrganisations: async () => {
    const res = await fetch(`${API_BASE}/admin/org/organisations`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getOrganisation: (id) => apiFetch(`/admin/org/organisations/${id}`),
  createOrganisation: (body) => apiFetch('/admin/org/organisations', { method: 'POST', body: JSON.stringify(body) }),
  updateOrganisation: (id, body) => apiFetch(`/admin/org/organisations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getSites: async () => {
    const res = await fetch(`${API_BASE}/admin/org/sites`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    // Preserve array shape for existing callers; attach stats when present.
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getSite: (id) => apiFetch(`/admin/org/sites/${id}`),
  createSite: (body) => apiFetch('/admin/org/sites', { method: 'POST', body: JSON.stringify(body) }),
  updateSite: (id, body) => apiFetch(`/admin/org/sites/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getZones: async () => {
    const res = await fetch(`${API_BASE}/admin/org/zones`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getZone: (id) => apiFetch(`/admin/org/zones/${id}`),
  createZone: (body) => apiFetch('/admin/org/zones', { method: 'POST', body: JSON.stringify(body) }),
  updateZone: (id, body) => apiFetch(`/admin/org/zones/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getBuildings: () => apiFetch('/admin/org/buildings'),
  createBuilding: (body) => apiFetch('/admin/org/buildings', { method: 'POST', body: JSON.stringify(body) }),
  getStations: async () => {
    const res = await fetch(`${API_BASE}/admin/org/stations`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getStation: (id) => apiFetch(`/admin/org/stations/${id}`),
  createStation: (body) => apiFetch('/admin/org/stations', { method: 'POST', body: JSON.stringify(body) }),
  updateStation: (id, body) => apiFetch(`/admin/org/stations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getDepartments: async () => {
    const res = await fetch(`${API_BASE}/admin/org/departments`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getDepartment: (id) => apiFetch(`/admin/org/departments/${id}`),
  createDepartment: (body) => apiFetch('/admin/org/departments', { method: 'POST', body: JSON.stringify(body) }),
  updateDepartment: (id, body) => apiFetch(`/admin/org/departments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getOffices: async () => {
    const res = await fetch(`${API_BASE}/admin/org/offices`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getOffice: (id) => apiFetch(`/admin/org/offices/${id}`),
  createOffice: (body) => apiFetch('/admin/org/offices', { method: 'POST', body: JSON.stringify(body) }),
  updateOffice: (id, body) => apiFetch(`/admin/org/offices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getPositions: async () => {
    const res = await fetch(`${API_BASE}/admin/org/positions`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  createPosition: (body) => apiFetch('/admin/org/positions', { method: 'POST', body: JSON.stringify(body) }),
  updatePosition: (id, body) => apiFetch(`/admin/org/positions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getPosition: async (id) => {
    const res = await fetch(`${API_BASE}/admin/org/positions/${id}`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    return json.data;
  },
  deletePosition: async (id) => {
    const res = await fetch(`${API_BASE}/admin/org/positions/${id}`, {
      method: 'DELETE',
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    return json;
  },
  getHosts: async () => {
    const res = await fetch(`${API_BASE}/admin/org/hosts`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getHost: async (id) => {
    const res = await fetch(`${API_BASE}/admin/org/hosts/${encodeURIComponent(id)}`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    return json.data;
  },
  createHost: (body) => apiFetch('/admin/org/hosts', { method: 'POST', body: JSON.stringify(body) }),
  updateHost: (id, body) => apiFetch(`/admin/org/hosts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  sendHostPasswordReset: async (id) => {
    const res = await fetch(`${API_BASE}/admin/org/hosts/${id}/send-password-reset`, {
      method: 'POST',
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    return json;
  },
  getReceptionists: async () => {
    const res = await fetch(`${API_BASE}/admin/org/receptionists`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getReceptionist: (id) => apiFetch(`/admin/org/receptionists/${id}`),
  createReceptionist: (body) => apiFetch('/admin/org/receptionists', { method: 'POST', body: JSON.stringify(body) }),
  updateReceptionist: (id, body) => apiFetch(`/admin/org/receptionists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteReceptionist: (id) => apiFetch(`/admin/org/receptionists/${id}`, { method: 'DELETE' }),
  getSecurityGuards: async () => {
    const res = await fetch(`${API_BASE}/admin/org/security-guards`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.stats = json.stats || null;
    return rows;
  },
  getSecurityGuard: (id) => apiFetch(`/admin/org/security-guards/${id}`),
  createSecurityGuard: (body) => apiFetch('/admin/org/security-guards', { method: 'POST', body: JSON.stringify(body) }),
  updateSecurityGuard: (id, body) => apiFetch(`/admin/org/security-guards/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSecurityGuard: (id) => apiFetch(`/admin/org/security-guards/${id}`, { method: 'DELETE' }),
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
  getVisit: (id) => apiFetch(`/admin/platform/visits/${id}`),
  getVehicles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/platform/vehicles${qs ? `?${qs}` : ''}`);
  },
  createVehicle: (body) => apiFetch('/admin/platform/vehicles', { method: 'POST', body: JSON.stringify(body) }),
  updateVehicle: (id, body) => apiFetch(`/admin/platform/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteVehicle: (id) => apiFetch(`/admin/platform/vehicles/${id}`, { method: 'DELETE' }),
  getOrganisations: () => apiFetch('/admin/platform/organisations'),
  createOrganisation: (body) => apiFetch('/admin/platform/organisations', { method: 'POST', body: JSON.stringify(body) }),
  updateOrganisation: (id, body) => apiFetch(`/admin/platform/organisations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOrganisation: (id) => apiFetch(`/admin/platform/organisations/${id}`, { method: 'DELETE' }),
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
  getOrgRecent: async () => {
    const res = await fetch(`${API_BASE}/admin/notifications/org/recent`, {
      headers: { ...getAdminAuthHeaders() },
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || 'Request failed');
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    rows.delivery = json.delivery || null;
    return rows;
  },
  getPreferences: () => apiFetch('/admin/notifications/preferences'),
  updatePreferences: (preferences) => apiFetch('/admin/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  }),
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

export const receptionApi = {
  getDashboard: () => apiFetch('/admin/reception/dashboard'),
  getCheckInAppointments: (type = 'walk-in') => apiFetch(`/admin/reception/check-in-appointments?type=${encodeURIComponent(type)}`),
  checkInWalkIn: async (body) => {
    const res = await fetch(`${API_BASE}/admin/reception/check-in/walk-in`, {
      method: 'POST',
      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const err = new Error(json?.message || 'Request failed');
      err.unavailable = Boolean(json?.unavailable);
      throw err;
    }
    return json.data;
  },
  checkInVehicle: (body) => apiFetch('/admin/reception/check-in/vehicle', { method: 'POST', body: JSON.stringify(body) }),
  checkInNrcLookup: async (nrc) => {
    const res = await fetch(`${API_BASE}/admin/reception/check-in/nrc-lookup`, {
      method: 'POST',
      headers: {
        ...getAdminAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nrc }),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const err = new Error(json?.message || 'Request failed');
      err.unavailable = Boolean(json?.unavailable);
      throw err;
    }
    return json.data;
  },
  getCalendar: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/reception/calendar${qs ? `?${qs}` : ''}`);
  },
  getHostAvailability: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/reception/host-availability${qs ? `?${qs}` : ''}`);
  },
  getHostQueue: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/reception/host-queue${qs ? `?${qs}` : ''}`);
  },
  getReferenceData: () => apiFetch('/admin/reception/reference-data'),
  getOccupancy: () => apiFetch('/admin/reception/occupancy'),
  queueToHost: (id, body = {}) => apiFetch(`/admin/reception/visits/${id}/queue-host`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  markInMeeting: (id) => apiFetch(`/admin/reception/visits/${id}/in-meeting`, { method: 'POST' }),
  requestApproval: (id) => apiFetch(`/admin/reception/visits/${id}/request-approval`, { method: 'POST' }),
};
