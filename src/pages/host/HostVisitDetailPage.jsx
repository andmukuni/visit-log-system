import { useParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { hostApi } from '../../utils/visitorApi';

export default function HostVisitDetailPage() {
  const { id } = useParams();

  return (
    <VisitorDetailView
      visitId={id}
      fetchVisit={hostApi.getVisit}
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
