import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, X } from 'lucide-react';
import NavIcon from './NavIcon';
import { getKpiAccentBgClass } from './PortalKpiCard';
import { PORTAL_ICONS } from '../../../shared/navIcons.js';
import { PORTALS } from '../../../shared/portalNavigation.js';
import { APP_NAME, SIDEBAR_BRAND_NAME, LOGO_PATH } from '../../../shared/branding.js';
import { useSidebarNav } from '../../context/SidebarContext';
import { useAuth } from '../../context/AuthContext';
import { notificationsApi } from '../../utils/visitorApi';

const SidebarNavIcon = memo(function SidebarNavIcon({ iconKey, isActive, accentIndex = 0, executiveTheme = false }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm transition-colors ${
        isActive
          ? executiveTheme
            ? 'bg-amber-400/20 text-amber-300'
            : `${getKpiAccentBgClass(accentIndex)} text-navy-950`
          : 'border border-navy-700 bg-navy-900 text-navy-400 group-hover:border-navy-600 group-hover:bg-navy-800 group-hover:text-navy-200'
      }`}
    >
      <NavIcon iconKey={iconKey} size={16} />
    </span>
  );
});

const SidebarNavLink = memo(function SidebarNavLink({
  item,
  onNavigate,
  accentIndex = 0,
  executiveTheme = false,
  badgeCount = 0,
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={() => onNavigate?.()}
      aria-label={item.name}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 -mx-4 py-2.5 pl-7 pr-4 text-sm font-medium transition-colors rounded-r-xl ${
          isActive
            ? executiveTheme
              ? 'bg-navy-900/80 text-amber-300 before:absolute before:left-0 before:top-1/2 before:h-8 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-amber-400'
              : 'bg-cyan-600/10 text-cyan-400'
            : 'text-navy-300 hover:bg-navy-800 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <SidebarNavIcon
            iconKey={item.key}
            isActive={isActive}
            accentIndex={accentIndex}
            executiveTheme={executiveTheme}
          />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {badgeCount > 0 ? (
            <span className="ml-auto inline-flex min-h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#1a73e8] px-1.5 text-[10px] font-bold text-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          ) : isActive && !executiveTheme ? (
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-cyan-400" aria-hidden="true" />
          ) : null}
        </>
      )}
    </NavLink>
  );
});

const SidebarNavSection = memo(function SidebarNavSection({
  label,
  items,
  onNavigate,
  bordered = false,
  executiveTheme = false,
  notificationBadgeCount = 0,
}) {
  if (!items.length) return null;

  return (
    <div className={bordered ? 'pt-4 mt-4 border-t border-navy-800' : undefined}>
      {label ? (
        <p className="px-3 text-[10px] font-semibold text-navy-500 uppercase tracking-wider mb-2">
          {label}
        </p>
      ) : null}
      <div className="space-y-1">
        {items.map((item, index) => (
          <SidebarNavLink
            key={item.key}
            item={item}
            accentIndex={index}
            onNavigate={onNavigate}
            executiveTheme={executiveTheme}
            badgeCount={item.badgeKey === 'notifications' ? notificationBadgeCount : 0}
          />
        ))}
      </div>
    </div>
  );
});

const PortalSwitcher = memo(function PortalSwitcher({ accessiblePortals, onNavigate }) {
  if (accessiblePortals.length === 0) return null;

  return (
    <div className="pt-4 mt-4 border-t border-navy-800">
      <p className="px-3 text-[10px] font-semibold text-navy-500 uppercase tracking-wider mb-2">
        Switch Portal
      </p>
      <div className="space-y-1">
        {accessiblePortals.map((portal) => (
          <Link
            key={portal.id}
            to={portal.routePrefix}
            onClick={() => onNavigate?.()}
            className="group flex items-center gap-3 -mx-4 py-2.5 pl-7 pr-4 text-sm font-medium text-navy-300 transition-colors rounded-r-xl hover:bg-navy-800 hover:text-white"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-navy-700 bg-navy-900 text-navy-400 shadow-sm transition-colors group-hover:border-navy-600 group-hover:bg-navy-800 group-hover:text-navy-200">
              <NavIcon name={PORTAL_ICONS[portal.id]} size={16} />
            </span>
            <span className="truncate">{portal.label.replace(/ Portal$/, '')}</span>
          </Link>
        ))}
      </div>
    </div>
  );
});

function getUserInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

const SidebarUserProfile = memo(function SidebarUserProfile({ onNavigate, executiveTheme = false, roleLabel = '' }) {
  const { user, logout } = useAuth();
  const { portalId } = useSidebarNav();
  const navigate = useNavigate();

  if (!user) return null;

  const displayName = user.name || 'User';
  const portalLabel = PORTALS[portalId]?.label?.replace(/ Portal$/, '') || 'Portal';
  const subtitle = executiveTheme && roleLabel ? roleLabel : user.email;
  const metaLabel = executiveTheme ? portalLabel : portalLabel;

  const handleLogout = () => {
    onNavigate?.();
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="sticky bottom-0 z-20 shrink-0 border-t border-navy-800 bg-navy-950 p-4">
      <div className="flex items-center gap-3 rounded-xl border border-navy-800 bg-navy-900/70 p-3 shadow-sm">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-inner ${
          executiveTheme ? 'bg-navy-800 ring-2 ring-amber-400/30' : 'bg-gradient-to-br from-cyan-500 to-navy-700'
        }`}>
          {getUserInitials(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{displayName}</p>
          <p className="truncate text-xs text-navy-400">{subtitle}</p>
          {!executiveTheme && (
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-cyan-400/90">
              {metaLabel}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 rounded-lg p-2 text-navy-400 transition-colors hover:bg-navy-800 hover:text-red-300"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
});

function SidebarScrollNav({ navRevision, children }) {
  const navRef = useRef(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollHint = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight + 4;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
    setCanScrollDown(hasOverflow && !atBottom);
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return undefined;

    updateScrollHint();
    el.addEventListener('scroll', updateScrollHint, { passive: true });
    window.addEventListener('resize', updateScrollHint);

    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollHint);
      window.removeEventListener('resize', updateScrollHint);
      observer.disconnect();
    };
  }, [updateScrollHint, navRevision]);

  const scrollDown = () => {
    const el = navRef.current;
    if (!el) return;
    el.scrollBy({ top: Math.max(el.clientHeight * 0.75, 120), behavior: 'smooth' });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <nav
        ref={navRef}
        className="scrollbar-hide flex-1 space-y-1 overflow-y-auto px-4 py-4"
      >
        {children}
      </nav>

      {canScrollDown && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-navy-950 from-40% via-navy-950/80 to-transparent px-4 pb-2 pt-10">
          <button
            type="button"
            onClick={scrollDown}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-navy-700/90 bg-navy-900/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-navy-300 shadow-lg backdrop-blur-sm transition-colors hover:border-cyan-600/40 hover:bg-navy-800 hover:text-cyan-300"
            aria-label="Scroll to more navigation links"
          >
            <ChevronDown size={14} className="shrink-0 animate-bounce text-cyan-400" aria-hidden="true" />
            <span>More links below</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AppSidebar({ title, sidebarOpen, onCloseSidebar }) {
  const {
    routePrefix,
    primary,
    system,
    settings,
    accessiblePortals,
    sectionLabels,
    navRevision,
    portalId,
  } = useSidebarNav();
  const { user } = useAuth();
  const executiveTheme = portalId === 'executive';
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);

  useEffect(() => {
    if (!executiveTheme) {
      setNotificationBadgeCount(0);
      return undefined;
    }

    let cancelled = false;
    notificationsApi.list(true)
      .then((rows) => {
        if (!cancelled) setNotificationBadgeCount(Array.isArray(rows) ? rows.length : 0);
      })
      .catch(() => {
        if (!cancelled) setNotificationBadgeCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [executiveTheme, navRevision]);

  const executiveRoleLabel = (() => {
    const name = String(user?.name || '').toUpperCase();
    if (name.includes('DCEO')) return 'Deputy CEO';
    if (name.includes('CEO')) return 'Chief Executive Officer';
    return 'Executive';
  })();

  return (
    <aside
      className={`theme-fixed fixed inset-y-0 left-0 z-50 flex min-h-0 w-[var(--sidebar-width)] flex-col bg-navy-950 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      <div className={`flex items-center justify-between border-b border-navy-800 px-6 ${executiveTheme ? 'min-h-16 py-3' : 'h-16'}`}>
        <Link to={routePrefix} aria-label={executiveTheme ? 'Visitor Management Executive Portal' : (title || APP_NAME)} className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img
              src={LOGO_PATH}
              alt=""
              width={40}
              height={40}
              decoding="async"
              className="h-full w-full object-contain"
            />
          </span>
          {executiveTheme ? (
            <span className="min-w-0 leading-none">
              <span className="block text-[13px] font-bold uppercase tracking-[0.08em] text-white">Visitor</span>
              <span className="block text-[13px] font-bold uppercase tracking-[0.08em] text-white">Management</span>
              <span className="mt-1 block text-[11px] font-medium tracking-wide text-amber-400">Executive Portal</span>
            </span>
          ) : (
            <span className="truncate text-3xl font-black uppercase leading-none tracking-tight text-white">
              {SIDEBAR_BRAND_NAME}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onCloseSidebar}
          className="md:hidden p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-navy-800 transition-colors"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <SidebarScrollNav navRevision={navRevision}>
        <SidebarNavSection
          label={sectionLabels.primary}
          items={primary}
          onNavigate={onCloseSidebar}
          executiveTheme={executiveTheme}
          notificationBadgeCount={notificationBadgeCount}
        />
        {sectionLabels.system && (
          <SidebarNavSection
            label={sectionLabels.system}
            items={system}
            onNavigate={onCloseSidebar}
            bordered
            executiveTheme={executiveTheme}
            notificationBadgeCount={notificationBadgeCount}
          />
        )}
        <PortalSwitcher accessiblePortals={accessiblePortals} onNavigate={onCloseSidebar} />
      </SidebarScrollNav>

      <SidebarUserProfile
        onNavigate={onCloseSidebar}
        executiveTheme={executiveTheme}
        roleLabel={executiveRoleLabel}
      />

      {settings.length > 0 && (
        <div className="shrink-0 border-t border-navy-800 p-4 space-y-1">
          {settings.map((item, index) => (
            <SidebarNavLink
              key={item.key}
              item={item}
              accentIndex={index}
              onNavigate={onCloseSidebar}
              executiveTheme={executiveTheme}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

export default memo(AppSidebar);
