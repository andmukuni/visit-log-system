import { Suspense, lazy, Component } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import ProtectedRoute from './components/ProtectedRoute';
import PortalLayout from './layouts/PortalLayout';
import { Modal, IconButton } from './components/ui';
import TopProgressBar from './components/ui/TopProgressBar';
import { useAuth } from './context/AuthContext';
import { purgeInvalidAuthState } from './utils/authHeaders';

const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));

const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
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
const PlatformHealthPage = lazy(() => import('./pages/platform/PlatformHealthPage'));
const PlatformCalendarPage = lazy(() => import('./pages/platform/PlatformCalendarPage'));
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
  return <PortalLayout portalId="station" title="VM360 Station" />;
}

function AdminPortalLayout() {
  return <PortalLayout portalId="admin" title="VM360 Admin" />;
}

function SecurityPortalLayout() {
  return <PortalLayout portalId="security" title="VM360 Security" />;
}

function HostPortalLayout() {
  return <PortalLayout portalId="host" title="VM360 Host" />;
}

function ManagementPortalLayout() {
  return <PortalLayout portalId="management" title="VM360 Management" />;
}

function CompliancePortalLayout() {
  return <PortalLayout portalId="compliance" title="VM360 Compliance" />;
}

function EmergencyPortalLayout() {
  return <PortalLayout portalId="emergency" title="VM360 Emergency" />;
}

function PlatformPortalLayout() {
  return <PortalLayout portalId="platform" title="VM360 Platform" />;
}

export default function App() {
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
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin/login" element={<LoginPage />} />

            <Route path="/kiosk" element={<KioskLayout />}>
              <Route index element={<KioskWelcomePage />} />
              <Route path="check-in" element={<KioskCheckInPage />} />
              <Route path="check-out" element={<KioskCheckOutPage />} />
            </Route>
            <Route path="/visit/invite/:token" element={<VisitInvitePage />} />

            <Route path="/station" element={<ProtectedRoute><StationPortalLayout /></ProtectedRoute>}>
              <Route index element={<StationDashboardPage />} />
              <Route path="visitors/new" element={<NewVisitorPage />} />
              <Route path="vehicles/new" element={<NewVehiclePage />} />
              <Route path="expected" element={<LazyPendingApprovals variant="expected" />} />
              <Route path="pending" element={<LazyPendingApprovals variant="pending" />} />
              <Route path="check-in" element={<CheckInPage />} />
              <Route path="check-out" element={<CheckOutPage />} />
              <Route path="visitors" element={<VisitorLogsPage />} />
              <Route path="visitors/:id" element={<VisitDetailPage />} />
              <Route path="vehicles" element={<VehicleLogsPage />} />
              <Route path="occupancy" element={<OccupancyPage />} />
              <Route path="*" element={<PlaceholderPage title="Station" portalLabel="Station" />} />
            </Route>

            <Route path="/admin" element={<ProtectedRoute><AdminPortalLayout /></ProtectedRoute>}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="sites" element={<LazyAdminOrgPage page="sites" />} />
              <Route path="stations" element={<LazyAdminOrgPage page="stations" />} />
              <Route path="departments" element={<LazyAdminOrgPage page="departments" />} />
              <Route path="hosts" element={<LazyAdminOrgPage page="hosts" />} />
              <Route path="categories" element={<LazyAdminOrgPage page="categories" />} />
              <Route path="badges" element={<LazyAdminOrgPage page="badges" />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
              <Route path="users" element={<DemoUsersPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="access-control" element={<DemoAccessControlPage />} />
              <Route path="*" element={<PlaceholderPage title="Administration" portalLabel="Administration" />} />
            </Route>

            <Route path="/security" element={<ProtectedRoute><SecurityPortalLayout /></ProtectedRoute>}>
              <Route index element={<SecurityDashboardPage />} />
              <Route path="occupancy" element={<SecurityOccupancyPage />} />
              <Route path="approvals" element={<SecurityApprovalsPage />} />
              <Route path="exceptions" element={<SecurityExceptionsPage />} />
              <Route path="visitors" element={<SecurityVisitorsPage />} />
              <Route path="overdue" element={<SecurityOverduePage />} />
              <Route path="watchlist" element={<SecurityWatchlistPage />} />
              <Route path="incidents" element={<SecurityIncidentsPage />} />
              <Route path="roll-call" element={<SecurityRollCallPage />} />
              <Route path="roll-call/:id" element={<SecurityRollCallDetailPage />} />
              <Route path="reports" element={<SecurityReportsPage />} />
              <Route path="*" element={<PlaceholderPage title="Security" portalLabel="Security" />} />
            </Route>

            <Route path="/host" element={<ProtectedRoute><HostPortalLayout /></ProtectedRoute>}>
              <Route index element={<HostDashboardPage />} />
              <Route path="invite" element={<HostInvitePage />} />
              <Route path="visitors" element={<HostVisitorsPage />} />
              <Route path="visitors/:id" element={<HostVisitDetailPage />} />
              <Route path="approvals" element={<HostApprovalsPage />} />
              <Route path="on-site" element={<HostOnSitePage />} />
              <Route path="notifications" element={<HostNotificationsPage />} />
              <Route path="*" element={<PlaceholderPage title="Host" portalLabel="Host" />} />
            </Route>

            <Route path="/management" element={<ProtectedRoute><ManagementPortalLayout /></ProtectedRoute>}>
              <Route index element={<ManagementDashboardPage />} />
              <Route path="occupancy" element={<ManagementOccupancyPage />} />
              <Route path="reports" element={<ManagementReportsPage />} />
              <Route path="exports" element={<ManagementExportHistoryPage />} />
              <Route path="*" element={<PlaceholderPage title="Management" portalLabel="Management" />} />
            </Route>

            <Route path="/compliance" element={<ProtectedRoute><CompliancePortalLayout /></ProtectedRoute>}>
              <Route index element={<ComplianceDashboardPage />} />
              <Route path="audit" element={<ComplianceAuditPage />} />
              <Route path="approvals" element={<ComplianceApprovalsPage />} />
              <Route path="access" element={<ComplianceAccessPage />} />
              <Route path="incidents" element={<ComplianceIncidentsPage />} />
              <Route path="privacy" element={<CompliancePrivacyPage />} />
              <Route path="retention" element={<ComplianceRetentionPage />} />
              <Route path="exports" element={<ComplianceExportLogsPage />} />
              <Route path="reports" element={<ComplianceReportsPage />} />
              <Route path="*" element={<PlaceholderPage title="Compliance" portalLabel="Compliance" />} />
            </Route>

            <Route path="/emergency" element={<ProtectedRoute><EmergencyPortalLayout /></ProtectedRoute>}>
              <Route index element={<EmergencyDashboardPage />} />
              <Route path="occupancy" element={<EmergencyOccupancyPage />} />
              <Route path="unresolved" element={<EmergencyUnresolvedPage />} />
              <Route path="roll-call" element={<EmergencyRollCallPage />} />
              <Route path="roll-call/new" element={<EmergencyRollCallPage />} />
              <Route path="roll-call/:id" element={<EmergencyRollCallDetailPage />} />
              <Route path="*" element={<PlaceholderPage title="Emergency" portalLabel="Emergency" />} />
            </Route>

            <Route path="/platform" element={<ProtectedRoute><PlatformPortalLayout /></ProtectedRoute>}>
              <Route index element={<PlatformDashboardPage />} />
              <Route path="calendar" element={<PlatformCalendarPage />} />
              <Route path="organisations" element={<PlatformOrganisationsPage />} />
              <Route path="users" element={<PlatformUsersPage />} />
              <Route path="health" element={<PlatformHealthPage />} />
              <Route path="integrations" element={<PlaceholderPage title="Integrations" portalLabel="Platform" />} />
              <Route path="support" element={<PlaceholderPage title="Support Access" portalLabel="Platform" />} />
              <Route path="audit" element={<PlatformAuditPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="*" element={<PlaceholderPage title="Platform" portalLabel="Platform" />} />
            </Route>
          </Routes>
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
