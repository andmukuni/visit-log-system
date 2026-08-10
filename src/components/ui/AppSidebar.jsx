import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ChevronDown, X } from 'lucide-react';
import NavIcon from './NavIcon';
import { getKpiAccentBgClass } from './PortalKpiCard';
import { PORTALS } from '../../../shared/portalNavigation.js';
import { APP_NAME, LOGO_PATH } from '../../../shared/branding.js';
import { useSidebarNav } from '../../context/SidebarContext';
import { notificationsApi, visitorApi } from '../../utils/visitorApi';

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
  badgeCount = null,
}) {
  const resolveActiveState = (navIsActive) => {
    if (item.sharedRouteKey && !item.isPrimaryRoute && navIsActive) return false;
    return navIsActive;
  };
  const countValue = badgeCount != null && Number.isFinite(Number(badgeCount)) ? Number(badgeCount) : null;
  const showCountBadge = countValue != null && (item.badgeKey === 'notifications' ? countValue > 0 : true);

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={() => onNavigate?.()}
      aria-label={item.name}
      className={({ isActive }) => {
        const active = resolveActiveState(isActive);
        return `group relative flex items-center gap-3 -mx-4 py-2.5 pl-7 pr-4 text-sm font-medium transition-colors rounded-r-xl ${
          active
            ? executiveTheme
              ? 'bg-navy-900/80 text-amber-300 before:absolute before:left-0 before:top-1/2 before:h-8 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-amber-400'
              : 'bg-cyan-600/10 text-cyan-400'
            : 'text-navy-300 hover:bg-navy-800 hover:text-white'
        }`;
      }}
    >
      {({ isActive }) => {
        const active = resolveActiveState(isActive);
        return (
        <>
          <SidebarNavIcon
            iconKey={item.key}
            isActive={active}
            accentIndex={accentIndex}
            executiveTheme={executiveTheme}
          />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {showCountBadge ? (
            <span className="ml-auto inline-flex min-h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#1a73e8] px-1.5 text-[10px] font-bold text-white">
              {countValue > 99 ? '99+' : countValue}
            </span>
          ) : active && !executiveTheme ? (
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-cyan-400" aria-hidden="true" />
          ) : null}
        </>
        );
      }}
    </NavLink>
  );
});

const SidebarNavSection = memo(function SidebarNavSection({
  label,
  items,
  onNavigate,
  bordered = false,
  executiveTheme = false,
  badgeCounts = {},
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
            badgeCount={item.badgeKey ? badgeCounts[item.badgeKey] ?? null : null}
          />
        ))}
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
    organisation = [],
    system,
    settings,
    sectionLabels,
    navRevision,
    portalId,
  } = useSidebarNav();
  const executiveTheme = portalId === 'executive';
  const [badgeCounts, setBadgeCounts] = useState({});

  useEffect(() => {
    let cancelled = false;

    if (executiveTheme) {
      notificationsApi.list(true)
        .then((rows) => {
          if (!cancelled) {
            setBadgeCounts({ notifications: Array.isArray(rows) ? rows.length : 0 });
          }
        })
        .catch(() => {
          if (!cancelled) setBadgeCounts({ notifications: 0 });
        });
      return () => {
        cancelled = true;
      };
    }

    if (portalId === 'admin') {
      visitorApi.getOrgNavCounts()
        .then((data) => {
          if (!cancelled) setBadgeCounts(data && typeof data === 'object' ? data : {});
        })
        .catch(() => {
          if (!cancelled) setBadgeCounts({});
        });
      return () => {
        cancelled = true;
      };
    }

    setBadgeCounts({});
    return undefined;
  }, [executiveTheme, portalId, navRevision]);

  const portalLabel = PORTALS[portalId]?.label || title || APP_NAME;

  return (
    <aside
      className={`theme-fixed fixed inset-y-0 left-0 z-50 flex min-h-0 w-[var(--sidebar-width)] flex-col bg-navy-950 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      <div className={`flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-navy-800 ${
        executiveTheme ? 'px-3 sm:px-4' : 'px-4 sm:px-5'
      }`}
      >
        <Link
          to={routePrefix}
          aria-label={`Visitor Management, ${portalLabel}`}
          className="flex min-w-0 items-center gap-2.5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img
              src={LOGO_PATH}
              alt=""
              width={36}
              height={36}
              decoding="async"
              className="h-full w-full object-contain"
            />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black uppercase leading-[1.05] tracking-[0.04em] text-white">
              Visitor
            </span>
            <span className="block text-[11px] font-black uppercase leading-[1.05] tracking-[0.04em] text-white">
              Management
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-medium leading-none text-amber-400">
              {portalLabel}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onCloseSidebar}
          className={`md:hidden rounded-lg text-navy-400 transition-colors hover:bg-navy-800 hover:text-white ${
            executiveTheme ? 'p-1' : 'p-1.5'
          }`}
          aria-label="Close menu"
        >
          <X size={executiveTheme ? 16 : 18} />
        </button>
      </div>

      <SidebarScrollNav navRevision={navRevision}>
        <SidebarNavSection
          label={sectionLabels.primary}
          items={primary}
          onNavigate={onCloseSidebar}
          executiveTheme={executiveTheme}
          badgeCounts={badgeCounts}
        />
        {sectionLabels.organisation && organisation.length > 0 && (
          <SidebarNavSection
            label={sectionLabels.organisation}
            items={organisation}
            onNavigate={onCloseSidebar}
            bordered
            executiveTheme={executiveTheme}
            badgeCounts={badgeCounts}
          />
        )}
        {sectionLabels.system && (
          <SidebarNavSection
            label={sectionLabels.system}
            items={system}
            onNavigate={onCloseSidebar}
            bordered
            executiveTheme={executiveTheme}
            badgeCounts={badgeCounts}
          />
        )}
      </SidebarScrollNav>

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
