import { createContext, useContext, useMemo, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  PORTALS,
  getVisibleNavItems,
  groupNavItems,
  getAccessiblePortals,
} from '../../shared/portalNavigation.js';

const SidebarContext = createContext(null);

function buildSidebarSnapshot(portalId, hasPermission, permissions = [], extraItems = []) {
  const staticItems = getVisibleNavItems(portalId, hasPermission);
  const mergedItems = [...staticItems];

  for (const item of extraItems) {
    if (!item?.key) continue;
    if (mergedItems.some((existing) => existing.key === item.key)) continue;
    if (item.permissions?.length) {
      if (!item.permissions.some((key) => hasPermission(key))) continue;
    } else if (item.permission && !hasPermission(item.permission)) continue;
    mergedItems.push({
      section: 'primary',
      ...item,
    });
  }

  const { primary, organisation, system, settings } = groupNavItems(mergedItems);
  const accessiblePortals = getAccessiblePortals(hasPermission, permissions).filter((portal) => portal.id !== portalId);
  const portalMeta = PORTALS[portalId];
  const sectionLabels = portalMeta?.navSections || { primary: 'Overview', system: 'System' };

  return {
    portalId,
    routePrefix: portalMeta?.routePrefix || '/',
    primary,
    organisation,
    system,
    settings,
    accessiblePortals,
    sectionLabels,
    navRevision: mergedItems.map((item) => item.key).join('|'),
  };
}

export function SidebarProvider({ portalId, children }) {
  const { user, hasPermission } = useAuth();
  const [extraNavItems, setExtraNavItemsState] = useState([]);

  const permissionsKey = useMemo(() => {
    const perms = user?.permissions || user?.admin_permissions || [];
    return [...perms].sort().join('|');
  }, [user?.permissions, user?.admin_permissions]);

  const extraNavKey = useMemo(
    () => extraNavItems.map((item) => item.key).join('|'),
    [extraNavItems],
  );

  const permissions = user?.permissions || user?.admin_permissions || [];

  const snapshot = useMemo(
    () => buildSidebarSnapshot(portalId, hasPermission, permissions, extraNavItems),
    [portalId, permissionsKey, extraNavKey, hasPermission, permissions, extraNavItems],
  );

  const registerNavItems = useCallback((items) => {
    const next = Array.isArray(items) ? items : [items];
    setExtraNavItemsState((current) => {
      const map = new Map(current.map((item) => [item.key, item]));
      for (const item of next) {
        if (item?.key) map.set(item.key, item);
      }
      return [...map.values()];
    });
  }, []);

  const unregisterNavItems = useCallback((keys) => {
    const remove = new Set(Array.isArray(keys) ? keys : [keys]);
    setExtraNavItemsState((current) => current.filter((item) => !remove.has(item.key)));
  }, []);

  const value = useMemo(
    () => ({
      ...snapshot,
      registerNavItems,
      unregisterNavItems,
    }),
    [snapshot, registerNavItems, unregisterNavItems],
  );

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarNav() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebarNav must be used within SidebarProvider');
  }
  return context;
}
