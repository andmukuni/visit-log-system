import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRegisterPageHeader } from '../../context/PageHeaderContext';
import { defaultPortalBreadcrumbs } from '../../../shared/portalNavigation.js';

/**
 * Dashboard header — same shell pattern as PageHeader:
 * breadcrumbs in top nav, title + actions on the page.
 */
export default function OverviewHeader({
  title = 'Overview',
  subtitle,
  actions,
}) {
  const { user } = useAuth();
  const location = useLocation();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = subtitle || `Hi ${firstName}, welcome back.`;

  const breadcrumbs = useMemo(
    () => defaultPortalBreadcrumbs(location.pathname, title),
    [location.pathname, title],
  );

  useRegisterPageHeader({
    title: '',
    subtitle: '',
    breadcrumbs,
    actions: null,
    iconKey: '',
  });

  return (
    <div className="mb-4 flex min-w-0 items-start justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold leading-tight text-navy-900 sm:text-2xl">
          {title}
        </h1>
        <p className="mt-0.5 truncate text-sm text-navy-400 sm:text-base">{greeting}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
