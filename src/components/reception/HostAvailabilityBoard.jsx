import { useMemo, useState } from 'react';
import { User, UserCheck } from 'lucide-react';
import { FilterPills, LoadingButton, Spinner } from '../ui';
import { formatDateTime } from '../../utils/helpers';

function hostInitials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function isAvailable(availability) {
  return availability !== 'unavailable' && availability !== 'occupied';
}

function AvailabilityIndicator({ available }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        available
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          : 'bg-rose-50 text-rose-700 ring-rose-600/20'
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${available ? 'bg-emerald-500' : 'bg-rose-500'}`}
        aria-hidden="true"
      />
      {available ? 'Available' : 'Not available'}
    </span>
  );
}

function KpiTile({ label, value, tone = 'navy' }) {
  const tones = {
    navy: 'text-navy-900',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
  };
  return (
    <div className="rounded-xl border border-navy-100 bg-white px-3 py-2.5 sm:px-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone] || tones.navy}`}>{value}</p>
    </div>
  );
}

export default function HostAvailabilityBoard({
  hosts = [],
  departments = [],
  departmentId = '',
  onDepartmentChange,
  onMarkAvailability,
  loading = false,
}) {
  const [savingId, setSavingId] = useState(null);

  const deptOptions = useMemo(() => [
    { value: '', label: 'All departments' },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ], [departments]);

  const availableCount = hosts.filter((h) => isAvailable(h.availability)).length;
  const unavailableCount = hosts.length - availableCount;

  const mark = async (host, availability) => {
    if (!onMarkAvailability) return;
    setSavingId(host.id);
    try {
      await onMarkAvailability(host, availability);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Total hosts" value={hosts.length} />
        <KpiTile label="Available" value={availableCount} tone="emerald" />
        <KpiTile label="Not available" value={unavailableCount} tone="rose" />
      </div>

      {departments.length > 0 ? (
        <section className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
          <div className="mb-3 border-b border-navy-100 pb-3">
            <h3 className="text-sm font-semibold text-navy-900">Department</h3>
            <p className="mt-0.5 text-xs text-navy-500">Filter hosts by department</p>
          </div>
          <FilterPills options={deptOptions} value={departmentId} onChange={onDepartmentChange} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
        <div className="mb-4 border-b border-navy-100 pb-3">
          <h3 className="text-sm font-semibold text-navy-900">Hosts</h3>
          <p className="mt-0.5 text-xs text-navy-500">
            Mark each host Available or Not available — updates Host Queue immediately
          </p>
        </div>

        {hosts.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy-500">No hosts found for this site.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <div className="min-w-[720px]">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,12rem)_8.5rem_minmax(0,12rem)_auto] gap-3 border-b border-navy-100 bg-navy-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-navy-500 sm:grid">
                <span>Host</span>
                <span>Department / office</span>
                <span>Status</span>
                <span>Details</span>
                <span className="text-right">Mark</span>
              </div>
              <ul className="divide-y divide-navy-100">
                {hosts.map((host) => {
                  const available = isAvailable(host.availability);
                  const busy = savingId === host.id;
                  return (
                    <li
                      key={host.id}
                      className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_8.5rem_minmax(0,12rem)_auto] sm:items-center sm:gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            available
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {hostInitials(host.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-navy-900">{host.name}</p>
                          {host.email ? (
                            <p className="truncate text-xs text-navy-500">{host.email}</p>
                          ) : null}
                          <div className="mt-2 sm:hidden">
                            <AvailabilityIndicator available={available} />
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <span className="text-xs font-semibold uppercase tracking-wide text-navy-400 sm:hidden">
                          Department / office
                        </span>
                        <p className="truncate text-sm text-navy-700">
                          {[host.department_name, host.office_name].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>

                      <div className="hidden sm:block">
                        <AvailabilityIndicator available={available} />
                      </div>

                      <div className="min-w-0">
                        {available ? (
                          <div className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                            <User size={14} aria-hidden="true" />
                            Ready to receive visitors
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
                              <UserCheck size={14} aria-hidden="true" />
                              Not available
                            </div>
                            {host.current_visitor_name ? (
                              <p className="mt-0.5 truncate text-sm font-medium text-navy-900">
                                {host.current_visitor_name}
                              </p>
                            ) : null}
                            {host.occupied_since ? (
                              <p className="mt-0.5 text-xs text-navy-500">
                                Since {formatDateTime(host.occupied_since)}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <LoadingButton
                          size="sm"
                          variant={available ? 'primary' : 'secondary'}
                          loading={busy && available}
                          disabled={busy || available}
                          onClick={() => void mark(host, 'available')}
                          className={available ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-600' : ''}
                        >
                          Available
                        </LoadingButton>
                        <LoadingButton
                          size="sm"
                          variant={!available ? 'primary' : 'secondary'}
                          loading={busy && !available}
                          disabled={busy || !available}
                          onClick={() => void mark(host, 'unavailable')}
                          className={!available ? 'bg-rose-600 hover:bg-rose-500 border-rose-600' : ''}
                        >
                          Not available
                        </LoadingButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
