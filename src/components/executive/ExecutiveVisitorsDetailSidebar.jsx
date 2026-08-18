import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { VisitorDetailView } from '../visitors';
import { executiveApi } from '../../utils/visitorApi';
import { useViewerHostId } from '../../hooks/useViewerHostId';

export function ExecutiveVisitorsDetailActions({ visit, className = '' }) {
  if (!visit) return null;

  return (
    <div className={`flex shrink-0 gap-2 px-4 py-2 sm:gap-3 sm:px-5 sm:py-2.5 ${className}`}>
      <Link
        to={`/host/register/${visit.id}`}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
      >
        <ExternalLink size={16} aria-hidden="true" />
        View full details
      </Link>
    </div>
  );
}

export default function ExecutiveVisitorsDetailSidebar({
  visit,
  onClose,
  splitLayout = false,
}) {
  const viewerHostId = useViewerHostId();
  if (!visit?.id) return null;

  return (
    <VisitorDetailView
      visitId={visit.id}
      fetchVisit={executiveApi.getVisit}
      layout="sidebar"
      onClose={onClose}
      className="lg:min-w-[280px] lg:max-w-[360px] lg:flex-1 lg:w-auto"
      viewerHostId={viewerHostId}
      extraContent={(
        <ExecutiveVisitorsDetailActions
          visit={visit}
          className={`border-t border-gray-200 ${splitLayout ? 'lg:hidden' : ''}`}
        />
      )}
    />
  );
}
