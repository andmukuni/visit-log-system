import { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  PageHeader,
  ActionToolbar,
  BackAction,
  RefreshAction,
} from '../../components/ui';
import VisitActivityPanel from '../../components/logbook/VisitActivityPanel';
import { visitorApi } from '../../utils/visitorApi';

export default function AdminLogBookVisitPage() {
  const { visitId } = useParams();
  const [searchParams] = useSearchParams();
  const [refreshToken, setRefreshToken] = useState(0);
  const tab = searchParams.get('tab') || 'walking';
  const backTo = `/admin/log-book?tab=${tab}`;

  const fetchVisit = useCallback((id) => visitorApi.getOrgVisit(id), []);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Visit activity"
        subtitle="Full timeline and details for this log book entry"
        iconKey="log-book"
        breadcrumbs={[
          { label: 'Administration', to: '/admin' },
          { label: 'Log Book', to: backTo },
          { label: 'Visit details' },
        ]}
        actions={(
          <ActionToolbar>
            <BackAction to={backTo} label="Back to log book" />
            <RefreshAction onClick={() => setRefreshToken((value) => value + 1)} />
          </ActionToolbar>
        )}
      />

      <VisitActivityPanel key={refreshToken} visitId={visitId} fetchVisit={fetchVisit} />
    </div>
  );
}
