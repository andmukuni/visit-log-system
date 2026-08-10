import { Link } from 'react-router-dom';
import { Bell, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ExecutiveDashboardHeaderActions({
  onNewAppointment,
  unreadCount = 0,
}) {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('executive.appointments');

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {canCreate ? (
        <button
          type="button"
          onClick={onNewAppointment}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 sm:px-3"
        >
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          <span className="hidden sm:inline">New Appointment</span>
          <span className="sm:hidden">New</span>
        </button>
      ) : null}
      <Link
        to="/host/notifications"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-navy-600 transition-colors hover:bg-gray-50 hover:text-navy-900"
        aria-label={`Notifications, ${unreadCount > 9 ? '9+' : unreadCount} unread`}
      >
        <Bell size={16} strokeWidth={2} aria-hidden="true" />
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      </Link>
    </div>
  );
}
