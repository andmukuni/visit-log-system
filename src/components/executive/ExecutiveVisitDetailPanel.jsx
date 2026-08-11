import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { VisitorDetailView } from '../visitors';
import { executiveApi } from '../../utils/visitorApi';

export default function ExecutiveVisitDetailPanel({ visit, open, onClose }) {
  if (!open || !visit?.id) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[64] bg-navy-950/30 backdrop-blur-[1px] animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="executive-visit-detail-title"
        className="fixed inset-y-0 right-0 z-[65] flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl animate-executive-detail-panel sm:w-1/2 sm:max-w-[720px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 id="executive-visit-detail-title" className="text-sm font-semibold text-navy-900">
            Visitor record
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <VisitorDetailView
            visitId={visit.id}
            fetchVisit={executiveApi.getVisit}
            layout="sidebar"
            className="h-full border-0 lg:w-full lg:max-w-none"
          />
        </div>

        <div className="shrink-0 border-t border-gray-200 px-4 py-3 sm:px-6">
          <Link
            to={`/host/register/${visit.id}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            <ExternalLink size={16} aria-hidden="true" />
            View full details
          </Link>
        </div>
      </aside>
    </>,
    document.body,
  );
}
