import { Building2 } from 'lucide-react';
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';
import { ADMIN_ORG_FILTER_ALL } from '../../../shared/adminOrganisationAccess.js';

export default function AdminOrganisationSelect({ className = '', compact = false }) {
  const {
    canSelect,
    loading,
    organisations,
    organisationId,
    setOrganisationId,
  } = useAdminOrganisation();

  if (!canSelect) return null;

  return (
    <label
      className={`inline-flex min-w-0 items-center gap-2 rounded-xl border border-navy-200 bg-white ${
        compact ? 'h-9 px-2.5' : 'h-10 px-3'
      } ${className}`}
    >
      <Building2 size={compact ? 14 : 16} className="shrink-0 text-cyan-700" aria-hidden="true" />
      <span className="sr-only">Organisation</span>
      <select
        value={organisationId}
        onChange={(e) => setOrganisationId(e.target.value)}
        disabled={loading}
        className={`min-w-0 max-w-[11rem] truncate bg-transparent text-navy-800 outline-none sm:max-w-[16rem] ${
          compact ? 'text-xs' : 'text-sm'
        } font-medium`}
        aria-label="Filter by organisation"
      >
        <option value={ADMIN_ORG_FILTER_ALL}>All organisations</option>
        {organisations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </label>
  );
}
