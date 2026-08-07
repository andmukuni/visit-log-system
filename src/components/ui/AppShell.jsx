import { useEffect, useState, Suspense } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import AdminUserMenu from '../admin/AdminUserMenu';
import NavIcon from './NavIcon';
import Breadcrumbs from './Breadcrumbs';
import { getKpiAccentClass } from './PortalKpiCard';
import { useAuth } from '../../context/AuthContext';
import { AnalyticsPanelProvider, useAnalyticsPanel } from '../../context/AnalyticsPanelContext';
import { PageHeaderProvider, usePageHeaderState } from '../../context/PageHeaderContext';
import { PORTALS, getVisibleNavItems, groupNavItems, getAccessiblePortals } from '../../../shared/portalNavigation.js';
import { PORTAL_ICONS } from '../../../shared/navIcons.js';

function PortalOutletLoader() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        <p className="text-sm text-gray-500">Loading page…</p>
      </div>
    </div>
  );
}

function SidebarNavIcon({ iconKey, isActive, accentIndex = 0 }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm transition-colors ${
        isActive
          ? getKpiAccentClass(accentIndex)
          : 'border border-navy-700 bg-navy-900 text-navy-400 group-hover:border-navy-600 group-hover:bg-navy-800 group-hover:text-navy-200'
      }`}
    >
      <NavIcon iconKey={iconKey} size={16} />
    </span>
  );
}

function SidebarNavLink({ item, onNavigate, accentIndex = 0 }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={() => onNavigate?.()}
      aria-label={item.name}
      className={({ isActive }) =>
        `group flex items-center gap-3 -mx-4 py-2.5 pl-7 pr-4 text-sm font-medium transition-colors rounded-r-xl ${
          isActive
            ? 'bg-cyan-600/10 text-cyan-400'
            : 'text-navy-300 hover:bg-navy-800 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <SidebarNavIcon iconKey={item.key} isActive={isActive} accentIndex={accentIndex} />
          <span className="truncate">{item.name}</span>
        </>
      )}
    </NavLink>
  );
}

function PortalSwitcher({ currentPortalId, hasPermission, onNavigate }) {
  const accessible = getAccessiblePortals(hasPermission).filter((p) => p.id !== currentPortalId);
  if (accessible.length === 0) return null;

  return (
    <div className="pt-4 mt-4 border-t border-navy-800">
      <p className="px-3 text-[10px] font-semibold text-navy-500 uppercase tracking-wider mb-2">
        Switch Portal
      </p>
      <div className="space-y-1">
        {accessible.map((portal) => (
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
}

function SidebarNavSection({ label, items, onNavigate, bordered = false }) {
  if (!items.length) return null;

  return (
    <div className={bordered ? 'pt-4 mt-4 border-t border-navy-800' : undefined}>
      <p className="px-3 text-[10px] font-semibold text-navy-500 uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="space-y-1">
        {items.map((item, index) => (
          <SidebarNavLink key={item.key} item={item} accentIndex={index} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

function ShellBody({ portalId, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const { content, collapsed } = useAnalyticsPanel();
  const { header: pageHeader } = usePageHeaderState();

  const navItems = getVisibleNavItems(portalId, hasPermission);
  const { primary, system, settings } = groupNavItems(navItems);
  const closeSidebar = () => setSidebarOpen(false);
  const portalMeta = PORTALS[portalId];
  const portalLabel = portalMeta?.label || title;
  const sectionLabels = portalMeta?.navSections || { primary: 'Overview', system: 'System' };

  useEffect(() => {
    if (!sidebarOpen) {
      document.body.style.overflow = '';
      return;
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-navy-50">
      <aside
        className={`theme-fixed fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col bg-navy-950 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-navy-800">
          <Link to={PORTALS[portalId]?.routePrefix || '/'} aria-label={title} className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/95 p-1">
              <img
                src="/images/logo.png"
                alt=""
                width={32}
                height={32}
                decoding="async"
                className="h-full w-full object-contain"
              />
            </span>
            <div className="min-w-0">
              <span className="text-white font-semibold text-sm block leading-tight truncate">
                Visitors Log
              </span>
              <span className="text-navy-400 text-[10px] block leading-tight truncate">
                {portalLabel}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-navy-800 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <SidebarNavSection label={sectionLabels.primary} items={primary} onNavigate={closeSidebar} />
          {sectionLabels.system && (
            <SidebarNavSection
              label={sectionLabels.system}
              items={system}
              onNavigate={closeSidebar}
              bordered
            />
          )}
          <PortalSwitcher
            currentPortalId={portalId}
            hasPermission={hasPermission}
            onNavigate={closeSidebar}
          />
        </nav>

        {settings.length > 0 && (
          <div className="shrink-0 border-t border-navy-800 p-4 space-y-1">
            {settings.map((item, index) => (
              <SidebarNavLink key={item.key} item={item} accentIndex={index} onNavigate={closeSidebar} />
            ))}
          </div>
        )}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="md:ml-[var(--sidebar-width)] flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-navy-100 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg text-navy-500 hover:bg-navy-100 hover:text-navy-700 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            {pageHeader.breadcrumbs?.length > 0 ? (
              <Breadcrumbs items={pageHeader.breadcrumbs} variant="shell" className="min-w-0 flex-1" />
            ) : pageHeader.title ? (
              <h1 className="truncate text-lg font-bold tracking-tight text-navy-900">
                {pageHeader.title}
              </h1>
            ) : (
              <div className="hidden md:block">
                <p className="text-sm text-navy-400">
                  Welcome back,{' '}
                  <span className="font-medium text-navy-700">{user?.name?.split(' ')[0] || 'there'}</span>
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pageHeader.actions}
            <AdminUserMenu />
          </div>
        </header>

        <div className="flex flex-1">
          <main className="min-w-0 flex-1 overflow-x-clip">
            <div className="p-4 sm:p-6 lg:px-8 pb-6 pt-4">
              <Suspense fallback={<PortalOutletLoader />}>
                <Outlet key={location.pathname} />
              </Suspense>
            </div>
          </main>

          {content && !collapsed && (
            <aside className="hidden xl:block w-[var(--panel-width)] shrink-0 p-4 pl-0">
              <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto space-y-4">
                {content}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppShell(props) {
  return (
    <AnalyticsPanelProvider>
      <PageHeaderProvider>
        <ShellBody {...props} />
      </PageHeaderProvider>
    </AnalyticsPanelProvider>
  );
}
