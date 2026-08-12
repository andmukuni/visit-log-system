import { useParams } from 'react-router-dom';
import { VisitorDetailView } from '../../components/visitors';
import { visitorApi, securityApi } from '../../utils/visitorApi';

export default function VisitDetailPage({ portalPrefix = '/station' }) {
  const { id } = useParams();
  // Security must use its own site/building/gate-scoped endpoint — the
  // generic visits endpoint has no such check and would leak any visit's
  // full unmasked record to any security officer regardless of assignment.
  const fetchVisit = portalPrefix === '/security' ? securityApi.getVisit : visitorApi.getVisit;
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
      fetchVisit={fetchVisit}
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
