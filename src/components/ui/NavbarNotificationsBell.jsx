import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationsApi } from '../../utils/visitorApi';

export default function NavbarNotificationsBell({ to = '/host/notifications', compact = false }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    notificationsApi.list(true)
      .then((rows) => {
        if (!cancelled) setUnreadCount(Array.isArray(rows) ? rows.length : 0);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const badgeLabel = unreadCount > 9 ? '9+' : unreadCount;

  return (
    <Link
      to={to}
      className={`relative inline-flex items-center justify-center rounded-lg border border-navy-200 bg-white text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900 ${
        compact ? 'h-8 w-8' : 'h-9 w-9'
      }`}
      aria-label={unreadCount > 0 ? `Notifications, ${badgeLabel} unread` : 'Notifications'}
    >
      <Bell size={compact ? 16 : 18} strokeWidth={2} aria-hidden="true" />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white">
          {badgeLabel}
        </span>
      ) : null}
    </Link>
  );
}
