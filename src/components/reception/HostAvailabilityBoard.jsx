import { useMemo } from 'react';
import { User, UserCheck } from 'lucide-react';
import { Card, FilterPills, Spinner } from '../ui';
import { formatDateTime } from '../../utils/helpers';

function hostInitials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

export default function HostAvailabilityBoard({
  hosts = [],
  departments = [],
  departmentId = '',
  onDepartmentChange,
  loading = false,
}) {
  const deptOptions = useMemo(() => [
    { value: '', label: 'All departments' },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ], [departments]);

  const occupiedCount = hosts.filter((h) => h.availability === 'occupied').length;
  const availableCount = hosts.length - occupiedCount;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="!p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-navy-500">Total hosts</p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{hosts.length}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Available</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{availableCount}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Occupied</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{occupiedCount}</p>
        </Card>
      </div>

      {departments.length > 0 ? (
        <Card title="Filter">
          <FilterPills options={deptOptions} value={departmentId} onChange={onDepartmentChange} />
        </Card>
      ) : null}

      {hosts.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-navy-500">No hosts found for this site.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {hosts.map((host) => {
            const occupied = host.availability === 'occupied';
            return (
              <Card key={host.id} className="!p-0 overflow-hidden">
                <div className={`h-1 ${occupied ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      occupied ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                    >
                      {hostInitials(host.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-navy-900">{host.name}</p>
                      <p className="truncate text-xs text-navy-500">
                        {[host.department_name, host.office_name].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        occupied ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                      >
                        {occupied ? 'Occupied' : 'Available'}
                      </span>
                    </div>
                  </div>

                  {occupied ? (
                    <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/80 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
                        <UserCheck size={14} />
                        With visitor
                      </div>
                      <p className="mt-1 text-sm font-semibold text-navy-900">
                        {host.current_visitor_name || 'Visitor on-site'}
                      </p>
                      {host.occupied_since ? (
                        <p className="mt-1 text-xs text-navy-500">
                          Since {formatDateTime(host.occupied_since)}
                        </p>
                      ) : null}
                      {host.current_visit_status ? (
                        <p className="mt-1 text-xs capitalize text-navy-600">
                          {String(host.current_visit_status).replace(/_/g, ' ')}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-800">
                      <User size={14} />
                      Ready to receive visitors
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
