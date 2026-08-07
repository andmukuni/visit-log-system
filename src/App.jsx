import { Suspense, lazy, Component } from 'react';
import { Outlet, createBrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import ProtectedRoute from './components/ProtectedRoute';
import PortalLayout from './layouts/PortalLayout';
import { Modal, IconButton } from './components/ui';
import TopProgressBar from './components/ui/TopProgressBar';
import { useAuth } from './context/AuthContext';
import { purgeInvalidAuthState } from './utils/authHeaders';
import { APP_NAME_SHORT } from '../shared/branding.js';

const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));

const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminVisitorsPage = lazy(() => import('./pages/admin/AdminVisitorsPage'));
const AdminVehiclesPage = lazy(() => import('./pages/admin/AdminVehiclesPage'));
const AdminWalkingVisitsPage = lazy(() => import('./pages/admin/AdminWalkingVisitsPage'));
const AdminVehicleVisitsPage = lazy(() => import('./pages/admin/AdminVehicleVisitsPage'));
const DemoUsersPage = lazy(() => import('./pages/admin/DemoUsersPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const DemoAccessControlPage = lazy(() => import('./pages/admin/DemoAccessControlPage'));
const AdminOrgPages = lazy(() => import('./pages/admin/AdminOrgPages.jsx'));

const StationDashboardPage = lazy(() => import('./pages/station/StationDashboardPage'));
const NewVisitorPage = lazy(() => import('./pages/station/NewVisitorPage'));
const NewVehiclePage = lazy(() => import('./pages/station/NewVehiclePage'));
const CheckInPage = lazy(() => import('./pages/station/CheckInPage'));
const CheckOutPage = lazy(() => import('./pages/station/CheckOutPage'));
const VisitorLogsPage = lazy(() => import('./pages/station/VisitorLogsPage'));
const VehicleLogsPage = lazy(() => import('./pages/station/VehicleLogsPage'));
const OccupancyPage = lazy(() => import('./pages/station/OccupancyPage'));
const VisitDetailPage = lazy(() => import('./pages/station/VisitDetailPage'));
const PendingApprovalsModule = lazy(() => import('./pages/station/PendingApprovalsPage'));

const HostDashboardPage = lazy(() => import('./pages/host/HostDashboardPage'));
const HostInvitePage = lazy(() => import('./pages/host/HostInvitePage'));
const HostVisitorsPage = lazy(() => import('./pages/host/HostVisitorsPage'));
const HostApprovalsPage = lazy(() => import('./pages/host/HostApprovalsPage'));
const HostOnSitePage = lazy(() => import('./pages/host/HostOnSitePage'));
const HostVisitDetailPage = lazy(() => import('./pages/host/HostVisitDetailPage'));

const SecurityDashboardPage = lazy(() => import('./pages/security/SecurityDashboardPage'));
const SecurityOccupancyPage = lazy(() => import('./pages/security/SecurityOccupancyPage'));
const SecurityApprovalsPage = lazy(() => import('./pages/security/SecurityApprovalsPage'));
const SecurityExceptionsPage = lazy(() => import('./pages/security/SecurityExceptionsPage'));
const SecurityVisitorsPage = lazy(() => import('./pages/security/SecurityVisitorsPage'));
const SecurityVehiclesPage = lazy(() => import('./pages/security/SecurityVehiclesPage'));
const SecurityOverduePage = lazy(() => import('./pages/security/SecurityOverduePage'));
const SecurityWatchlistPage = lazy(() => import('./pages/security/SecurityWatchlistPage'));
const SecurityIncidentsPage = lazy(() => import('./pages/security/SecurityIncidentsPage'));
const SecurityRollCallPage = lazy(() => import('./pages/security/SecurityRollCallPage'));
const SecurityRollCallDetailPage = lazy(() => import('./pages/security/SecurityRollCallDetailPage'));

const EmergencyDashboardPage = lazy(() => import('./pages/emergency/EmergencyDashboardPage'));
const EmergencyOccupancyPage = lazy(() => import('./pages/emergency/EmergencyOccupancyPage'));
const EmergencyUnresolvedPage = lazy(() => import('./pages/emergency/EmergencyUnresolvedPage'));
const EmergencyRollCallPage = lazy(() => import('./pages/emergency/EmergencyRollCallPage'));
const EmergencyRollCallDetailPage = lazy(() => import('./pages/emergency/EmergencyRollCallDetailPage'));

const ManagementDashboardPage = lazy(() => import('./pages/management/ManagementDashboardPage'));
const ManagementOccupancyPage = lazy(() => import('./pages/management/ManagementOccupancyPage'));
const ManagementReportsPage = lazy(() => import('./pages/management/ManagementReportsPage'));
const ManagementExportHistoryPage = lazy(() => import('./pages/management/ManagementExportHistoryPage'));

const ComplianceExportLogsPage = lazy(() => import('./pages/compliance/ComplianceExportLogsPage'));
const ComplianceReportsPage = lazy(() => import('./pages/compliance/ComplianceReportsPage'));
const ComplianceDashboardPage = lazy(() => import('./pages/compliance/ComplianceDashboardPage'));
const ComplianceAuditPage = lazy(() => import('./pages/compliance/ComplianceAuditPage'));
const ComplianceApprovalsPage = lazy(() => import('./pages/compliance/ComplianceApprovalsPage'));
const ComplianceAccessPage = lazy(() => import('./pages/compliance/ComplianceAccessPage'));
const ComplianceIncidentsPage = lazy(() => import('./pages/compliance/ComplianceIncidentsPage'));
const CompliancePrivacyPage = lazy(() => import('./pages/compliance/CompliancePrivacyPage'));
const ComplianceRetentionPage = lazy(() => import('./pages/compliance/ComplianceRetentionPage'));

const SecurityReportsPage = lazy(() => import('./pages/security/SecurityReportsPage'));

const PlatformDashboardPage = lazy(() => import('./pages/platform/PlatformDashboardPage'));
const PlatformOrganisationsPage = lazy(() => import('./pages/platform/PlatformOrganisationsPage'));
const PlatformCalendarPage = lazy(() => import('./pages/platform/PlatformCalendarPage'));
const PlatformLogBookPage = lazy(() => import('./pages/platform/PlatformLogBookPage'));
const PlatformVisitorsPage = lazy(() => import('./pages/platform/PlatformVisitorsPage'));
const PlatformVehiclesPage = lazy(() => import('./pages/platform/PlatformVehiclesPage'));
const PlatformAuditPage = lazy(() => import('./pages/platform/PlatformAuditPage'));
const PlatformUsersPage = lazy(() => import('./pages/platform/PlatformUsersPage'));

const HostNotificationsPage = lazy(() => import('./pages/host/HostNotificationsPage'));
const AdminNotificationsPage = lazy(() => import('./pages/admin/AdminNotificationsPage'));

const KioskLayout = lazy(() => import('./layouts/KioskLayout'));
const KioskWelcomePage = lazy(() => import('./pages/kiosk/KioskWelcomePage'));
const KioskCheckInPage = lazy(() => import('./pages/kiosk/KioskCheckInPage'));
const KioskCheckOutPage = lazy(() => import('./pages/kiosk/KioskCheckOutPage'));
const VisitInvitePage = lazy(() => import('./pages/kiosk/VisitInvitePage'));

function LazyAdminOrgPage({ page }) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <AdminOrgPages page={page} />
    </Suspense>
  );
}

function LazyPendingApprovals({ variant }) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <PendingApprovalsModule variant={variant} />
    </Suspense>
  );
}

function RouteLoader() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-full border-4 border-navy-100 border-t-navy-900 animate-spin" />
      <p className="text-navy-500 text-sm animate-pulse">Loading page...</p>
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-xl font-bold text-navy-900">Something went wrong</h2>
          <IconButton
            icon={RefreshCw}
            label="Refresh page"
            tooltip="Refresh page"
            variant="primary"
            onClick={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

function StationPortalLayout() {
  return <PortalLayout key="station" portalId="station" title={`${APP_NAME_SHORT} Station`} />;
}

function AdminPortalLayout() {
  return <PortalLayout key="admin" portalId="admin" title={`${APP_NAME_SHORT} Admin`} />;
}

function SecurityPortalLayout() {
  return <PortalLayout key="security" portalId="security" title={`${APP_NAME_SHORT} Security`} />;
}

function HostPortalLayout() {
  return <PortalLayout key="host" portalId="host" title={`${APP_NAME_SHORT} Host`} />;
}

function ManagementPortalLayout() {
  return <PortalLayout key="management" portalId="management" title={`${APP_NAME_SHORT} Management`} />;
}

function CompliancePortalLayout() {
  return <PortalLayout key="compliance" portalId="compliance" title={`${APP_NAME_SHORT} Compliance`} />;
}

function EmergencyPortalLayout() {
  return <PortalLayout key="emergency" portalId="emergency" title={`${APP_NAME_SHORT} Emergency`} />;
}

function PlatformPortalLayout() {
  return <PortalLayout key="platform" portalId="platform" title={`${APP_NAME_SHORT} Platform`} />;
}

function AppRoot() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    idleLogoutPromptOpen,
    dismissIdleLogoutPrompt,
    adminIdleTimeoutMinutes,
  } = useAuth();

  const openAdminLogin = () => {
    dismissIdleLogoutPrompt();
    purgeInvalidAuthState();
    navigate('/login', { state: { from: { pathname: location.pathname } } });
  };

  return (
    <>
      <TopProgressBar />
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<RouteLoader />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>

      <Modal
        isOpen={idleLogoutPromptOpen}
        onClose={dismissIdleLogoutPrompt}
        title="Session ended"
        size="sm"
      >
        <p className="text-sm text-navy-600 mb-4">
          Your session ended after {adminIdleTimeoutMinutes} minutes of inactivity.
        </p>
        <button
          type="button"
          onClick={openAdminLogin}
          className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium"
        >
          Sign in again
        </button>
      </Modal>
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <AppRoot />,
    children: [
      { path: '/', element: <LoginPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'admin/login', element: <LoginPage /> },

      {
        path: 'kiosk',
        element: <KioskLayout />,
        children: [
          { index: true, element: <KioskWelcomePage /> },
          { path: 'check-in', element: <KioskCheckInPage /> },
          { path: 'check-out', element: <KioskCheckOutPage /> },
        ],
      },
      { path: 'visit/invite/:token', element: <VisitInvitePage /> },

      {
        path: 'station',
        element: <ProtectedRoute><StationPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <StationDashboardPage /> },
          { path: 'visitors/new', element: <NewVisitorPage /> },
          { path: 'vehicles/new', element: <NewVehiclePage /> },
          { path: 'expected', element: <LazyPendingApprovals variant="expected" /> },
          { path: 'pending', element: <LazyPendingApprovals variant="pending" /> },
          { path: 'check-in', element: <CheckInPage /> },
          { path: 'check-out', element: <CheckOutPage /> },
          { path: 'visitors', element: <VisitorLogsPage /> },
          { path: 'visitors/:id', element: <VisitDetailPage /> },
          { path: 'vehicles', element: <VehicleLogsPage /> },
          { path: 'occupancy', element: <OccupancyPage /> },
          { path: '*', element: <PlaceholderPage title="Station" portalLabel="Station" /> },
        ],
      },

      {
        path: 'admin',
        element: <ProtectedRoute><AdminPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'sites', element: <LazyAdminOrgPage page="sites" /> },
          { path: 'stations', element: <LazyAdminOrgPage page="stations" /> },
          { path: 'departments', element: <LazyAdminOrgPage page="departments" /> },
          { path: 'hosts', element: <LazyAdminOrgPage page="hosts" /> },
          { path: 'categories', element: <LazyAdminOrgPage page="categories" /> },
          { path: 'visitors', element: <AdminVisitorsPage /> },
          { path: 'walking-visits', element: <AdminWalkingVisitsPage /> },
          { path: 'vehicles', element: <AdminVehiclesPage /> },
          { path: 'vehicle-visits', element: <AdminVehicleVisitsPage /> },
          { path: 'badges', element: <LazyAdminOrgPage page="badges" /> },
          { path: 'notifications', element: <AdminNotificationsPage /> },
          { path: 'users', element: <DemoUsersPage /> },
          { path: 'settings', element: <AdminSettingsPage /> },
          { path: 'access-control', element: <DemoAccessControlPage /> },
          { path: '*', element: <PlaceholderPage title="Administration" portalLabel="Administration" /> },
        ],
      },

      {
        path: 'security',
        element: <ProtectedRoute><SecurityPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <SecurityDashboardPage /> },
          { path: 'occupancy', element: <SecurityOccupancyPage /> },
          { path: 'approvals', element: <SecurityApprovalsPage /> },
          { path: 'exceptions', element: <SecurityExceptionsPage /> },
          { path: 'visitors', element: <SecurityVisitorsPage /> },
          { path: 'vehicles', element: <SecurityVehiclesPage /> },
          { path: 'overdue', element: <SecurityOverduePage /> },
          { path: 'watchlist', element: <SecurityWatchlistPage /> },
          { path: 'incidents', element: <SecurityIncidentsPage /> },
          { path: 'roll-call', element: <SecurityRollCallPage /> },
          { path: 'roll-call/:id', element: <SecurityRollCallDetailPage /> },
          { path: 'reports', element: <SecurityReportsPage /> },
          { path: '*', element: <PlaceholderPage title="Security" portalLabel="Security" /> },
        ],
      },

      {
        path: 'host',
        element: <ProtectedRoute><HostPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <HostDashboardPage /> },
          { path: 'invite', element: <HostInvitePage /> },
          { path: 'visitors', element: <HostVisitorsPage /> },
          { path: 'visitors/:id', element: <HostVisitDetailPage /> },
          { path: 'approvals', element: <HostApprovalsPage /> },
          { path: 'on-site', element: <HostOnSitePage /> },
          { path: 'notifications', element: <HostNotificationsPage /> },
          { path: '*', element: <PlaceholderPage title="Host" portalLabel="Host" /> },
        ],
      },

      {
        path: 'management',
        element: <ProtectedRoute><ManagementPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <ManagementDashboardPage /> },
          { path: 'occupancy', element: <ManagementOccupancyPage /> },
          { path: 'reports', element: <ManagementReportsPage /> },
          { path: 'exports', element: <ManagementExportHistoryPage /> },
          { path: '*', element: <PlaceholderPage title="Management" portalLabel="Management" /> },
        ],
      },

      {
        path: 'compliance',
        element: <ProtectedRoute><CompliancePortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <ComplianceDashboardPage /> },
          { path: 'audit', element: <ComplianceAuditPage /> },
          { path: 'approvals', element: <ComplianceApprovalsPage /> },
          { path: 'access', element: <ComplianceAccessPage /> },
          { path: 'incidents', element: <ComplianceIncidentsPage /> },
          { path: 'privacy', element: <CompliancePrivacyPage /> },
          { path: 'retention', element: <ComplianceRetentionPage /> },
          { path: 'exports', element: <ComplianceExportLogsPage /> },
          { path: 'reports', element: <ComplianceReportsPage /> },
          { path: '*', element: <PlaceholderPage title="Compliance" portalLabel="Compliance" /> },
        ],
      },

      {
        path: 'emergency',
        element: <ProtectedRoute><EmergencyPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <EmergencyDashboardPage /> },
          { path: 'occupancy', element: <EmergencyOccupancyPage /> },
          { path: 'unresolved', element: <EmergencyUnresolvedPage /> },
          { path: 'roll-call', element: <EmergencyRollCallPage /> },
          { path: 'roll-call/new', element: <EmergencyRollCallPage /> },
          { path: 'roll-call/:id', element: <EmergencyRollCallDetailPage /> },
          { path: '*', element: <PlaceholderPage title="Emergency" portalLabel="Emergency" /> },
        ],
      },

      {
        path: 'platform',
        element: <ProtectedRoute><PlatformPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <PlatformDashboardPage /> },
          { path: 'calendar', element: <PlatformCalendarPage /> },
          { path: 'log-book', element: <PlatformLogBookPage /> },
          { path: 'visitors', element: <PlatformVisitorsPage /> },
          { path: 'vehicles', element: <PlatformVehiclesPage /> },
          { path: 'organisations', element: <PlatformOrganisationsPage /> },
          { path: 'users', element: <PlatformUsersPage /> },
          { path: 'health', element: <Navigate to="/platform/settings?tab=health" replace /> },
          { path: 'integrations', element: <PlaceholderPage title="Integrations" portalLabel="Platform" /> },
          { path: 'support', element: <PlaceholderPage title="Support Access" portalLabel="Platform" /> },
          { path: 'audit', element: <PlatformAuditPage /> },
          { path: 'settings', element: <AdminSettingsPage /> },
          { path: '*', element: <PlaceholderPage title="Platform" portalLabel="Platform" /> },
        ],
      },
    ],
  },
]);

export default AppRoot;
