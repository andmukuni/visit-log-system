/**
 * Whether an admin session may view / switch across organisations.
 * Mirrors server hasPlatformWideAccess (super_admin / platform.* / legacy admin).
 */
export function canSelectAdminOrganisation(user = {}, hasPermission = () => false) {
  if (!user) return false;
  const perms = user.permissions || user.admin_permissions || [];
  if (user.role === 'admin' && perms.length === 0) return true;
  if (typeof hasPermission === 'function') {
    if (hasPermission('super_admin') || hasPermission('*')) return true;
  }
  return perms.some((p) => String(p).startsWith('platform.') || p === 'super_admin' || p === '*');
}

export const ADMIN_ORG_FILTER_STORAGE_KEY = 'mm_admin_organisation_id';
export const ADMIN_ORG_FILTER_ALL = '';
