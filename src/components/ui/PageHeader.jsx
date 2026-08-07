import { useRegisterPageHeader } from '../../context/PageHeaderContext';
import Breadcrumbs from './Breadcrumbs';
import NavIcon from './NavIcon';

const PAGE_TITLE_ICON_CLASS = 'border border-navy-200 bg-white text-navy-600';

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

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  icon,
  iconKey,
}) {
  useRegisterPageHeader({ title, subtitle, breadcrumbs, actions, iconKey });

  const hasTitleBlock = Boolean(title || subtitle);

  return (
    <div className="mb-6">
      <Breadcrumbs items={breadcrumbs} variant="page" />
      {hasTitleBlock && (
        <div
          className={`mt-1 grid gap-x-3 gap-y-0.5 ${
            title && subtitle
              ? 'grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto] items-center'
              : 'grid-cols-[auto_minmax(0,1fr)] items-center'
          }`}
        >
          {(icon || iconKey) && (
            <PageTitleIcon
              icon={icon}
              iconKey={iconKey}
              tall={Boolean(title && subtitle)}
              className={title && subtitle ? 'row-span-2 self-center' : undefined}
            />
          )}
          {title && (
            <h1 className={`text-2xl font-bold text-navy-900 ${title && subtitle ? 'col-start-2 row-start-1' : 'col-start-2'}`}>
              {title}
            </h1>
          )}
          {subtitle && (
            <p className={`text-sm text-navy-400 ${title ? 'col-start-2 row-start-2' : 'col-start-2'}`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { PageTitleIcon };
