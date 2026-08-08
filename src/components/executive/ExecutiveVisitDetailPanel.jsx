import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { Spinner, StatusBadge, VisitorTypeBadge } from '../ui';
import { executiveApi } from '../../utils/visitorApi';
import { formatDateTime } from '../../utils/helpers';
import { formatPhoneDisplay } from './appointmentDisplayUtils';

export default function ExecutiveVisitDetailPanel({ visit, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!visit?.id) {
      setData(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setData(await executiveApi.getVisit(visit.id));
    } catch (err) {
      setError(err?.message || 'Unable to load visitor details.');
    } finally {
      setLoading(false);
    }
  }, [visit?.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open || !visit) return null;

  const detail = data?.visit || visit;

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
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <StatusBadge status={detail.status} />
            <h2 id="executive-visit-detail-title" className="mt-2 truncate text-xl font-semibold text-gray-900">
              {detail.full_name || 'Visitor details'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{formatDateTime(detail.expected_at)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading && (
            <div className="flex justify-center py-16">
              <Spinner size={28} />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && (
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Type</dt>
                <dd className="mt-1">
                  <VisitorTypeBadge classification={detail.classification} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Phone</dt>
                <dd className="mt-1 font-medium text-gray-900">{formatPhoneDisplay(detail.phone) || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</dt>
                <dd className="mt-1 font-medium text-gray-900">{detail.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Company</dt>
                <dd className="mt-1 font-medium text-gray-900">{detail.company || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Purpose</dt>
                <dd className="mt-1 font-medium text-gray-900">{detail.purpose || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Host</dt>
                <dd className="mt-1 font-medium text-gray-900">{detail.host_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pass code</dt>
                <dd className="mt-1 font-medium text-gray-900">{detail.pass_code || '—'}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 px-4 py-3 sm:px-6">
          <Link
            to={`/executive/visitors/${detail.id}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            <ExternalLink size={16} aria-hidden="true" />
            View Full Details
          </Link>
        </div>
      </aside>
    </>,
    document.body,
  );
}
