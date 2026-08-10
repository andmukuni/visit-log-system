import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';

/**
 * Shown on structure pages that cannot exist without an Organisation.
 */
export default function OrganisationRequiredBanner({ entityLabel = 'this structure' }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Building2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-950">Organisation required</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80 sm:text-sm">
            {entityLabel} cannot exist without an organisation. Create a company first — then add
            departments (directly under the organisation), sites, buildings, offices, stations and
            employees.
          </p>
        </div>
      </div>
      <Link
        to="/admin/organisations"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-navy-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800 sm:text-sm"
      >
        Go to Organisations
      </Link>
    </div>
  );
}
