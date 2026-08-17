import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, Crown, Eye, Search, Trash2, Users } from 'lucide-react';
import {
  PageHeader,
  DataTable,
  IconButton,
  ConfirmDialog,
  VisitorTypeBadge,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';
import { formatDateTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';

const TABS = [
  { id: 'all', label: 'All', badgeKey: 'total' },
  { id: 'vip', label: 'VIP', badgeKey: 'vip' },
  { id: 'vvip', label: 'VVIP', badgeKey: 'vvip' },
  { id: 'standard', label: 'General', badgeKey: 'standard' },
];

function classificationOf(row) {
  return String(row?.classification || 'standard').toLowerCase();
}

export default function AdminVisitorsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { queryParams, organisationId } = useAdminOrganisation();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const tab = String(searchParams.get('tab') || 'all').toLowerCase();
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const updateParams = useCallback((updates) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === '' || value == null) next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visitorApi.getOrgVisitors({ ...queryParams, limit: 200 });
      setAllRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load visitors.');
    } finally {
      setLoading(false);
    }
  }, [queryParams, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  const showOrganisation = !organisationId && allRows.some((row) => row.organisation_name);

  const kpis = useMemo(() => {
    const vip = allRows.filter((r) => classificationOf(r) === 'vip').length;
    const vvip = allRows.filter((r) => classificationOf(r) === 'vvip').length;
    const standard = allRows.filter((r) => !['vip', 'vvip'].includes(classificationOf(r))).length;
    const withVisits = allRows.filter((r) => Number(r.visit_count || 0) > 0).length;
    return {
      total: allRows.length,
      vip,
      vvip,
      standard,
      withVisits,
    };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      const cls = classificationOf(row);
      if (tab === 'vip' && cls !== 'vip') return false;
      if (tab === 'vvip' && cls !== 'vvip') return false;
      if (tab === 'standard' && (cls === 'vip' || cls === 'vvip')) return false;

      if (!q) return true;
      return [
        row.full_name,
        row.phone,
        row.email,
        row.company,
        row.organisation_name,
        cls,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [allRows, search, tab]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const openShow = useCallback((row) => {
    if (!row?.last_visit_id) {
      toast.info('No visit history for this visitor yet.');
      return;
    }
    navigate(`/admin/log-book/${row.last_visit_id}`);
  }, [navigate, toast]);

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await visitorApi.deleteVisitor(deleteTarget.id);
      toast.success('Visitor deleted.');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete visitor.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'full_name',
      label: 'Visitor',
      render: (_, row) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-900">{row.full_name || '—'}</p>
            <VisitorTypeBadge classification={row.classification} size="xs" />
          </div>
          <p className="truncate text-xs text-gray-500">
            {[row.company, showOrganisation ? row.organisation_name : null]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Contact',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="text-sm text-gray-800">{row.phone || '—'}</p>
          <p className="truncate text-xs text-gray-500">{row.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'visit_count',
      label: 'Visits',
      render: (value) => (
        <span className="tabular-nums text-sm text-gray-800">{Number(value || 0)}</span>
      ),
    },
    {
      key: 'last_visit_at',
      label: 'Last visit',
      render: (_, row) => (
        <span className="text-sm text-gray-700">
          {row.last_visit_at ? formatDateTime(row.last_visit_at) : '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => (
        <span className="text-sm text-gray-700">
          {row.created_at ? formatDateTime(row.created_at) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Eye}
            label="View last visit"
            iconSize={16}
            disabled={!row.last_visit_id}
            onClick={(e) => {
              e.stopPropagation();
              openShow(row);
            }}
          />
          {isAdmin && (
            <IconButton
              icon={Trash2}
              label="Delete visitor"
              iconSize={16}
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50"
              disabled={Number(row.visit_count || 0) > 0}
              title={
                Number(row.visit_count || 0) > 0
                  ? 'Visitors with visit history cannot be deleted.'
                  : 'Delete visitor'
              }
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(row);
              }}
            />
          )}
        </div>
      ),
    },
  ], [isAdmin, openShow, showOrganisation]);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Visitors"
        subtitle={
          showOrganisation
            ? 'Visitor directory across organisations.'
            : 'Registered visitor profiles for your organisation.'
        }
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Visitors' }]}
      />

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { key: 'total', label: 'Visitors', icon: Users },
          { key: 'vip', label: 'VIP', icon: Users },
          { key: 'vvip', label: 'VVIP', icon: Crown },
          { key: 'withVisits', label: 'With visits', icon: CalendarClock },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500">
              <Icon size={16} />
            </span>
            <div>
              <p className="text-lg font-bold tabular-nums text-slate-900">{Number(kpis[key] ?? 0)}</p>
              <p className="text-xs font-semibold text-gray-600">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="border-b border-gray-200">
              <div className="flex gap-0 overflow-x-auto px-4 pt-0.5 sm:px-5">
                {TABS.map(({ id, label, badgeKey }) => {
                  const active = tab === id;
                  const badge = kpis[badgeKey];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateParams({ tab: id === 'all' ? '' : id, page: 1 })}
                      className={`relative shrink-0 whitespace-nowrap px-3 pb-2 pt-2 text-xs font-semibold transition-colors sm:px-4 sm:pb-2.5 sm:pt-2.5 sm:text-sm ${
                        active
                          ? 'text-navy-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#1a73e8]'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {label}
                      {badge != null ? (
                        <span className={`ml-1.5 tabular-nums ${active ? 'text-[#1a73e8]' : 'text-gray-400'}`}>
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-b border-gray-200 px-4 py-2 sm:px-5">
              <label className="relative block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, phone, email, company…"
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                />
              </label>
            </div>

            <DataTable
              embedded
              columns={columns}
              data={pageRows}
              loading={loading}
              emptyTitle="No visitors found"
              emptyDescription={
                search || tab !== 'all'
                  ? 'Try a different search or classification tab.'
                  : 'Registered visitor profiles will appear here after check-in.'
              }
              onRowClick={openShow}
              serverPagination
              page={page}
              pageSize={pageSize}
              totalItems={filteredRows.length}
              onPageChange={(value) => updateParams({ page: value })}
              onPageSizeChange={(value) => updateParams({ pageSize: value, page: 1 })}
              pageSizeOptions={[7, 10, 25, 50]}
              pagination
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete visitor?"
        message={
          deleteTarget
            ? `Permanently remove ${deleteTarget.full_name || 'this visitor'}'s profile. This can't be undone.`
            : 'Are you sure you want to proceed?'
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
