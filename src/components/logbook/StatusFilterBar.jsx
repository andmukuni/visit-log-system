import { FilterPills } from '../ui';

export default function StatusFilterBar({
  options,
  value,
  onChange,
  label = 'Filter by status',
  className = '',
  embedded = false,
}) {
  const content = (
    <div className="flex flex-col gap-3 bg-gray-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="shrink-0 text-sm font-medium text-navy-600">{label}</p>
      <div className="min-w-0 overflow-x-auto">
        <FilterPills
          variant="outline"
          size="sm"
          className="min-w-max"
          options={options}
          value={value}
          onChange={onChange}
        />
      </div>
    </div>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div className={`mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {content}
    </div>
  );
}
