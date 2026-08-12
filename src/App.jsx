import { Suspense, lazy, Component } from 'react';
import { Outlet, createBrowserRouter, Navigate, useLocation, useNavigate, useNavigation, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import ProtectedRoute from './components/ProtectedRoute';
import PortalLayout from './layouts/PortalLayout';
import { Modal, IconButton } from './components/ui';
import TopProgressBar from './components/ui/TopProgressBar';
import { useAuth } from './context/AuthContext';
import { purgeInvalidAuthState } from './utils/authHeaders';
import { APP_NAME_SHORT } from '../shared/branding.js';
import {
  isExecutiveOnlyUser,
  isHostOnlyUser,
  isHostPortalLockedUser,
  isHostPortalPath,
  isPortalLockExemptPath,
  isReceptionOnlyUser,
  isReceptionPortalPath,
  resolveDefaultHomeRoute,
} from '../shared/portalNavigation.js';

const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));

const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminVisitorsPage = lazy(() => import('./pages/admin/AdminVisitorsPage'));
const AdminVehiclesPage = lazy(() => import('./pages/admin/AdminVehiclesPage'));
const AdminLogBookPage = lazy(() => import('./pages/admin/AdminLogBookPage'));
const AdminLogBookVisitPage = lazy(() => import('./pages/admin/AdminLogBookVisitPage'));
const DemoUsersPage = lazy(() => import('./pages/admin/DemoUsersPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const DemoAccessControlPage = lazy(() => import('./pages/admin/DemoAccessControlPage'));
const AdminOrgPages = lazy(() => import('./pages/admin/AdminOrgPages.jsx'));
const AdminSitesPage = lazy(() => import('./pages/admin/AdminSitesPage.jsx'));
const AdminSiteDetailPage = lazy(() => import('./pages/admin/AdminSiteDetailPage.jsx'));
const AdminZonesPage = lazy(() => import('./pages/admin/AdminZonesPage.jsx'));
const AdminZoneDetailPage = lazy(() => import('./pages/admin/AdminZoneDetailPage.jsx'));
const AdminOrganisationsPage = lazy(() => import('./pages/admin/AdminOrganisationsPage.jsx'));
const AdminOrganisationDetailPage = lazy(() => import('./pages/admin/AdminOrganisationDetailPage.jsx'));
const AdminDepartmentsPage = lazy(() => import('./pages/admin/AdminDepartmentsPage.jsx'));
const AdminDepartmentDetailPage = lazy(() => import('./pages/admin/AdminDepartmentDetailPage.jsx'));
const AdminStationsPage = lazy(() => import('./pages/admin/AdminStationsPage.jsx'));
const AdminStationDetailPage = lazy(() => import('./pages/admin/AdminStationDetailPage.jsx'));
const AdminOfficesPage = lazy(() => import('./pages/admin/AdminOfficesPage.jsx'));
const AdminOfficeDetailPage = lazy(() => import('./pages/admin/AdminOfficeDetailPage.jsx'));
const AdminPositionsPage = lazy(() => import('./pages/admin/AdminPositionsPage.jsx'));
const AdminPositionDetailPage = lazy(() => import('./pages/admin/AdminPositionDetailPage.jsx'));
const AdminHostsPage = lazy(() => import('./pages/admin/AdminHostsPage.jsx'));
const AdminHostDetailPage = lazy(() => import('./pages/admin/AdminHostDetailPage.jsx'));
const AdminReceptionistsPage = lazy(() => import('./pages/admin/AdminReceptionistsPage.jsx'));
const AdminReceptionistDetailPage = lazy(() => import('./pages/admin/AdminReceptionistDetailPage.jsx'));
const AdminSecurityGuardsPage = lazy(() => import('./pages/admin/AdminSecurityGuardsPage.jsx'));
const AdminSecurityGuardDetailPage = lazy(() => import('./pages/admin/AdminSecurityGuardDetailPage.jsx'));
const AdminUserDetailPage = lazy(() => import('./pages/admin/AdminUserDetailPage.jsx'));
const AdminAuditPage = lazy(() => import('./pages/admin/AdminAuditPage'));

const StationDashboardPage = lazy(() => import('./pages/station/StationDashboardPage'));
const GateEntryPage = lazy(() => import('./pages/station/GateEntryPage'));
const NewVisitorPage = lazy(() => import('./pages/station/NewVisitorPage'));
const NewVehiclePage = lazy(() => import('./pages/station/NewVehiclePage'));
const VisitorLogsPage = lazy(() => import('./pages/station/VisitorLogsPage'));
const VehicleLogsPage = lazy(() => import('./pages/station/VehicleLogsPage'));
const OccupancyPage = lazy(() => import('./pages/station/OccupancyPage'));
const VisitDetailPage = lazy(() => import('./pages/station/VisitDetailPage'));
const PendingApprovalsModule = lazy(() => import('./pages/station/PendingApprovalsPage'));

const ReceptionDashboardPage = lazy(() => import('./pages/reception/ReceptionDashboardPage'));
const ReceptionCalendarPage = lazy(() => import('./pages/reception/ReceptionCalendarPage'));
const ReceptionCheckInPage = lazy(() => import('./pages/reception/ReceptionCheckInPage'));
const ReceptionRegisterPage = lazy(() => import('./pages/reception/ReceptionRegisterPage'));
const ReceptionApprovalsPage = lazy(() => import('./pages/reception/ReceptionApprovalsPage'));
const ReceptionHostQueuePage = lazy(() => import('./pages/reception/ReceptionHostQueuePage'));
const ReceptionHostAvailabilityPage = lazy(() => import('./pages/reception/ReceptionHostAvailabilityPage'));
const ReceptionVisitorLogsPage = lazy(() => import('./pages/reception/ReceptionVisitorLogsPage'));
const ReceptionVisitDetailPage = lazy(() => import('./pages/reception/ReceptionVisitDetailPage'));
const ReceptionOccupancyPage = lazy(() => import('./pages/reception/ReceptionOccupancyPage'));
const ReceptionBadgesPage = lazy(() => import('./pages/reception/ReceptionBadgesPage'));
const ReceptionNotificationsPage = lazy(() => import('./pages/reception/ReceptionNotificationsPage'));

const HostDashboardPage = lazy(() => import('./pages/host/HostDashboardPage'));
const HostInvitePage = lazy(() => import('./pages/host/HostInvitePage'));
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

const ExecutiveDashboardPage = lazy(() => import('./pages/executive/ExecutiveDashboardPage'));
const ExecutiveAppointmentsPage = lazy(() => import('./pages/executive/ExecutiveAppointmentsPage'));
const ExecutiveNewAppointmentPage = lazy(() => import('./pages/executive/ExecutiveNewAppointmentPage'));
const ExecutiveVisitorsPage = lazy(() => import('./pages/executive/ExecutiveVisitorsPage'));
const ExecutiveContactsPage = lazy(() => import('./pages/executive/ExecutiveContactsPage'));
const ExecutiveVisitDetailPage = lazy(() => import('./pages/executive/ExecutiveVisitDetailPage'));

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

function ReceptionPortalLayout() {
  return <PortalLayout key="reception" portalId="reception" title={`${APP_NAME_SHORT} Reception`} />;
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

function ExecutiveOnlyManagementRedirect({ children }) {
  const { permissions } = useAuth();
  const perms = permissions || [];
  if (isExecutiveOnlyUser(perms)) {
    return <Navigate to="/host" replace />;
  }
  return children;
}

function ProtectedManagementPortal() {
  return (
    <ProtectedRoute>
      <ExecutiveOnlyManagementRedirect>
        <ManagementPortalLayout />
      </ExecutiveOnlyManagementRedirect>
    </ProtectedRoute>
  );
}

function RedirectToHostRegisterVisit() {
  const { id } = useParams();
  return <Navigate to={`/host/register/${id}`} replace />;
}

function CompliancePortalLayout() {
  return <PortalLayout key="compliance" portalId="compliance" title={`${APP_NAME_SHORT} Compliance`} />;
}

function EmergencyPortalLayout() {
  return <PortalLayout key="emergency" portalId="emergency" title={`${APP_NAME_SHORT} Emergency`} />;
}

function AppOutlet() {
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigating = navigation.state === 'loading';

  if (isNavigating) {
    return <RouteLoader />;
  }

  return (
    <Suspense fallback={<RouteLoader />}>
      <Outlet key={location.key} />
    </Suspense>
  );
}

function AppRoot() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    idleLogoutPromptOpen,
    dismissIdleLogoutPrompt,
    adminIdleTimeoutMinutes,
    permissions,
  } = useAuth();

  const homeRoute = permissions?.length ? resolveDefaultHomeRoute(permissions) : null;
  const exemptPath = isPortalLockExemptPath(location.pathname);
  const lockToReception = Boolean(
    permissions?.length
    && isReceptionOnlyUser(permissions)
    && !isReceptionPortalPath(location.pathname)
    && !exemptPath,
  );
  const lockToHost = Boolean(
    permissions?.length
    && (
      isExecutiveOnlyUser(permissions)
      || isHostOnlyUser(permissions)
      || isHostPortalLockedUser(permissions)
    )
    && !isHostPortalPath(location.pathname)
    && !exemptPath,
  );

  const openAdminLogin = () => {
    dismissIdleLogoutPrompt();
    purgeInvalidAuthState();
    navigate('/login', { state: { from: { pathname: location.pathname } } });
  };

  if (lockToReception || lockToHost) {
    return <Navigate to={homeRoute} replace />;
  }

  return (
    <>
      <TopProgressBar />
      <ErrorBoundary resetKey={location.pathname}>
        <AppOutlet />
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
      { path: 'reset-password', element: <ResetPasswordPage /> },

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
        path: 'reception',
        element: <ProtectedRoute><ReceptionPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <ReceptionDashboardPage /> },
          { path: 'calendar', element: <ReceptionCalendarPage /> },
          { path: 'check-in', element: <ReceptionCheckInPage /> },
          { path: 'register', element: <ReceptionRegisterPage /> },
          { path: 'approvals', element: <ReceptionApprovalsPage /> },
          { path: 'host-queue', element: <ReceptionHostQueuePage /> },
          { path: 'hosts', element: <ReceptionHostAvailabilityPage /> },
          { path: 'visitors', element: <ReceptionVisitorLogsPage /> },
          { path: 'visitors/:id', element: <ReceptionVisitDetailPage /> },
          { path: 'badges', element: <ReceptionBadgesPage /> },
          { path: 'occupancy', element: <ReceptionOccupancyPage /> },
          { path: 'notifications', element: <ReceptionNotificationsPage /> },
          { path: '*', element: <PlaceholderPage title="Reception" portalLabel="Reception" /> },
        ],
      },

      {
        path: 'station',
        element: <ProtectedRoute><StationPortalLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <StationDashboardPage /> },
          { path: 'gate-entry', element: <GateEntryPage /> },
          { path: 'visitors/new', element: <NewVisitorPage /> },
          { path: 'vehicles/new', element: <NewVehiclePage /> },
          { path: 'expected', element: <LazyPendingApprovals variant="expected" /> },
          { path: 'pending', element: <LazyPendingApprovals variant="pending" /> },
          { path: 'check-in', element: <Navigate to="/station/gate-entry?tab=checkin" replace /> },
          { path: 'check-out', element: <Navigate to="/station/gate-entry?tab=checkout" replace /> },
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
          {
            path: 'organisations',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminOrganisationsPage />
              </Suspense>
            ),
          },
          {
            path: 'organisations/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminOrganisationDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'sites',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminSitesPage />
              </Suspense>
            ),
          },
          {
            path: 'sites/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminSiteDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'zones',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminZonesPage />
              </Suspense>
            ),
          },
          {
            path: 'zones/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminZoneDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'stations',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminStationsPage />
              </Suspense>
            ),
          },
          {
            path: 'stations/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminStationDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'departments',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminDepartmentsPage />
              </Suspense>
            ),
          },
          {
            path: 'departments/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminDepartmentDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'offices',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminOfficesPage />
              </Suspense>
            ),
          },
          {
            path: 'offices/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminOfficeDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'positions',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminPositionsPage />
              </Suspense>
            ),
          },
          {
            path: 'positions/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminPositionDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'hosts',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminHostsPage />
              </Suspense>
            ),
          },
          {
            path: 'hosts/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminHostDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'receptionists',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminReceptionistsPage />
              </Suspense>
            ),
          },
          {
            path: 'receptionists/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminReceptionistDetailPage />
              </Suspense>
            ),
          },
          {
            path: 'security-guards',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminSecurityGuardsPage />
              </Suspense>
            ),
          },
          {
            path: 'security-guards/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminSecurityGuardDetailPage />
              </Suspense>
            ),
          },
          { path: 'categories', element: <LazyAdminOrgPage page="categories" /> },
          { path: 'visitors', element: <AdminVisitorsPage /> },
          { path: 'log-book/:visitId', element: <AdminLogBookVisitPage /> },
          { path: 'log-book', element: <AdminLogBookPage /> },
          { path: 'walking-visits', element: <Navigate to="/admin/log-book?tab=walking" replace /> },
          { path: 'vehicles', element: <AdminVehiclesPage /> },
          { path: 'vehicle-visits', element: <Navigate to="/admin/log-book?tab=vehicle" replace /> },
          { path: 'badges', element: <LazyAdminOrgPage page="badges" /> },
          { path: 'notifications', element: <AdminNotificationsPage /> },
          { path: 'audit', element: <AdminAuditPage /> },
          { path: 'users', element: <DemoUsersPage /> },
          {
            path: 'users/:id',
            element: (
              <Suspense fallback={<RouteLoader />}>
                <AdminUserDetailPage />
              </Suspense>
            ),
          },
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
          { path: 'visitors/:id', element: <VisitDetailPage portalPrefix="/security" /> },
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
          { index: true, element: <ExecutiveDashboardPage /> },
          { path: 'appointments', element: <ExecutiveAppointmentsPage /> },
          { path: 'appointments/new', element: <ExecutiveNewAppointmentPage /> },
          { path: 'invite', element: <HostInvitePage /> },
          { path: 'visitors', element: <Navigate to="/host/contacts" replace /> },
          { path: 'visitors/:id', element: <HostVisitDetailPage /> },
          { path: 'register', element: <ExecutiveVisitorsPage /> },
          { path: 'register/:id', element: <ExecutiveVisitDetailPage /> },
          { path: 'approvals', element: <HostApprovalsPage /> },
          { path: 'on-site', element: <HostOnSitePage /> },
          { path: 'contacts', element: <ExecutiveContactsPage /> },
          { path: 'notifications', element: <HostNotificationsPage /> },
          { path: 'overview', element: <HostDashboardPage /> },
          { path: '*', element: <PlaceholderPage title="Host" portalLabel="Host" /> },
        ],
      },

      // Former executive portal — keep bookmarks working via Host portal.
      { path: 'executive', element: <Navigate to="/host" replace /> },
      { path: 'executive/appointments', element: <Navigate to="/host/appointments" replace /> },
      { path: 'executive/appointments/new', element: <Navigate to="/host/appointments/new" replace /> },
      { path: 'executive/visitors', element: <Navigate to="/host/register" replace /> },
      { path: 'executive/visitors/:id', element: <RedirectToHostRegisterVisit /> },
      { path: 'executive/contacts', element: <Navigate to="/host/contacts" replace /> },
      { path: 'executive/notifications', element: <Navigate to="/host/notifications" replace /> },
      { path: 'executive/*', element: <Navigate to="/host" replace /> },

      {
        path: 'management',
        element: <ProtectedManagementPortal />,
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
          { path: 'visitors/:id', element: <VisitDetailPage portalPrefix="/emergency" /> },
          { path: 'roll-call', element: <EmergencyRollCallPage /> },
          { path: 'roll-call/new', element: <EmergencyRollCallPage /> },
          { path: 'roll-call/:id', element: <EmergencyRollCallDetailPage /> },
          { path: '*', element: <PlaceholderPage title="Emergency" portalLabel="Emergency" /> },
        ],
      },

      // Platform portal retired — keep bookmarks working by sending users to Administration.
      { path: 'platform', element: <Navigate to="/admin" replace /> },
      { path: 'platform/*', element: <Navigate to="/admin" replace /> },
    ],
  },
]);

export default AppRoot;
