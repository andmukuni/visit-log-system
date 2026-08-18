import {
  Building2,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import { RestrictedIndicator, StatusBadge, VisitorTypeBadge } from '../ui';
import { formatDateTime } from '../../utils/helpers';
import { formatVisitHostName, getVisitHostPosition, visitorInitials } from './visitorDetailUtils';
import { resolveJourneyStatusKey, resolveJourneyLabel } from '../../../shared/visitJourney.js';

function MetaBlock({ icon: Icon, label, children }) {
  if (!children) return null;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-navy-400">
        {Icon ? <Icon size={11} className="shrink-0" aria-hidden="true" /> : null}
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium leading-snug text-navy-900">
        {children}
      </div>
    </div>
  );
}

export default function VisitorDetailHero({ visit, footer = null, compact = false, viewerHostId = null }) {
  if (!visit) return null;

  const passCode = visit.pass_code || visit.reference_number || '—';
  const hostName = formatVisitHostName(visit, { empty: '' });
  const hostPosition = getVisitHostPosition(visit);
  const visitorName = visit.full_name || visit.visitor_name || 'Visitor';
  const hasContact = Boolean(visit.phone || visit.email);
  const hasHost = Boolean(hostName);
  const hasMeta = Boolean(visit.company || hasContact || hasHost || visit.site_name);

  const hasCheckedIn = Boolean(visit.checked_in_at || visit.check_in_at);
  const journeyKey = resolveJourneyStatusKey(visit.status, hasCheckedIn);
  const journeyLabel = resolveJourneyLabel(visit.status, hasCheckedIn, {
    viewerHostId,
    visitHostId: visit.host_id,
  });

  return (
    <section className={`overflow-hidden rounded-2xl border border-navy-100 bg-gradient-to-br from-white via-white to-cyan-50/40 shadow-sm ${compact ? '' : 'mb-6'}`}>
      <div className={compact ? 'p-4' : 'p-5 sm:p-6'}>
        <div className={`flex gap-4 ${compact ? 'items-start' : 'flex-col gap-5 sm:flex-row sm:items-start sm:justify-between'}`}>
          <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
            <div
              className={`flex shrink-0 items-center justify-center rounded-2xl bg-navy-900 font-bold tracking-wide text-white shadow-md ${
                compact ? 'h-12 w-12 text-base' : 'h-14 w-14 text-lg sm:h-16 sm:w-16'
              }`}
              aria-hidden="true"
            >
              {visitorInitials(visitorName)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={journeyKey || visit.status} label={journeyLabel} />
                {visit.classification ? (
                  <VisitorTypeBadge classification={visit.classification} size="xs" />
                ) : null}
                {visit._accessLevel === 'restricted' ? (
                  <RestrictedIndicator size="xs" />
                ) : null}
              </div>
              <h2 className={`mt-2 font-bold tracking-tight text-navy-900 ${compact ? 'truncate text-lg' : 'text-xl sm:text-2xl'}`}>
                {visitorName}
              </h2>
              {visit.site_name ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-navy-500">
                  <MapPin size={12} className="shrink-0" aria-hidden="true" />
                  {visit.site_name}
                </p>
              ) : null}
            </div>
          </div>

          <div className={`grid shrink-0 gap-2 ${compact ? 'grid-cols-1' : 'w-full grid-cols-2 sm:w-auto sm:min-w-[11.5rem] sm:grid-cols-1'}`}>
            {visit.pass_code || visit.reference_number ? (
              <div className="rounded-2xl border border-cyan-100 bg-white px-4 py-3 text-center shadow-sm ring-1 ring-cyan-50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700/80">Pass code</p>
                <p className={`mt-1 font-mono font-bold tracking-[0.2em] text-navy-900 ${compact ? 'text-lg' : 'text-2xl'}`}>
                  {passCode}
                </p>
              </div>
            ) : null}
            {visit.badge_number ? (
              <div className="rounded-2xl border border-navy-100 bg-white px-4 py-3 text-center shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Badge</p>
                <p className="mt-1 text-lg font-bold text-navy-900">{visit.badge_number}</p>
              </div>
            ) : null}
            {visit.expected_at ? (
              <div className={`rounded-2xl border border-navy-100 bg-white px-4 py-3 ${compact ? '' : 'col-span-2 sm:col-span-1'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Expected</p>
                <p className="mt-1 text-sm font-semibold text-navy-900">{formatDateTime(visit.expected_at)}</p>
              </div>
            ) : null}
          </div>
        </div>

        {hasMeta ? (
          <div className={`mt-5 grid gap-4 border-t border-navy-100/80 pt-4 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            <MetaBlock icon={Building2} label="Company">
              {visit.company || null}
            </MetaBlock>

            <MetaBlock icon={Phone} label="Contact">
              {hasContact ? (
                <div className="space-y-1">
                  {visit.phone ? (
                    <p className="inline-flex min-w-0 items-center gap-1.5">
                      <Phone size={13} className="shrink-0 text-navy-400" aria-hidden="true" />
                      <span className="truncate">{visit.phone}</span>
                    </p>
                  ) : null}
                  {visit.email ? (
                    <p className="inline-flex min-w-0 items-center gap-1.5 font-normal text-navy-700">
                      <Mail size={13} className="shrink-0 text-navy-400" aria-hidden="true" />
                      <span className="truncate">{visit.email}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </MetaBlock>

            <MetaBlock icon={User} label="Host">
              {hasHost ? (
                <div>
                  <p>{hostName}</p>
                  {hostPosition ? (
                    <p className="mt-0.5 text-xs font-normal text-navy-500">{hostPosition}</p>
                  ) : null}
                </div>
              ) : null}
            </MetaBlock>
          </div>
        ) : null}
      </div>

      {footer ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 bg-navy-50/60 px-4 py-3 sm:px-6">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
