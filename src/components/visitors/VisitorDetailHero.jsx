import {
  Building2,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import { StatusBadge, VisitorTypeBadge } from '../ui';
import { formatDateTime } from '../../utils/helpers';
import { formatVisitHostLabel, visitorInitials } from './visitorDetailUtils';

export default function VisitorDetailHero({ visit, footer = null, compact = false }) {
  if (!visit) return null;

  const passCode = visit.pass_code || visit.reference_number || '—';

  return (
    <section className={`overflow-hidden rounded-2xl border border-navy-100 bg-gradient-to-br from-white via-white to-cyan-50/50 shadow-sm ${compact ? '' : 'mb-6'}`}>
      <div className={`flex flex-col gap-5 ${compact ? 'p-4' : 'gap-6 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between'}`}>
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div
            className={`flex shrink-0 items-center justify-center rounded-2xl bg-navy-900 font-bold tracking-wide text-white shadow-md ${
              compact ? 'h-12 w-12 text-base' : 'h-16 w-16 text-lg'
            }`}
            aria-hidden="true"
          >
            {visitorInitials(visit.full_name || visit.visitor_name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={visit.status} />
              {visit.classification ? (
                <VisitorTypeBadge classification={visit.classification} size="xs" />
              ) : null}
            </div>
            <h2 className={`mt-2 truncate font-bold tracking-tight text-navy-900 ${compact ? 'text-lg' : 'text-2xl'}`}>
              {visit.full_name || visit.visitor_name || 'Visitor'}
            </h2>
            <div className="mt-2 flex flex-col gap-1 text-sm text-navy-600">
              {visit.company ? (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={14} className="shrink-0 text-navy-400" aria-hidden="true" />
                  {visit.company}
                </span>
              ) : null}
              {visit.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={14} className="shrink-0 text-navy-400" aria-hidden="true" />
                  {visit.phone}
                </span>
              ) : null}
              {visit.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={14} className="shrink-0 text-navy-400" aria-hidden="true" />
                  {visit.email}
                </span>
              ) : null}
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-navy-800">
              <User size={14} className="shrink-0 text-cyan-700" aria-hidden="true" />
              Host: {formatVisitHostLabel(visit)}
            </p>
            {visit.site_name ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-navy-500">
                <MapPin size={12} className="shrink-0" aria-hidden="true" />
                {visit.site_name}
              </p>
            ) : null}
          </div>
        </div>

        <div className={`grid shrink-0 gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 lg:gap-4'}`}>
          <div className="rounded-xl border border-navy-100 bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Pass code</p>
            <p className={`mt-1 font-mono font-bold tracking-widest text-navy-900 ${compact ? 'text-lg' : 'text-xl'}`}>
              {passCode}
            </p>
          </div>
          {visit.badge_number ? (
            <div className="rounded-xl border border-navy-100 bg-white px-4 py-3 text-center shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Badge</p>
              <p className="mt-1 text-lg font-bold text-navy-900">{visit.badge_number}</p>
            </div>
          ) : null}
          {visit.expected_at ? (
            <div className={`rounded-xl border border-navy-100 bg-white px-4 py-3 ${compact ? '' : 'col-span-2 sm:col-span-1 lg:col-span-1'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Expected</p>
              <p className="mt-1 text-sm font-semibold text-navy-900">{formatDateTime(visit.expected_at)}</p>
            </div>
          ) : null}
        </div>
      </div>

      {footer ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 bg-navy-50/60 px-4 py-3 sm:px-6">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
