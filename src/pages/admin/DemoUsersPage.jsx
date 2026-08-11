import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  Download,
  Eye,
  Filter,
  KeyRound,
  Mail,
  Search,
  Shield,
  UserCheck,
  Users,
  X,
  Edit3,
} from 'lucide-react';
import {
  PageHeader,
  DataTable,
  StatusBadge,
  IconButton,
  Modal,
  FormField,
  LoadingButton,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';

const API_BASE = getApiBase();

const TABS = [
  { id: 'all', label: 'All Users' },
  { id: 'with_role', label: 'With role', badgeKey: 'withRole' },
  { id: 'no_role', label: 'No role', badgeKey: 'noRole' },
];

const KPI_ITEMS = [
  {
    key: 'total',
    primaryLabel: 'Total',
    secondaryLabel: 'Users',
    icon: Users,
    iconWrap: 'bg-sky-50 text-sky-500',
  },
  {
    key: 'verified',
    primaryLabel: 'Verified',
    secondaryLabel: 'Emails',
    icon: UserCheck,
    iconWrap: 'bg-emerald-50 text-emerald-500',
  },
  {
    key: 'withRole',
    primaryLabel: 'With role',
    secondaryLabel: 'Assigned',
    icon: Shield,
    iconWrap: 'bg-violet-50 text-violet-500',
  },
  {
    key: 'admins',
    primaryLabel: 'Admins',
    secondaryLabel: 'Elevated',
    icon: KeyRound,
    iconWrap: 'bg-orange-50 text-orange-500',
  },
  {
    key: 'noRole',
    primaryLabel: 'No role',
    secondaryLabel: 'Unassigned',
    icon: Mail,
    iconWrap: 'bg-slate-50 text-slate-500',
  },
];

const ADMIN_ROLE_SLUGS = new Set(['super_admin', 'org_admin', 'platform_admin']);

async function adminFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAdminAuthHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json;
}

function FilterDropdown({ label, icon: Icon, value, onChange, options }) {
  const activeLabel = options.find((option) => option.value === value)?.label || label;
  const isActive = Boolean(value);

  return (
    <label className="relative inline-flex shrink-0">
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
          isActive
            ? 'border-[#1a73e8]/30 bg-sky-50 text-[#1a73e8]'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" />}
        <span>{activeLabel}</span>
        <ChevronDown size={14} className="text-gray-400" aria-hidden="true" />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value || 'all'} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function UsersKpiRow({ kpis = {} }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
      {KPI_ITEMS.map(({ key, primaryLabel, secondaryLabel, icon: Icon, iconWrap }) => (
        <div
          key={key}
          className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm"
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none tabular-nums text-slate-900 sm:text-xl">
              {Number(kpis[key] ?? 0)}
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-tight text-gray-600 sm:text-xs">{primaryLabel}</p>
            <p className="mt-0.5 hidden text-xs leading-tight text-gray-400 sm:block">{secondaryLabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

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

function UserDetailSidebar({ user, onClose, onEdit }) {
  if (!user) return null;

  return (
    <aside className="hidden w-full shrink-0 flex-col border-t border-gray-200 bg-white lg:flex lg:w-[320px] lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy-900">{user.name || 'Unnamed user'}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{user.email || 'No email'}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close details"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <StatusBadge status={user.email_verified ? 'confirmed' : 'pending'} />
        </div>

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Account
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={Mail} label="Email" value={user.email} />
            <DetailRow icon={Users} label="Joined" value={formatDate(user.created_at)} />
          </div>
        </section>

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Access
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={Shield} label="Portal role" value={user.role_name || 'No portal role'} />
            <DetailRow icon={KeyRound} label="Legacy role" value={user.role || 'user'} />
          </div>
        </section>
      </div>

      <div className="mt-auto flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => onEdit?.(user)}
          title="Edit role"
          aria-label="Edit role"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#1a73e8] bg-white text-[#1a73e8] transition-colors hover:bg-sky-50"
        >
          <Edit3 size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function exportUsersCsv(rows) {
  const headers = ['Name', 'Email', 'Portal role', 'Legacy role', 'Verified', 'Joined'];
  const lines = rows.map((row) => [
    row.name || '',
    row.email || '',
    row.role_name || '',
    row.role || '',
    row.email_verified ? 'Yes' : 'No',
    formatDate(row.created_at),
  ]);

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'users.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function DemoUsersPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || 'all';
  const search = searchParams.get('search') || '';
  const roleFilter = searchParams.get('role') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [roleId, setRoleId] = useState('');
  const [saving, setSaving] = useState(false);

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
      const [usersJson, rolesJson] = await Promise.all([
        adminFetch('/admin/users'),
        adminFetch('/admin/roles'),
      ]);
      setAllRows(Array.isArray(usersJson.data) ? usersJson.data : []);
      setRoles(Array.isArray(rolesJson.data) ? rolesJson.data : []);
    } catch (err) {
      setAllRows([]);
      setRoles([]);
      toast.error(err?.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        updateParams({ search: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  const kpis = useMemo(() => {
    const withRole = allRows.filter((row) => row.role_id || row.role_slug).length;
    return {
      total: allRows.length,
      verified: allRows.filter((row) => row.email_verified).length,
      withRole,
      noRole: allRows.length - withRole,
      admins: allRows.filter((row) => (
        String(row.role || '').toLowerCase() === 'admin'
        || ADMIN_ROLE_SLUGS.has(row.role_slug)
      )).length,
    };
  }, [allRows]);

  const roleOptions = useMemo(() => ([
    { value: '', label: 'Role' },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ]), [roles]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      const hasRole = Boolean(row.role_id || row.role_slug);
      if (tab === 'with_role' && !hasRole) return false;
      if (tab === 'no_role' && hasRole) return false;
      if (roleFilter && row.role_id !== roleFilter) return false;
      if (!q) return true;
      return [row.name, row.email, row.role_name, row.role_slug]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [allRows, tab, roleFilter, search]);

  const total = filteredRows.length;
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const tabStats = useMemo(() => ({
    withRole: kpis.withRole,
    noRole: kpis.noRole,
  }), [kpis]);

  useEffect(() => {
    if (!selected) return;
    const fresh = allRows.find((row) => row.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [allRows, selected]);

  const openEdit = (user) => {
    setEditing(user);
    setRoleId(user.role_id || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editing?.id) return;
    setSaving(true);
    try {
      const json = await adminFetch(`/admin/users/${encodeURIComponent(editing.id)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ roleId: roleId || null }),
      });
      setAllRows((prev) => prev.map((row) => (row.id === editing.id ? json.data : row)));
      setSelected(json.data);
      toast.success(`Role updated for ${editing.name || editing.email}.`);
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err?.message || 'Could not update role.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (window.innerWidth < 1024) setMobileDetailOpen(true);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'User',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name || '—'}</p>
          <p className="text-xs text-gray-500">{row.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'role_name',
      label: 'Portal role',
      render: (_, row) => (
        <span className="text-gray-800">{row.role_name || 'No portal role'}</span>
      ),
    },
    {
      key: 'email_verified',
      label: 'Verified',
      render: (value) => <StatusBadge status={value ? 'confirmed' : 'pending'} />,
    },
    {
      key: 'created_at',
      label: 'Joined',
      render: (value) => <span className="text-gray-800">{formatDate(value)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <IconButton
          icon={Eye}
          label="View user"
          iconSize={16}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(row);
            if (window.innerWidth < 1024) setMobileDetailOpen(true);
          }}
        />
      ),
    },
  ], []);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Users"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Users' }]}
      />

      <UsersKpiRow kpis={kpis} />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="border-b border-gray-200">
              <div className="flex gap-0 overflow-x-auto px-4 pt-0.5 sm:px-5">
                {TABS.map(({ id, label, badgeKey }) => {
                  const active = tab === id;
                  const badge = badgeKey ? tabStats[badgeKey] : null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateParams({ tab: id, page: 1 })}
                      className={`relative shrink-0 whitespace-nowrap px-3 pb-2 pt-2 text-xs font-semibold transition-colors sm:px-4 sm:pb-2.5 sm:pt-2.5 sm:text-sm ${
                        active
                          ? 'text-navy-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#1a73e8]'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {label}
                        {badge > 0 && (
                          <span className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-b border-gray-200 px-4 py-2 sm:px-5 sm:py-2.5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <label className="relative block min-w-0 flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by name, email, or role..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0">
                  <FilterDropdown
                    label="Role"
                    icon={Filter}
                    value={roleFilter}
                    onChange={(value) => updateParams({ role: value, page: 1 })}
                    options={roleOptions}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => exportUsersCsv(filteredRows)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm lg:self-center"
                >
                  <Download size={14} aria-hidden="true" />
                  Export
                </button>
              </div>
            </div>

            <DataTable
              embedded
              columns={columns}
              data={pageRows}
              loading={loading}
              emptyTitle="No users match your filters."
              emptyDescription="Try adjusting your search or filters."
              onRowClick={handleSelect}
              activeRowId={selected?.id}
              serverPagination
              page={page}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={(value) => updateParams({ page: value })}
              onPageSizeChange={(value) => updateParams({ pageSize: value, page: 1 })}
              pageSizeOptions={[7, 10, 25, 50]}
              pagination
            />
          </div>

          {selected && (
            <UserDetailSidebar
              user={selected}
              onClose={() => setSelected(null)}
              onEdit={openEdit}
            />
          )}
        </div>
      </div>

      {mobileDetailOpen && selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy-900">{selected.name || 'User'}</p>
              <p className="text-xs text-gray-500">{selected.email || 'User details'}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <StatusBadge status={selected.email_verified ? 'confirmed' : 'pending'} />
            <div className="mt-4 grid grid-cols-[16px_1fr] gap-x-3">
              <DetailRow icon={Mail} label="Email" value={selected.email} />
              <DetailRow icon={Shield} label="Portal role" value={selected.role_name || 'No portal role'} />
              <DetailRow icon={KeyRound} label="Legacy role" value={selected.role || 'user'} />
              <DetailRow icon={Users} label="Joined" value={formatDate(selected.created_at)} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4">
            <button
              type="button"
              onClick={() => openEdit(selected)}
              title="Edit role"
              aria-label="Edit role"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#1a73e8] text-[#1a73e8]"
            >
              <Edit3 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit user role"
        subtitle={editing ? `${editing.name || 'User'} · ${editing.email || ''}` : ''}
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              Save changes
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Portal role"
            name="role_id"
            type="select"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            options={[
              { value: '', label: 'No portal role' },
              ...roles.map((role) => ({ value: role.id, label: role.name })),
            ]}
            helpText="Controls which portal pages and actions this user can access."
          />
        </div>
      </Modal>
    </div>
  );
}
