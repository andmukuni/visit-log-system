import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate, useNavigation } from 'react-router-dom';
import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import AdminUserMenu from '../admin/AdminUserMenu';
import Breadcrumbs from './Breadcrumbs';
import AppSidebar from './AppSidebar';
import PortalSwitcherMenu from './PortalSwitcherMenu';
import NavbarNotificationsBell from './NavbarNotificationsBell';
import PwaInstallBanner from '../pwa/PwaInstallBanner';
import PwaPushPrompt, { shouldShowPushPrompt, writePromptState } from '../pwa/PwaPushPrompt';
import { ShellPageTitle } from './PageHeader';
import { useAuth } from '../../context/AuthContext';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { subscribeToPushNotifications } from '../../pwa/pushNotifications';
import { notificationsApi } from '../../utils/visitorApi';
import { useToast } from '../../context/ToastContext';
import { AdminOrganisationProvider } from '../../context/AdminOrganisationContext';
import { AnalyticsPanelProvider, useAnalyticsPanel } from '../../context/AnalyticsPanelContext';
import { PageHeaderProvider, usePageHeaderState } from '../../context/PageHeaderContext';
import { SidebarProvider } from '../../context/SidebarContext';
import AdminOrganisationSelect from '../admin/AdminOrganisationSelect';
import {
  canAccessPortal,
  isExecutiveOnlyUser,
  isHostOnlyUser,
  resolveDefaultHomeRoute,
} from '../../../shared/portalNavigation.js';

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

function isGateEntryKiosk(pathname) {
  return pathname.endsWith('/gate-entry');
}

function PortalOutlet() {
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigating = navigation.state === 'loading';

  if (isNavigating) {
    return <PortalOutletLoader />;
  }

  return (
    <Suspense fallback={<PortalOutletLoader />}>
      <Outlet key={location.pathname} />
    </Suspense>
  );
}

function ShellMain({ portalId, sidebarOpen, onOpenSidebar, onCloseSidebar, isKiosk }) {
  const location = useLocation();
  const mainRef = useRef(null);
  const { user, hasPermission } = useAuth();
  const { content, collapsed } = useAnalyticsPanel();
  const { header: pageHeader } = usePageHeaderState();
  const compactChrome = portalId === 'host' || portalId === 'executive' || portalId === 'reception';
  const shellBreadcrumbs = pageHeader.breadcrumbs?.length
    ? pageHeader.breadcrumbs
    : getShellBreadcrumbs();

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (isKiosk) {
      document.documentElement.dataset.kiosk = 'gate-entry';
    } else {
      delete document.documentElement.dataset.kiosk;
    }
    return () => {
      delete document.documentElement.dataset.kiosk;
    };
  }, [isKiosk]);

  return (
    <>
      {!isKiosk && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-sm md:hidden"
          onClick={onCloseSidebar}
          aria-hidden="true"
        />
      )}

      <div className={`flex h-screen min-h-0 flex-col overflow-hidden ${isKiosk ? '' : 'md:ml-[var(--sidebar-width)]'}`}>
        <header className={`z-30 flex h-[var(--header-height)] shrink-0 items-center justify-between border-b bg-navy-50 ${
          isKiosk ? 'border-gray-200 bg-white px-4 sm:px-6' : `border-navy-100 ${compactChrome ? 'gap-2 px-3 sm:px-4' : 'gap-3 px-4 sm:px-6'}`
        }`}
        >
          {isKiosk ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-navy-200 bg-navy-50 text-cyan-700 sm:flex">
                  <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-bold text-navy-900 sm:text-lg">Gate Entry</h1>
                  <p className="truncate text-xs text-navy-500">Security kiosk</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <PortalSwitcherMenu compact />
                <AdminUserMenu compact />
                <Link
                  to="/station"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50 sm:px-4"
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">Exit to Station</span>
                  <span className="sm:hidden">Exit</span>
                </Link>
              </div>
            </>
          ) : (
            <>
          <div className={`flex min-w-0 flex-1 items-center ${compactChrome ? 'gap-2' : 'gap-3'}`}>
            <button
              type="button"
              onClick={onOpenSidebar}
              className={`md:hidden rounded-lg text-navy-500 transition-colors hover:bg-navy-100 hover:text-navy-700 ${
                compactChrome ? 'p-1.5' : 'p-2'
              }`}
              aria-label="Open menu"
            >
              <Menu size={compactChrome ? 18 : 20} />
            </button>
            {shellBreadcrumbs.length > 0 ? (
              <Breadcrumbs items={shellBreadcrumbs} variant="shell" className="min-w-0 flex-1" />
            ) : pageHeader.title || pageHeader.subtitle ? (
              <ShellPageTitle
                title={pageHeader.title}
                subtitle={pageHeader.subtitle}
                iconKey={pageHeader.iconKey}
                compact={compactChrome}
              />
            ) : (
              <div className="hidden md:block">
                <p className={`text-navy-400 ${compactChrome ? 'text-xs' : 'text-sm'}`}>
                  Welcome back,{' '}
                  <span className="font-medium text-navy-700">{user?.name?.split(' ')[0] || 'there'}</span>
                </p>
              </div>
            )}
          </div>
          <div className={`flex shrink-0 items-center ${compactChrome ? 'gap-2' : 'gap-3'}`}>
            {portalId === 'admin' ? (
              <AdminOrganisationSelect compact={compactChrome} />
            ) : null}
            {portalId === 'host' && hasPermission('host.notifications') ? (
              <NavbarNotificationsBell compact={compactChrome} />
            ) : null}
            {portalId === 'reception' && hasPermission('reception.dashboard') ? (
              <NavbarNotificationsBell
                compact={compactChrome}
                to="/reception/notifications"
              />
            ) : null}
            <PortalSwitcherMenu compact={compactChrome} />
            <AdminUserMenu compact={compactChrome} />
          </div>
            </>
          )}
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main
            ref={mainRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain"
          >
            <div className={`flex min-h-0 flex-1 flex-col ${isKiosk ? '' : 'p-4 pt-4 pb-6 sm:p-6 lg:px-8'}`}>
              <PortalOutlet />
            </div>
          </main>

          {content && !collapsed && !isKiosk && (
            <aside className="hidden xl:block w-[var(--panel-width)] shrink-0 p-4 pl-0">
              <div className="sticky top-[var(--header-height)] max-h-[calc(100vh-var(--header-height))] overflow-y-auto space-y-4">
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
  const [pushOpen, setPushOpen] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const isKiosk = isGateEntryKiosk(location.pathname);
  const { user, permissions, roleSlugs, hasPermission } = useAuth();
  const isPublicRoute = location.pathname.startsWith('/visit/');
  const pwaEnabled = Boolean(user?.id) && !isPublicRoute;
  const pwa = usePwaInstall({ enabled: pwaEnabled });
  useEffect(() => {
    if (!permissions.length) return;
    if ((isExecutiveOnlyUser(permissions) || isHostOnlyUser(permissions)) && portalId === 'management') {
      navigate('/host', { replace: true });
      return;
    }
    if (!canAccessPortal(portalId, hasPermission, permissions, roleSlugs)) {
      navigate(resolveDefaultHomeRoute(permissions, roleSlugs), { replace: true });
    }
  }, [portalId, permissions, roleSlugs, hasPermission, navigate]);

  useEffect(() => {
    if (portalId === 'host' || portalId === 'executive') {
      document.documentElement.dataset.portal = 'host';
    } else if (portalId === 'reception') {
      document.documentElement.dataset.portal = 'reception';
    } else {
      delete document.documentElement.dataset.portal;
    }
    return () => {
      delete document.documentElement.dataset.portal;
    };
  }, [portalId]);

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

  useEffect(() => {
    if (!pwaEnabled) return;
    pwa.resetDismissOnLogin();
  }, [pwaEnabled, user?.id, pwa.resetDismissOnLogin]);

  useEffect(() => {
    if (!pwaEnabled || pwa.showBanner) {
      setPushOpen(false);
      return undefined;
    }
    if (!shouldShowPushPrompt()) return undefined;
    const timer = window.setTimeout(() => setPushOpen(true), 1000);
    return () => window.clearTimeout(timer);
  }, [pwaEnabled, pwa.showBanner, location.pathname]);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    try {
      const result = await subscribeToPushNotifications({
        getVapidPublicKey: async () => ({ publicKey: await notificationsApi.getVapidPublicKey() }),
        subscribePush: notificationsApi.subscribePush,
      });
      if (result.ok) {
        writePromptState('subscribed');
        toast.success('Desktop alerts enabled.');
        setPushOpen(false);
        return;
      }
      if (result.reason === 'denied') {
        writePromptState('denied');
        toast.error('Notification permission was blocked.');
      } else if (result.reason === 'no_vapid_key') {
        toast.error('Push alerts are not configured on this server yet.');
      } else {
        toast.error('Could not enable desktop alerts.');
      }
      setPushOpen(false);
    } catch (err) {
      toast.error(err.message || 'Could not enable desktop alerts.');
    } finally {
      setPushEnabling(false);
    }
  };

  const handleDismissPush = () => {
    writePromptState('dismissed');
    setPushOpen(false);
  };

  return (
    <SidebarProvider portalId={portalId}>
      <div className={`h-screen overflow-hidden bg-navy-50 portal-${portalId}`}>
        {pwaEnabled && !isKiosk ? (
          <PwaInstallBanner
            visible={pwa.showBanner}
            canInstall={pwa.canInstall}
            showIosHint={pwa.showIosHint}
            installing={pwa.installing}
            onInstall={pwa.install}
            onDismiss={pwa.dismiss}
          />
        ) : null}
        {!isKiosk && (
          <AppSidebar
            title={title}
            sidebarOpen={sidebarOpen}
            onCloseSidebar={closeSidebar}
          />
        )}

        <AnalyticsPanelProvider>
          <PageHeaderProvider>
            {portalId === 'admin' ? (
              <AdminOrganisationProvider>
                <ShellMain
                  portalId={portalId}
                  sidebarOpen={sidebarOpen}
                  onOpenSidebar={openSidebar}
                  onCloseSidebar={closeSidebar}
                  isKiosk={isKiosk}
                />
              </AdminOrganisationProvider>
            ) : (
              <ShellMain
                portalId={portalId}
                sidebarOpen={sidebarOpen}
                onOpenSidebar={openSidebar}
                onCloseSidebar={closeSidebar}
                isKiosk={isKiosk}
              />
            )}
          </PageHeaderProvider>
        </AnalyticsPanelProvider>
        {pwaEnabled ? (
          <PwaPushPrompt
            isOpen={pushOpen}
            enabling={pushEnabling}
            onEnable={handleEnablePush}
            onDismiss={handleDismissPush}
          />
        ) : null}
      </div>
    </SidebarProvider>
  );
}

export default function AppShell(props) {
  return <ShellBody {...props} />;
}
