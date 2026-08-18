import { useParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { hostApi } from '../../utils/visitorApi';
import { useViewerHostId } from '../../hooks/useViewerHostId';

export default function HostVisitDetailPage() {
  const { id } = useParams();
  const viewerHostId = useViewerHostId();

  return (
    <VisitorDetailView
      visitId={id}
      fetchVisit={hostApi.getVisit}
      viewerHostId={viewerHostId}
      breadcrumbs={[
        { label: 'Host', to: '/host' },
        { label: 'My contacts', to: '/host/contacts' },
        { label: 'Details' },
      ]}
      backTo="/host/contacts"
      backLabel="Back to contacts"
    />
  );
}
