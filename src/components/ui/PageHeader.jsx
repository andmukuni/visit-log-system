import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRegisterPageHeader } from '../../context/PageHeaderContext';

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
}) {
  useRegisterPageHeader({ title, actions });

  const hasBreadcrumbs = breadcrumbs.length > 0;
  const hasSubtitle = Boolean(subtitle);

  if (!hasBreadcrumbs && !hasSubtitle) {
    return null;
  }

  return (
    <div className="mb-6">
      {hasBreadcrumbs && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-gray-400 mb-2 overflow-x-auto whitespace-nowrap pb-1">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight size={14} className="text-gray-300" />}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-gray-700 transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-600 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      {hasSubtitle && (
        <p className="text-sm text-gray-500">{subtitle}</p>
      )}
    </div>
  );
}
