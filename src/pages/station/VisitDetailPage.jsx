import { useParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { visitorApi } from '../../utils/visitorApi';

export default function VisitDetailPage({ portalPrefix = '/station' }) {
  const { id } = useParams();
  const portalLabel = portalPrefix === '/reception'
    ? 'Reception'
    : portalPrefix === '/security'
      ? 'Security'
      : portalPrefix === '/emergency'
        ? 'Emergency'
        : 'Station';
  const listPath = portalPrefix === '/emergency'
    ? `${portalPrefix}/occupancy`
    : `${portalPrefix}/visitors`;
  const listLabel = portalPrefix === '/emergency' ? 'Occupancy' : 'Visitor logs';

  return (
    <VisitorDetailView
      visitId={id}
      fetchVisit={visitorApi.getVisit}
      breadcrumbs={[
        { label: portalLabel, to: portalPrefix },
        { label: listLabel, to: listPath },
        { label: 'Details' },
      ]}
      backTo={listPath}
      backLabel={portalPrefix === '/emergency' ? 'Back to occupancy' : 'Back to logs'}
    />
  );
}
