import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Car, Footprints, RefreshCw, User } from 'lucide-react';
import { LoadingButton, StatusBadge, VisitorTypeBadge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatVisitHostPositionLine } from '../../components/visitors/visitorDetailUtils';
import { formatTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

function FormSection({ title, subtitle, children, actions = null }) {
  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      {(title || subtitle || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-navy-100 pb-3">
          <div className="min-w-0">
            {title ? <h3 className="text-sm font-semibold text-navy-900">{title}</h3> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

function arrivalAt(row) {
  return row.expected_at || row.appointment_scheduled_at || row.created_at;
}

function hasVehicle(row) {
  return Boolean(String(row.expected_plates || row.plate_numbers || '').trim());
}

export default function GateExpectedTodayPanel({ mode = 'walk-in' }) {
  const toast = useToast();
  const isVehicle = mode === 'vehicle';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await visitorApi.getExpectedArrivals({ range: 'today' });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load today’s expected visitors.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const list = rows.filter((row) => (isVehicle ? hasVehicle(row) : !hasVehicle(row)));
    return [...list].sort((a, b) => {
      const aTime = new Date(arrivalAt(a)).getTime();
      const bTime = new Date(arrivalAt(b)).getTime();
      return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
    });
  }, [isVehicle, rows]);

  return (
    <div className="space-y-4">
      <FormSection
        title="Visitors today"
        subtitle={
          isVehicle
            ? 'All expected vehicle guests today — VIP, VVIP, and general hosts'
            : 'All expected walk-in guests today — VIP, VVIP, and general hosts'
        }
        actions={(
          <LoadingButton
            type="button"
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={loading}
            onClick={() => { void load(); }}
          >
            Refresh
          </LoadingButton>
        )}
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-navy-500">Loading expected visitors…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/50 px-4 py-10 text-center">
            <CalendarClock className="mx-auto mb-2 text-navy-300" size={28} aria-hidden="true" />
            <p className="text-sm font-medium text-navy-700">No expected {isVehicle ? 'vehicle' : 'walk-in'} guests today</p>
            <p className="mt-1 text-xs text-navy-500">
              Host appointments and approved visits for today will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-navy-100">
            {filtered.map((row) => {
              const when = arrivalAt(row);
              const plates = row.expected_plates || row.plate_numbers || '';
              return (
                <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-navy-50 text-navy-600">
                      {isVehicle ? <Car size={18} aria-hidden="true" /> : <Footprints size={18} aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-navy-900">{row.full_name || 'Visitor'}</p>
                        <VisitorTypeBadge classification={row.classification} />
                        <StatusBadge status={row.status} />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-navy-500">
                        <User size={12} aria-hidden="true" />
                        <span className="truncate">Host: {formatVisitHostPositionLine(row)}</span>
                      </p>
                      {plates ? (
                        <p className="mt-0.5 text-xs font-medium text-navy-600">Vehicle: {plates}</p>
                      ) : null}
                      {row.appointment_title || row.purpose ? (
                        <p className="mt-0.5 truncate text-xs text-navy-400">
                          {row.appointment_title || row.purpose}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right sm:pl-4">
                    <p className="text-sm font-semibold text-cyan-800">{formatTime(when)}</p>
                    <p className="text-[11px] text-navy-400">Expected</p>
                    {row.pass_code ? (
                      <p className="mt-0.5 font-mono text-[11px] text-navy-500">{row.pass_code}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>
    </div>
  );
}
