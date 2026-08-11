import { useParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { visitorApi } from '../../utils/visitorApi';

export default function VisitDetailPage({ portalPrefix = '/station' }) {
  const { id } = useParams();
  const portalLabel = portalPrefix === '/reception' ? 'Reception' : 'Station';

  return (
    <VisitorDetailView
      visitId={id}
      fetchVisit={visitorApi.getVisit}
      breadcrumbs={[
        { label: portalLabel, to: portalPrefix },
        { label: 'Visitor logs', to: `${portalPrefix}/visitors` },
        { label: 'Details' },
      ]}
      backTo={`${portalPrefix}/visitors`}
      backLabel="Back to logs"
    />
  );
}
