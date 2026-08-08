import { Link } from 'react-router-dom';
import { Bell, Plus } from 'lucide-react';

export default function ExecutiveDashboardHeaderActions({
  onNewAppointment,
  unreadCount = 0,
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onNewAppointment}
        className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800"
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
        <span className="hidden sm:inline">New Appointment</span>
        <span className="sm:hidden">New</span>
      </button>
      <Link
        to="/executive/notifications"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-navy-600 transition-colors hover:bg-gray-50 hover:text-navy-900"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={18} strokeWidth={2} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>
    </div>
  );
}
