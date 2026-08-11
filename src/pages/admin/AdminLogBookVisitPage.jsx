import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { visitorApi } from '../../utils/visitorApi';
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';

export default function AdminLogBookVisitPage() {
  const { visitId } = useParams();
  const { queryParams } = useAdminOrganisation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'walking';
  const backTo = `/admin/log-book?tab=${tab}`;

  const fetchVisit = useCallback((id) => visitorApi.getOrgVisit(id, queryParams), [queryParams]);

  return (
    <VisitorDetailView
      visitId={visitId}
      fetchVisit={fetchVisit}
      pageTitle="Visit activity"
      iconKey="log-book"
      breadcrumbs={[
        { label: 'Administration', to: '/admin' },
        { label: 'Log book', to: backTo },
        { label: 'Visit details' },
      ]}
      backTo={backTo}
      backLabel="Back to log book"
    />
  );
}
