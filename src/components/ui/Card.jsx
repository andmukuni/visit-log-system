export default function Card({
  title,
  subtitle,
  actions,
  children,
  footer,
  noPadding = false,
  className = '',
}) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50 px-5 py-3.5">
          <div>
            {title && <h3 className="text-sm font-semibold text-navy-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}

      <div className={noPadding ? '' : 'p-5'}>{children}</div>

      {footer && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">{footer}</div>
      )}
    </div>
  );
}
