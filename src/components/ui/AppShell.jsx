import { useCallback, useEffect, useState, Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import AdminUserMenu from '../admin/AdminUserMenu';
import Breadcrumbs from './Breadcrumbs';
import AppSidebar from './AppSidebar';
import { useAuth } from '../../context/AuthContext';
import { AnalyticsPanelProvider, useAnalyticsPanel } from '../../context/AnalyticsPanelContext';
import { PageHeaderProvider, usePageHeaderState } from '../../context/PageHeaderContext';
import { SidebarProvider } from '../../context/SidebarContext';
import { canAccessPortal, isExecutiveOnlyUser, resolvePortalRoute } from '../../../shared/portalNavigation.js';

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

function getShellBreadcrumbs() {
  return [];
}

function ShellMain({ portalId, sidebarOpen, onOpenSidebar, onCloseSidebar }) {
  const location = useLocation();
  const { user } = useAuth();
  const { content, collapsed } = useAnalyticsPanel();
  const { header: pageHeader } = usePageHeaderState();
  const shellBreadcrumbs = getShellBreadcrumbs();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm md:hidden"
          onClick={onCloseSidebar}
          aria-hidden="true"
        />
      )}

      <div className="md:ml-[var(--sidebar-width)] flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-navy-100 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="md:hidden p-2 rounded-lg text-navy-500 hover:bg-navy-100 hover:text-navy-700 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            {shellBreadcrumbs.length > 0 ? (
              <Breadcrumbs items={shellBreadcrumbs} variant="shell" className="min-w-0 flex-1" />
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
                <Outlet />
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
    </>
  );
}

function ShellBody({ portalId, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const navigate = useNavigate();
  const { permissions, hasPermission } = useAuth();

  useEffect(() => {
    if (!permissions.length) return;
    if (isExecutiveOnlyUser(permissions) && portalId === 'management') {
      navigate('/executive', { replace: true });
      return;
    }
    if (!canAccessPortal(portalId, hasPermission, permissions)) {
      navigate(resolvePortalRoute(permissions), { replace: true });
    }
  }, [portalId, permissions, hasPermission, navigate]);

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
    <SidebarProvider portalId={portalId}>
      <div className="min-h-screen bg-navy-50">
        <AppSidebar
          title={title}
          sidebarOpen={sidebarOpen}
          onCloseSidebar={closeSidebar}
        />

        <AnalyticsPanelProvider>
          <PageHeaderProvider>
            <ShellMain
              portalId={portalId}
              sidebarOpen={sidebarOpen}
              onOpenSidebar={openSidebar}
              onCloseSidebar={closeSidebar}
            />
          </PageHeaderProvider>
        </AnalyticsPanelProvider>
      </div>
    </SidebarProvider>
  );
}

export default function AppShell(props) {
  return <ShellBody {...props} />;
}
