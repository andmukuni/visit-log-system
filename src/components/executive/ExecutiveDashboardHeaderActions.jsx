import { Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ExecutiveDashboardHeaderActions({
  onNewAppointment,
}) {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('executive.appointments');

  if (!canCreate) return null;

  return (
    <button
      type="button"
      onClick={onNewAppointment}
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 sm:px-3"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="hidden sm:inline">New Appointment</span>
      <span className="sm:hidden">New</span>
    </button>
  );
}
