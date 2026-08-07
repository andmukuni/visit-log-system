import { Spinner } from '../ui';
import OverviewHeader from './OverviewHeader';

export default function PortalDashboardLayout({
  title = 'Overview',
  subtitle,
  actions,
  loading,
  error,
  left,
  center,
  right,
}) {
  return (
    <div>
      <OverviewHeader title={title} subtitle={subtitle} actions={actions} />

      {loading && (
        <div className="flex justify-center py-24">
          <Spinner size={32} />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl bg-white border border-red-100 p-6 text-sm text-red-600 shadow-sm">{error}</div>
      )}

      {!loading && !error && (left || center || right) && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {left && <div className="xl:col-span-5">{left}</div>}
          {center && <div className="xl:col-span-4 space-y-5">{center}</div>}
          {right && <div className="xl:col-span-3 space-y-4">{right}</div>}
        </div>
      )}
    </div>
  );
}
