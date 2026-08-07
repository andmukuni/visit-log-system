import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Breadcrumbs({ items = [], variant = 'page', className = '' }) {
  if (!items.length) return null;

  const isShell = variant === 'shell';

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 ${
        isShell ? 'text-sm' : 'mb-2 text-sm'
      } ${className}`}
    >
      {items.map((crumb, idx) => {
        const isLast = idx === items.length - 1;

        return (
          <span key={`${crumb.label}-${idx}`} className="flex items-center gap-1">
            {idx > 0 && (
              <ChevronRight
                size={14}
                className={isShell ? 'text-navy-300' : 'text-navy-200'}
                aria-hidden="true"
              />
            )}
            {crumb.to && !isLast ? (
              <Link
                to={crumb.to}
                className="text-navy-400 transition-colors hover:text-cyan-600"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  isShell && isLast
                    ? 'truncate text-lg font-bold tracking-tight text-navy-900'
                    : isLast
                      ? 'font-medium text-navy-600'
                      : 'text-navy-400'
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
