import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, Footprints, LogOut, Search, User } from 'lucide-react';
import { LoadingButton, StatusBadge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { isGateCheckoutEligible } from '../../../shared/visitCheckout.js';
import { formatNrcInput } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

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
      alt={name ? `Check-in signature for ${name}` : 'Check-in signature'}
      className="h-10 w-full max-w-[5.5rem] rounded-md bg-white object-contain object-left"
    />
  );
}

function formatVisitNrc(row) {
  const raw = row.id_number || row.id_number_masked;
  if (!raw) return '—';
  if (String(row.id_type || '').toLowerCase() === 'nrc') {
    return formatNrcInput(raw) || raw;
  }
  return raw;
}

export default function GateCheckOutPanel({ mode = 'walk-in' }) {
  const toast = useToast();
  const isVehicle = mode === 'vehicle';
  const [query, setQuery] = useState('');
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(null);

  const loadOnSite = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visitorApi.getOnSiteVisits(mode);
      setVisits(Array.isArray(rows) ? rows.filter((v) => isGateCheckoutEligible(v.status)) : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load on-site visits.');
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [mode, toast]);

  useEffect(() => {
    setQuery('');
    void loadOnSite();
  }, [loadOnSite]);

  const filteredVisits = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return visits;
    return visits.filter((row) => {
      const haystack = [
        row.full_name,
        row.host_name,
        row.pass_code,
        row.badge_number,
        row.plate_numbers,
        row.phone,
        row.id_number,
        row.id_number_masked,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [query, visits]);

  const handleCheckOut = async (visitId) => {
    setCheckingOut(visitId);
    try {
      await visitorApi.checkOutVisit(visitId);
      toast.success(`${isVehicle ? 'Vehicle' : 'Visitor'} checked out successfully.`);
      setVisits((prev) => prev.filter((v) => v.id !== visitId));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCheckingOut(null);
    }
  };

  const EmptyIcon = isVehicle ? Car : User;

  return (
    <div className="space-y-5">
      <FormSection
        title={isVehicle ? 'On-site vehicles' : 'Checked-in visitors'}
        subtitle={loading ? 'Loading…' : `${filteredVisits.length} currently on site`}
      >
        <div className="mb-4">
          <FieldLabel>Filter list</FieldLabel>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isVehicle ? 'Filter by plate, name, or pass code…' : 'Filter by name, NRC, or pass code…'}
              className={INPUT_MD}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-navy-500">Loading on-site visits…</div>
        ) : filteredVisits.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-navy-100 bg-navy-50 text-navy-400">
              <EmptyIcon size={22} aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-navy-700">No one on site to check out</p>
            <p className="max-w-sm text-xs text-navy-400">
              {query.trim()
                ? 'Try a different filter term.'
                : `Checked-in ${isVehicle ? 'vehicle' : 'walk-in'} visits will appear here. Make sure the ${isVehicle ? 'Vehicle' : 'Walk-in'} filter above is selected.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <div className="min-w-[640px]">
            <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_5.75rem_7rem_3rem] gap-3 border-b border-navy-100 bg-navy-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-navy-500 sm:grid">
              <span>Visitor</span>
              <span>NRC</span>
              <span>Signature</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <ul className="divide-y divide-navy-100">
              {filteredVisits.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_7.5rem_5.75rem_7rem_3rem] sm:items-center sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-navy-900">{row.full_name || 'Visitor'}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">NRC</span>
                    <p className="truncate font-mono text-sm text-navy-600">{formatVisitNrc(row)}</p>
                  </div>
                  <div className="flex flex-col gap-1 sm:justify-start">
                    <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">Signature</span>
                    <SignaturePreview src={row.check_in_signature} name={row.full_name} />
                  </div>
                  <div className="flex flex-col gap-1 sm:justify-start">
                    <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">Status</span>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="flex sm:justify-end">
                    <LoadingButton
                      loading={checkingOut === row.id}
                      loadingLabel="Checking out…"
                      aria-label="Checkout"
                      icon={LogOut}
                      iconOnly
                      size="lg"
                      onClick={() => handleCheckOut(row.id)}
                      className="bg-navy-800 hover:bg-navy-700 border-navy-800"
                    />
                  </div>
                </li>
              ))}
            </ul>
            </div>
          </div>
        )}
      </FormSection>
    </div>
  );
}
