import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getApiBase } from '../utils/apiBase';
import {
  getAdminAuthHeaders,
  buildPublicUserSession,
  dispatchUserSessionSync,
  purgeInvalidAuthState,
  clearAllAuthStorage,
  clearAdminAuthStorage,
} from '../utils/authHeaders';
import { permissionMatches } from '../../shared/rbacPermissions.js';

const AuthContext = createContext();
const API_BASE = getApiBase();
// Fixed product timeout (5 minutes). Do not read Vite env here — some production
// builds still had VITE_ADMIN_IDLE_TIMEOUT_MINUTES=30 baked in at image build time.
const ADMIN_IDLE_TIMEOUT_MINUTES = 5;
const ADMIN_IDLE_TIMEOUT_MS = ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000;

function getStoredSession() {
  try {
    purgeInvalidAuthState();
    const stored = localStorage.getItem('mm_auth_session');
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearAdminAuthStorage();
      return null;
    }
    const adminToken = localStorage.getItem('mm_admin_token') || '';
    if (!adminToken) {
      clearAdminAuthStorage();
      return null;
    }
    if (!Array.isArray(session.permissions)) {
      session.permissions = session.admin_permissions || [];
    }
    return session;
  } catch {
    clearAdminAuthStorage();
    return null;
  }
}

function canAccessAdminPanel(userData = {}) {
  const perms = userData.admin_permissions || userData.permissions || [];
  return userData.role === 'admin' || userData.admin_access === true || (Array.isArray(perms) && perms.length > 0);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredSession());
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [idleLogoutPromptOpen, setIdleLogoutPromptOpen] = useState(false);
  const idleTimerRef = useRef(null);

  const isAuthenticated = Boolean(user);

  const login = useCallback(async (email, password) => {
    purgeInvalidAuthState();
    setLoginError('');
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoginError(json.message || 'Login failed.');
        return null;
      }

      const userData = json.data;
      if (!canAccessAdminPanel(userData)) {
        setLoginError('Access denied. Administrator privileges required.');
        return null;
      }

      const permissions = Array.isArray(userData.admin_permissions) ? userData.admin_permissions : [];
      const session = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        permissions,
        admin_permissions: permissions,
        loggedInAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem('mm_auth_session', JSON.stringify(session));
      localStorage.setItem('mm_admin_token', String(json.token));

      const publicSession = buildPublicUserSession(userData);
      if (publicSession) {
        dispatchUserSessionSync(publicSession);
      }

      setIdleLogoutPromptOpen(false);
      setUser(session);
      return session;
    } catch {
      setLoginError('Unable to connect to server. Please try again.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAllAuthStorage();
    dispatchUserSessionSync(null);
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setIdleLogoutPromptOpen(false);
    setUser(null);
  }, []);

  const dismissIdleLogoutPrompt = useCallback(() => {
    setIdleLogoutPromptOpen(false);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!user) return;
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      clearAllAuthStorage();
      dispatchUserSessionSync(null);
      setUser(null);
      setIdleLogoutPromptOpen(true);
      setLoginError('Admin session ended due to inactivity. Please log in again.');
    }, ADMIN_IDLE_TIMEOUT_MS);
  }, [user]);

  const recordUserActivity = useCallback(() => {
    if (!user) return;
    resetIdleTimer();
  }, [user, resetIdleTimer]);

  useEffect(() => {
    purgeInvalidAuthState();
    setUser(getStoredSession());
  }, []);

  useEffect(() => {
    if (!user) {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recordUserActivity();
      }
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordUserActivity);
    });
    document.addEventListener('visibilitychange', onVisibilityChange);
    resetIdleTimer();

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordUserActivity);
      });
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [user, recordUserActivity, resetIdleTimer]);

  const clearLoginError = useCallback(() => {
    setLoginError('');
  }, []);

  const permissions = user?.permissions || user?.admin_permissions || [];

  const hasPermission = useCallback((key) => {
    if (!user) return false;
    if (user.role === 'admin' && permissions.length === 0) return true;
    return permissionMatches(permissions, key);
  }, [user, permissions]);

  const refreshPermissions = useCallback(async () => {
    const stored = getStoredSession();
    if (!stored?.id) return;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh-session`, {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) return;
      const nextPerms = json.data?.permissions || [];
      if (json.token) {
        localStorage.setItem('mm_admin_token', String(json.token));
      }
      setUser((prev) => {
        if (!prev) return prev;
        const nextSession = {
          ...prev,
          permissions: nextPerms,
          admin_permissions: nextPerms,
        };
        localStorage.setItem('mm_auth_session', JSON.stringify(nextSession));
        return nextSession;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    refreshPermissions();
  }, [user?.id, refreshPermissions]);

  const updateSession = useCallback((patch = {}) => {
    setUser((prev) => {
      if (!prev) return prev;
      const nextSession = {
        ...prev,
        ...patch,
        permissions: prev.permissions || prev.admin_permissions || [],
        admin_permissions: prev.admin_permissions || prev.permissions || [],
      };
      localStorage.setItem('mm_auth_session', JSON.stringify(nextSession));
      return nextSession;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isAuthenticated,
        isLoading,
        loginError,
        login,
        logout,
        clearLoginError,
        hasPermission,
        refreshPermissions,
        updateSession,
        idleLogoutPromptOpen,
        dismissIdleLogoutPrompt,
        adminIdleTimeoutMinutes: ADMIN_IDLE_TIMEOUT_MINUTES,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
