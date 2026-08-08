import { useRegisterPageHeader } from '../../context/PageHeaderContext';
import NavIcon from './NavIcon';

const PAGE_TITLE_ICON_CLASS = 'border border-navy-200 bg-white text-navy-600';
const EMPTY_BREADCRUMBS = [];

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

export function ShellPageTitle({ title, subtitle, iconKey }) {
  if (!title && !subtitle) return null;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2.5">
        {iconKey ? <PageTitleIcon iconKey={iconKey} compact /> : null}
        <div className="min-w-0">
          {title ? (
            <h1 className="truncate text-2xl font-bold leading-tight text-navy-900 sm:text-[1.75rem]">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="truncate text-base text-navy-400 sm:text-lg">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs: _breadcrumbs = EMPTY_BREADCRUMBS,
  actions,
  icon: _icon,
  iconKey,
}) {
  useRegisterPageHeader({
    title,
    subtitle,
    breadcrumbs: EMPTY_BREADCRUMBS,
    actions,
    iconKey,
  });

  return null;
}

export { PageTitleIcon };
