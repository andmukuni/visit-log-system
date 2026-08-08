import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { Spinner, StatusBadge, VisitorTypeBadge } from '../ui';
import { executiveApi } from '../../utils/visitorApi';
import { formatDateTime } from '../../utils/helpers';
import {
  formatPhoneDisplay,
  formatVisitExpectedDisplay,
} from './appointmentDisplayUtils';

function DetailRow({ icon: Icon, label, value }) {
  return (
    <>
      <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0 pb-2">
        <p className="text-xs font-medium leading-none text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-semibold leading-snug text-navy-900 break-words">
          {value || '—'}
        </p>
      </div>
    </>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="mt-4 sm:mt-5">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
        {title}
      </h3>
      <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">{children}</div>
    </section>
  );
}

export function ExecutiveVisitorsDetailActions({ visit, className = '' }) {
  if (!visit) return null;

  return (
    <div className={`flex shrink-0 gap-2 px-4 py-2 sm:gap-3 sm:px-5 sm:py-2.5 ${className}`}>
      <Link
        to={`/executive/visitors/${visit.id}`}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
      >
        <ExternalLink size={16} aria-hidden="true" />
        View Full Details
      </Link>
    </div>
  );
}

export default function ExecutiveVisitorsDetailSidebar({
  visit,
  onClose,
  splitLayout = false,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!visit?.id) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setData(await executiveApi.getVisit(visit.id));
    } catch (err) {
      setData(null);
      setError(err?.message || 'Unable to load visitor details.');
    } finally {
      setLoading(false);
    }
  }, [visit?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!visit) return null;

  const detail = data?.visit || visit;
  const { range, dayLabel } = formatVisitExpectedDisplay(detail.expected_at);
  const phone = formatPhoneDisplay(detail.phone);

  return (
    <aside className="flex min-h-0 w-full flex-col overflow-hidden border-l border-gray-200 bg-white lg:min-w-[280px] lg:max-w-[360px] lg:flex-1">
      <div className="flex shrink-0 items-center justify-between px-4 pb-1.5 pt-3 sm:px-5 sm:pt-3.5">
        <StatusBadge status={detail.status} />
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close details"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
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
          <>
            <div className="flex items-start gap-2.5 pt-0.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 sm:h-10 sm:w-10 sm:rounded-xl">
                <UserCheck size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-xs text-gray-500">{dayLabel}</p>
                <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-navy-900 sm:text-2xl">
                  {range}
                </p>
                {detail.expected_at && (
                  <p className="mt-1 text-xs text-gray-400">{formatDateTime(detail.expected_at)}</p>
                )}
              </div>
            </div>

            <h2 className="mt-3 text-lg font-bold leading-tight text-navy-900 sm:mt-4 sm:text-xl">
              {detail.full_name || 'Visitor'}
            </h2>
            <div className="mt-2.5">
              <VisitorTypeBadge classification={detail.classification} />
            </div>

            <DetailSection title="Visitor Details">
              <DetailRow icon={User} label="Name" value={detail.full_name} />
              <DetailRow icon={Phone} label="Phone" value={phone} />
              <DetailRow icon={Mail} label="Email" value={detail.email} />
            </DetailSection>

            <DetailSection title="Visit Details">
              <DetailRow icon={ClipboardList} label="Purpose" value={detail.purpose} />
              <DetailRow icon={User} label="Host" value={detail.host_name} />
              <DetailRow icon={MapPin} label="Location" value={detail.site_name} />
              <DetailRow icon={BadgeCheck} label="Pass code" value={detail.pass_code} />
              <DetailRow icon={CircleHelp} label="Company" value={detail.company} />
            </DetailSection>
          </>
        )}
      </div>

      <ExecutiveVisitorsDetailActions
        visit={detail}
        className={`border-t border-gray-200 ${splitLayout ? 'lg:hidden' : ''}`}
      />
    </aside>
  );
}
