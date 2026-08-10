import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterPageHeader } from '../../context/PageHeaderContext';
import { defaultPortalBreadcrumbs } from '../../../shared/portalNavigation.js';
import NavIcon from './NavIcon';

const PAGE_TITLE_ICON_CLASS = 'border border-navy-200 bg-white text-navy-600';
export const EMPTY_BREADCRUMBS = [];

function PageTitleIcon({ icon: Icon, iconKey, compact = false, tall = false, className = '' }) {
  if (!Icon && !iconKey) return null;

  const boxClass = compact
    ? 'h-8 w-8 rounded-lg'
    : tall
      ? 'h-12 w-12 rounded-xl'
      : 'h-10 w-10 rounded-xl';
  const iconSize = compact ? 16 : tall ? 22 : 20;

  return (
    <span
      className={`flex shrink-0 items-center justify-center shadow-sm ${boxClass} ${PAGE_TITLE_ICON_CLASS} ${className}`}
    >
      {Icon ? <Icon size={iconSize} strokeWidth={2} aria-hidden="true" /> : <NavIcon iconKey={iconKey} size={iconSize} />}
    </span>
  );
}

export function ShellPageTitle({ title, subtitle, iconKey, compact = false }) {
  if (!title && !subtitle) return null;

  return (
    <div className="min-w-0 flex-1">
      <div className={`flex min-w-0 items-center ${compact ? 'gap-2' : 'gap-2.5'}`}>
        {iconKey ? <PageTitleIcon iconKey={iconKey} compact /> : null}
        <div className="min-w-0">
          {title ? (
            <h1 className={`truncate font-bold leading-tight text-navy-900 ${
              compact ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl'
            }`}
            >
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className={`truncate text-navy-400 ${compact ? 'text-[11px] sm:text-xs' : 'text-sm sm:text-base'}`}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  icon: Icon,
  iconKey,
}) {
  const location = useLocation();
  const shellBreadcrumbs = useMemo(() => {
    if (Array.isArray(breadcrumbs) && breadcrumbs.length > 0) return breadcrumbs;
    return defaultPortalBreadcrumbs(location.pathname, title);
  }, [breadcrumbs, location.pathname, title]);

  // Breadcrumbs stay in the shell header; title, subtitle and actions render on the page.
  useRegisterPageHeader({
    title: '',
    subtitle: '',
    breadcrumbs: shellBreadcrumbs,
    actions: null,
    iconKey: '',
  });

  if (!title && !subtitle && !Icon && !iconKey && !actions) return null;

  return (
    <div className="mb-1 flex min-w-0 items-start justify-between gap-3 sm:mb-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {(Icon || iconKey) ? <PageTitleIcon icon={Icon} iconKey={iconKey} /> : null}
        <div className="min-w-0">
          {title ? (
            <h1 className="truncate text-xl font-bold leading-tight text-navy-900 sm:text-2xl">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-navy-400 sm:text-base">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export { PageTitleIcon };
