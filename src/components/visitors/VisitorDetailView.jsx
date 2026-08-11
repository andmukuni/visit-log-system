import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PageHeader,
  Card,
  ActionToolbar,
  BackAction,
  RefreshAction,
} from '../ui';
import VisitActivityPanel from '../logbook/VisitActivityPanel';
import VisitorDetailHero from './VisitorDetailHero';
import VisitSignatureCard from './VisitSignatureCard';

/**
 * Unified visitor detail layout used across portals.
 */
export default function VisitorDetailView({
  visitId,
  fetchVisit,
  breadcrumbs = [],
  backTo,
  backLabel = 'Back to logs',
  pageTitle = 'Visitor record',
  iconKey = 'visitors',
  heroFooter = null,
  renderHeroFooter = null,
  showSignature = true,
  layout = 'page',
  onClose,
  extraContent = null,
  className = '',
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!visitId) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchVisit(visitId));
    } catch (err) {
      setError(err.message || 'Unable to load visit.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [visitId, fetchVisit]);

  useEffect(() => {
    void load();
  }, [load]);

  const visit = data?.visit;
  const isSidebar = layout === 'sidebar';

  const sidebarExtra = useMemo(() => {
    const items = [];
    if (showSignature && visit?.check_in_signature) {
      items.push(
        <VisitSignatureCard
          key="signature"
          signature={visit.check_in_signature}
          visitorName={visit.full_name}
        />,
      );
    }
    return items.length ? items : null;
  }, [showSignature, visit?.check_in_signature, visit?.full_name]);

  const resolvedHeroFooter = visit
    ? (renderHeroFooter ? renderHeroFooter(visit) : heroFooter)
    : null;

  const hero = visit ? (
    <VisitorDetailHero visit={visit} footer={resolvedHeroFooter} compact={isSidebar} />
  ) : null;

  const activityPanel = (
    <VisitActivityPanel
      visitId={visitId}
      fetchVisit={fetchVisit}
      detail={data}
      loading={loading}
      error={error}
      hideVisitorCard
      sidebarExtra={sidebarExtra}
      layout={isSidebar ? 'stack' : 'grid'}
      header={hero}
    />
  );

  if (isSidebar) {
    return (
      <aside className={`flex min-h-0 w-full flex-col overflow-hidden bg-white lg:w-[360px] lg:shrink-0 lg:border-l lg:border-gray-200 ${className}`}>
        {onClose && (
          <div className="flex shrink-0 justify-end border-b border-gray-200 px-3 py-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-xs font-medium text-navy-500 hover:bg-navy-50 hover:text-navy-800"
            >
              Close
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activityPanel}
        </div>
        {extraContent}
      </aside>
    );
  }

  return (
    <div className={`mx-auto w-full max-w-7xl ${className}`}>
      <PageHeader
        title={pageTitle}
        subtitle={visit ? (visit.full_name || visit.visitor_name) : 'Loading visit…'}
        iconKey={iconKey}
        breadcrumbs={breadcrumbs}
        actions={backTo ? (
          <ActionToolbar>
            <BackAction to={backTo} label={backLabel} />
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        ) : (
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      {!loading && error && (
        <Card title="Unable to load visit" className="mb-6">
          <p className="text-sm text-red-600">{error}</p>
          {backTo ? (
            <div className="mt-3">
              <BackAction to={backTo} label={backLabel} />
            </div>
          ) : null}
        </Card>
      )}

      {!error && activityPanel}
      {extraContent}
    </div>
  );
}
