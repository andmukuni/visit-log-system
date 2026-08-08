import { Link } from 'react-router-dom';
import { Bell, Plus } from 'lucide-react';

export default function ExecutiveDashboardHeaderActions({
  onNewAppointment,
  unreadCount = 0,
}) {
  return (
    <div className="flex items-center gap-3.5">
      <button
        type="button"
        onClick={onNewAppointment}
        className="inline-flex items-center gap-3 rounded-xl bg-navy-900 px-6 py-3 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-navy-800"
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
        <span className="hidden sm:inline">New Appointment</span>
        <span className="sm:hidden">New</span>
      </button>
      <Link
        to="/executive/notifications"
        className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-navy-600 transition-colors hover:bg-gray-50 hover:text-navy-900"
        aria-label={`Notifications, ${unreadCount > 9 ? '9+' : unreadCount} unread`}
      >
        <Bell size={22} strokeWidth={2} aria-hidden="true" />
        <span className="absolute -right-1 -top-1 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-xs font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      </Link>
    </div>
  );
}
