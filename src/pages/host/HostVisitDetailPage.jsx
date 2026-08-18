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
        { label: 'Visitor logs', to: '/host/visitors' },
        { label: 'Details' },
      ]}
      backTo="/host/visitors"
      backLabel="Back to visitor logs"
    />
  );
}
