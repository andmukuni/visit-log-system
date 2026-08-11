import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  Download,
  Eye,
  Filter,
  MapPin,
  Network,
  Plus,
  Search,
  Users,
  Edit3,
  Globe2,
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
import { visitorApi } from '../../utils/visitorApi';

const TABS = [
  { id: 'all', label: 'All Organisations' },
  { id: 'active', label: 'Active', badgeKey: 'active' },
  { id: 'inactive', label: 'Inactive', badgeKey: 'inactive' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const KPI_ITEMS = [
  {
    key: 'total',
    primaryLabel: 'Total',
    secondaryLabel: 'Organisations',
    icon: Building2,
    iconWrap: 'bg-sky-50 text-sky-500',
  },
  {
    key: 'active',
    primaryLabel: 'Active',
    secondaryLabel: 'Companies',
    icon: Globe2,
    iconWrap: 'bg-emerald-50 text-emerald-500',
  },
  {
    key: 'inactive',
    primaryLabel: 'Inactive',
    secondaryLabel: 'Companies',
    icon: Network,
    iconWrap: 'bg-orange-50 text-orange-500',
  },
  {
    key: 'sites',
    primaryLabel: 'Sites',
    secondaryLabel: 'Across orgs',
    icon: MapPin,
    iconWrap: 'bg-violet-50 text-violet-500',
  },
  {
    key: 'employees',
    primaryLabel: 'Employees',
    secondaryLabel: 'Assigned',
    icon: Users,
    iconWrap: 'bg-sky-50 text-sky-500',
  },
];

const emptyForm = () => ({
  name: '',
  slug: '',
  timezone: 'Africa/Lusaka',
  status: 'active',
});

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

function OrganisationsKpiRow({ kpis = {} }) {
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

function exportOrganisationsCsv(rows) {
  const headers = ['Name', 'Slug', 'Timezone', 'Status', 'Sites', 'Buildings', 'Offices', 'Departments', 'Employees', 'Users'];
  const lines = rows.map((row) => [
    row.name || '',
    row.slug || '',
    row.timezone || '',
    row.status || '',
    row.site_count ?? 0,
    row.building_count ?? 0,
    row.office_count ?? 0,
    row.department_count ?? 0,
    row.employee_count ?? 0,
    row.user_count ?? 0,
  ]);

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'organisations.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminOrganisationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || 'all';
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
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
      const rows = await visitorApi.getOrganisations();
      setAllRows(Array.isArray(rows) ? rows : []);
      setKpis(rows?.stats || {
        total: rows?.length || 0,
        active: (rows || []).filter((r) => r.status === 'active').length,
        inactive: (rows || []).filter((r) => r.status !== 'active').length,
        sites: (rows || []).reduce((sum, r) => sum + Number(r.site_count || 0), 0),
        employees: (rows || []).reduce((sum, r) => sum + Number(r.employee_count || 0), 0),
      });
    } catch (err) {
      setAllRows([]);
      setKpis({});
      toast.error(err?.message || 'Unable to load organisations.');
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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (tab === 'active' && row.status !== 'active') return false;
      if (tab === 'inactive' && row.status === 'active') return false;
      if (status && row.status !== status) return false;
      if (!q) return true;
      return [row.name, row.slug, row.timezone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [allRows, tab, status, search]);

  const total = filteredRows.length;
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const tabStats = useMemo(() => ({
    active: allRows.filter((r) => r.status === 'active').length,
    inactive: allRows.filter((r) => r.status !== 'active').length,
  }), [allRows]);

  const openShow = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/organisations/${row.id}`);
  }, [navigate]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = useCallback((organisation) => {
    setEditing(organisation);
    setForm({
      name: organisation.name || '',
      slug: organisation.slug || '',
      timezone: organisation.timezone || 'Africa/Lusaka',
      status: organisation.status || 'active',
    });
    setModalOpen(true);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Organisation',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.slug || '—'}</p>
        </div>
      ),
    },
    {
      key: 'site_count',
      label: 'Sites',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'department_count',
      label: 'Departments',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'employee_count',
      label: 'Employees',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'user_count',
      label: 'Users',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Eye}
            label="View organisation"
            iconSize={16}
            onClick={(e) => {
              e.stopPropagation();
              openShow(row);
            }}
          />
          <IconButton
            icon={Edit3}
            label="Edit organisation"
            iconSize={16}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
          />
        </div>
      ),
    },
  ], [openShow, openEdit]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Organisation name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await visitorApi.updateOrganisation(editing.id, form);
        toast.success('Organisation updated.');
      } else {
        const created = await visitorApi.createOrganisation(form);
        toast.success('Organisation created.');
        setModalOpen(false);
        setEditing(null);
        if (created?.id) {
          navigate(`/admin/organisations/${created.id}`);
          return;
        }
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save organisation.');
    } finally {
      setSaving(false);
    }
  };

  const pageActions = (
    <button
      type="button"
      onClick={openCreate}
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 sm:px-3"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="hidden sm:inline">New Organisation</span>
      <span className="sm:hidden">New</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Organisations"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Organisations' }]}
        actions={pageActions}
      />

      <OrganisationsKpiRow kpis={kpis} />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
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
                placeholder="Search by organisation name or slug..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
              />
            </label>

            <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0">
              <FilterDropdown
                label="Status"
                icon={Filter}
                value={status}
                onChange={(value) => updateParams({ status: value, page: 1 })}
                options={STATUS_OPTIONS}
              />
            </div>

            <button
              type="button"
              onClick={() => exportOrganisationsCsv(filteredRows)}
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
          emptyTitle="No organisations match your filters."
          emptyDescription="Try adjusting your search or filters."
          onRowClick={openShow}
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

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Organisation' : 'New Organisation'}
        subtitle="Create the company first — all structure beneath it depends on this organisation."
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
              {editing ? 'Save changes' : 'Create organisation'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Organisation name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Wonderful Group"
          />
          <FormField
            label="Slug"
            name="slug"
            value={form.slug}
            onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
            placeholder="wonderful-group"
            helpText="URL-safe identifier. Leave blank to generate from the name."
          />
          <FormField
            label="Timezone"
            name="timezone"
            value={form.timezone}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
            placeholder="Africa/Lusaka"
          />
          <FormField
            label="Status"
            name="status"
            type="select"
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
