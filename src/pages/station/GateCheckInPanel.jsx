import { useCallback, useEffect, useState } from 'react';
import { Car, Footprints, LogIn, Search, User } from 'lucide-react';
import { LoadingButton, VisitStatusBadge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { isCheckInEligible } from '../../../shared/visitCheckIn.js';
import { getReceptionCheckInActionLabel } from '../../../shared/visitReceptionActions.js';
import { visitorApi } from '../../utils/visitorApi';
import { visitorDisplayName } from '../../utils/helpers';

const INPUT_MD =
  'w-full rounded-xl border border-navy-200 bg-navy-50 text-navy-900 placeholder:text-navy-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500 py-3 pl-10 pr-3 text-base';

function FieldLabel({ children }) {
  return <label className="mb-2 block text-sm font-semibold text-navy-800">{children}</label>;
}

function FormSection({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      {(title || subtitle) && (
        <div className="mb-4 border-b border-navy-100 pb-3">
          {title ? <h3 className="text-sm font-semibold text-navy-900">{title}</h3> : null}
          {subtitle ? <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

function SignaturePreview({ src, name }) {
  if (!src) {
    return <span className="text-xs text-navy-400">No signature</span>;
  }

  return (
    <img
      src={src}
      alt={name ? `Gate signature for ${name}` : 'Gate signature'}
      className="h-10 w-full max-w-[5.5rem] rounded-md bg-white object-contain object-left"
    />
  );
}

export default function GateCheckInPanel({
  mode = 'walk-in',
  onCheckedIn,
  onRowClick,
  onPendingCountChange,
  fetchPendingVisits,
  pendingSubtitle,
  pendingEmptyHint,
  emptyExtra,
  showPendingHeader = true,
}) {
  const toast = useToast();
  const isVehicle = mode === 'vehicle';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);
  const [checkingIn, setCheckingIn] = useState(null);
  const hasSearch = Boolean(query.trim());

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const rows = fetchPendingVisits
        ? await fetchPendingVisits(mode)
        : await visitorApi.getPendingCheckIns(mode);
      setResults(Array.isArray(rows) ? rows.filter((v) => isCheckInEligible(v.status)) : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load pending check-ins.');
      setResults([]);
    } finally {
      setLoadingPending(false);
    }
  }, [fetchPendingVisits, mode, toast]);

  useEffect(() => {
    setQuery('');
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    onPendingCountChange?.(results.length);
  }, [results.length, onPendingCountChange]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      void loadPending();
      return;
    }
    setSearching(true);
    try {
      const rows = await visitorApi.lookupVisit(query.trim(), mode);
      const eligible = (rows || []).filter((v) => isCheckInEligible(v.status));
      setResults(eligible);
      if (eligible.length === 0) {
        toast.info(`No matching ${isVehicle ? 'vehicle' : 'walk-in'} visits ready for check-in.`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleCheckIn = async (visitId) => {
    setCheckingIn(visitId);
    try {
      await visitorApi.checkInVisit(visitId);
      toast.success(`${isVehicle ? 'Vehicle' : 'Visitor'} checked in successfully.`);
      onCheckedIn?.(visitId);
      setResults((prev) => prev.filter((v) => v.id !== visitId));
      if (!hasSearch) {
        void loadPending();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCheckingIn(null);
    }
  };

  const searchPlaceholder = isVehicle
    ? 'Plate, driver name, pass code…'
    : 'Name, phone, badge or pass code…';

  const emptyIcon = isVehicle ? Car : User;
  const EmptyIcon = emptyIcon;

  const pendingListSubtitle = (() => {
    if (loadingPending) return 'Loading pending arrivals…';
    if (results.length) {
      if (hasSearch) return `${results.length} match${results.length === 1 ? '' : 'es'}`;
      if (pendingSubtitle) {
        return `${results.length} appointment${results.length === 1 ? '' : 's'} today`;
      }
      return `${results.length} waiting`;
    }
    return pendingSubtitle || `Gate entries and approved ${isVehicle ? 'vehicle' : 'walk-in'} visits appear here`;
  })();

  return (
    <div className="space-y-5">
      <FormSection
        title={isVehicle ? 'Find vehicle visit' : 'Find visitor'}
        subtitle={isVehicle ? 'Search by plate, driver, or pass code' : 'Search by name, phone, badge or pass code'}
      >
        <form onSubmit={handleSearch} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <FieldLabel>Search</FieldLabel>
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className={INPUT_MD}
                autoFocus
              />
            </div>
          </div>
          <LoadingButton
            type="submit"
            size="lg"
            loading={searching}
            loadingLabel="Searching…"
            icon={Search}
            className="w-full shrink-0 bg-cyan-600 hover:bg-cyan-700 border-cyan-600 sm:w-auto sm:min-w-[8rem]"
          >
            Search
          </LoadingButton>
        </form>
      </FormSection>

      <FormSection
        title={showPendingHeader ? 'Ready for check-in' : undefined}
        subtitle={showPendingHeader ? pendingListSubtitle : undefined}
      >
        {loadingPending ? (
          <div className="py-10 text-center text-sm text-navy-500">Loading visitors…</div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-navy-100 bg-navy-50 text-navy-400">
              <EmptyIcon size={22} aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-navy-700">
              {hasSearch ? 'No matching visits ready for check-in' : 'No visitors waiting for check-in'}
            </p>
            <p className="max-w-sm text-xs text-navy-400">
              {hasSearch
                ? 'Try another name, phone, badge or pass code.'
                : (pendingEmptyHint || 'Walk-in gate entries and approved visits will show here automatically.')}
            </p>
            {!hasSearch && emptyExtra ? <div className="mt-3">{emptyExtra}</div> : null}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <div className="min-w-[640px]">
              <div className="hidden grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.75rem_7rem_3rem] gap-3 border-b border-navy-100 bg-navy-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-navy-500 sm:grid">
                <span>Visitor</span>
                <span>Purpose of visit</span>
                <span>Signature</span>
                <span>Status</span>
                <span className="text-right">Action</span>
              </div>
              <ul className="divide-y divide-navy-100">
                {results.map((row) => {
                  const busy = checkingIn === row.id || Boolean(checkingIn);
                  const rowInteractive = typeof onRowClick === 'function';
                  const checkInAction = getReceptionCheckInActionLabel(row.status);
                  return (
                    <li
                      key={row.id}
                      role={rowInteractive ? 'button' : undefined}
                      tabIndex={rowInteractive && !busy ? 0 : undefined}
                      aria-label={rowInteractive ? `View ${visitorDisplayName(row, 'visitor')}` : undefined}
                      onClick={() => {
                        if (!rowInteractive || busy) return;
                        onRowClick(row);
                      }}
                      onKeyDown={(e) => {
                        if (!rowInteractive || busy) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }}
                      className={`grid grid-cols-1 gap-3 px-4 py-4 transition-colors sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.75rem_7rem_3rem] sm:items-center sm:gap-3 ${
                        busy
                          ? 'opacity-70'
                          : rowInteractive
                            ? 'cursor-pointer hover:bg-navy-50/70 focus-visible:bg-navy-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500'
                            : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-navy-900">{visitorDisplayName(row)}</p>
                        <p className="mt-0.5 truncate text-sm text-navy-500">
                          Host: {row.host_name || '—'}
                          {row.plate_numbers ? ` · ${row.plate_numbers}` : ''}
                          {row.pass_code ? ` · Pass ${row.pass_code}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
                          <VisitStatusBadge visit={row} />
                          {isVehicle ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600">
                              <Car size={12} aria-hidden="true" />
                              Vehicle
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600">
                              <Footprints size={12} aria-hidden="true" />
                              Walk-in
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">Purpose of visit</span>
                        <p className="truncate text-sm text-navy-700">
                          {row.purpose || row.appointment_title || '—'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 sm:justify-start">
                        <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">Signature</span>
                        <SignaturePreview src={row.check_in_signature} name={visitorDisplayName(row)} />
                      </div>
                      <div className="hidden flex-col gap-1 sm:flex sm:justify-start">
                        <VisitStatusBadge visit={row} />
                        {isVehicle ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600">
                            <Car size={12} aria-hidden="true" />
                            Vehicle
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600">
                            <Footprints size={12} aria-hidden="true" />
                            Walk-in
                          </span>
                        )}
                      </div>
                      <div className="flex sm:justify-end" onClick={(e) => e.stopPropagation()}>
                        <LoadingButton
                          loading={checkingIn === row.id}
                          loadingLabel={checkInAction.loadingLabel}
                          aria-label={checkInAction.label}
                          icon={LogIn}
                          iconOnly
                          size="lg"
                          disabled={busy}
                          onClick={() => void handleCheckIn(row.id)}
                          className="shrink-0 bg-emerald-600 hover:bg-emerald-500 border-emerald-600"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </FormSection>
    </div>
  );
}
