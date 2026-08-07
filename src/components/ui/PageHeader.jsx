import { useRegisterPageHeader } from '../../context/PageHeaderContext';
import Breadcrumbs from './Breadcrumbs';

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
}) {
  useRegisterPageHeader({ title, subtitle, breadcrumbs, actions });

  return (
    <div className="mb-6">
      <Breadcrumbs items={breadcrumbs} variant="page" />
      {title && <h1 className="text-2xl font-bold text-navy-900">{title}</h1>}
      {subtitle && <p className="mt-1 text-sm text-navy-400">{subtitle}</p>}
    </div>
  );
}
