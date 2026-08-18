import { useParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { executiveApi } from '../../utils/visitorApi';
import { useViewerHostId } from '../../hooks/useViewerHostId';

export default function ExecutiveVisitDetailPage() {
  const { id } = useParams();
  const viewerHostId = useViewerHostId();

  return (
    <VisitorDetailView
      visitId={id}
      fetchVisit={executiveApi.getVisit}
      viewerHostId={viewerHostId}
      breadcrumbs={[
        { label: 'Host', to: '/host' },
        { label: 'Visitor register', to: '/host/register' },
        { label: 'Details' },
      ]}
      backTo="/host/register"
      backLabel="Back to register"
    />
  );
}
