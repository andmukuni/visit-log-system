import { useParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { executiveApi } from '../../utils/visitorApi';

export default function ExecutiveVisitDetailPage() {
  const { id } = useParams();

  return (
    <VisitorDetailView
      visitId={id}
      fetchVisit={executiveApi.getVisit}
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
