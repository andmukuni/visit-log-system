import { Link } from 'react-router-dom';
import { Bell, Plus } from 'lucide-react';

export default function ExecutiveDashboardHeaderActions({
  onNewAppointment,
  unreadCount = 0,
}) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <button
        type="button"
        onClick={onNewAppointment}
        className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 sm:gap-2.5 sm:px-5 sm:text-base"
      >
        <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
        <span className="hidden sm:inline">New Appointment</span>
        <span className="sm:hidden">New</span>
      </button>
      <Link
        to="/executive/notifications"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-navy-600 transition-colors hover:bg-gray-50 hover:text-navy-900"
        aria-label={`Notifications, ${unreadCount > 9 ? '9+' : unreadCount} unread`}
      >
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        <span className="absolute -right-1 -top-1 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-xs font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      </Link>
    </div>
  );
}
