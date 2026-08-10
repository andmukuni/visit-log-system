import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PageHeader,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import LogBookFilterBar from '../../components/logbook/LogBookFilterBar';
import VisitLogTable from '../../components/logbook/VisitLogTable';
import { ADMIN_VISIT_TABS, filterVisitTabs } from '../../components/logbook/visitLogTabs';
import { useAuth } from '../../context/AuthContext';
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';
import { visitorApi } from '../../utils/visitorApi';

export default function AdminLogBookPage() {
  const { hasPermission } = useAuth();
  const { queryParams, organisationId } = useAdminOrganisation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const availableTabs = useMemo(
    () => filterVisitTabs(ADMIN_VISIT_TABS, hasPermission),
    [hasPermission],
  );

  const tabFromUrl = searchParams.get('tab');
  const activeTab = availableTabs.some((item) => item.value === tabFromUrl)
    ? tabFromUrl
    : availableTabs[0]?.value;

  const currentTab = availableTabs.find((item) => item.value === activeTab) || availableTabs[0];

  const handleTabChange = (nextTab) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextTab) params.set('tab', nextTab);
      else params.delete('tab');
      return params;
    }, { replace: true });
  };

  const loadRows = useCallback(async ({ visitType, status: nextStatus }) => {
    const params = { type: visitType, ...queryParams };
    if (nextStatus) params.status = nextStatus;
    return visitorApi.getOrgVisits(params);
  }, [queryParams]);

  const handleRowClick = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/log-book/${row.id}?tab=${activeTab || 'walking'}`);
  }, [activeTab, navigate]);

  if (availableTabs.length === 0) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Log Book"
        subtitle="Organisation visit register for walking and vehicle entries"
        iconKey="log-book"
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={() => setRefreshToken((value) => value + 1)} />
          </ActionToolbar>
        )}
      />

      <LogBookFilterBar
        tabs={availableTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        currentTab={currentTab}
        status={status}
        onStatusChange={setStatus}
      />

      {currentTab && (
        <VisitLogTable
          key={`${currentTab.value}-${status}-${refreshToken}-${organisationId || 'all'}`}
          visitType={currentTab.visitType}
          status={status}
          emptyTitle={currentTab.emptyTitle}
          emptyDescription={currentTab.emptyDescription}
          searchPlaceholder={currentTab.searchPlaceholder}
          loadRows={loadRows}
          showOrganisationColumn={!organisationId}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  );
}
