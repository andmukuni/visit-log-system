import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  Download,
  Eye,
  Filter,
  MapPin,
  Plus,
  Search,
  Users,
  DoorOpen,
  Layers3,
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
import { visitorApi } from '../../utils/visitorApi';
import { useOrganisationPrerequisite } from '../../hooks/useOrganisationPrerequisite';
import OrganisationRequiredBanner from '../../components/admin/OrganisationRequiredBanner';

const TABS = [
  { id: 'all', label: 'All Sites' },
  { id: 'active', label: 'Active', badgeKey: 'active' },
  { id: 'inactive', label: 'Inactive', badgeKey: 'inactive' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const emptyForm = () => ({
  name: '',
  code: '',
  address: '',
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

function exportSitesCsv(rows) {
  const headers = ['Name', 'Code', 'Address', 'Status', 'Stations', 'Buildings', 'Offices', 'Employees'];
  const lines = rows.map((row) => [
    row.name || '',
    row.code || '',
    row.address || '',
    row.status || '',
    row.station_count ?? 0,
    row.building_count ?? 0,
    row.office_count ?? 0,
    row.employee_count ?? 0,
  ]);

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sites.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminSitesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { hasOrganisation, hasActiveOrganisation, loading: orgLoading } = useOrganisationPrerequisite();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || 'all';
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
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
      const rows = await visitorApi.getSites();
      setAllRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load sites.');
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
      return [row.name, row.code, row.address, row.organisation_name]
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
    navigate(`/admin/sites/${row.id}`);
  }, [navigate]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Site',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.code || '—'}</p>
        </div>
      ),
    },
    {
      key: 'address',
      label: 'Address',
      render: (value) => <span className="text-sm text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'station_count',
      label: 'Stations',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'employee_count',
      label: 'Employees',
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
        <IconButton
          icon={Eye}
          label="View site"
          iconSize={16}
          onClick={(e) => {
            e.stopPropagation();
            openShow(row);
          }}
        />
      ),
    },
  ], []);

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first. Sites cannot exist without an organisation.');
      return;
    }
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (site) => {
    setEditing(site);
    setForm({
      name: site.name || '',
      code: site.code || '',
      address: site.address || '',
      status: site.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Site name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await visitorApi.updateSite(editing.id, form);
        toast.success('Site updated.');
      } else {
        await visitorApi.createSite(form);
        toast.success('Site created.');
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save site.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = openShow;

  const pageActions = (
    <button
      type="button"
      onClick={openCreate}
      disabled={!canManageStructure || orgLoading}
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="hidden sm:inline">New Site</span>
      <span className="sm:hidden">New</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Sites & Branches"
        subtitle="Organisation → Site. Buildings, zones and stations hang off the site."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Sites' }]}
        actions={pageActions}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Sites & Branches" />
      )}

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
                    placeholder="Search by site name, code or address..."
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
                  onClick={() => exportSitesCsv(filteredRows)}
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
              emptyTitle={!canManageStructure ? 'No organisation yet' : 'No sites match your filters.'}
              emptyDescription={
                !canManageStructure
                  ? 'Create an organisation first. Sites cannot exist without an organisation.'
                  : 'Try adjusting your search or filters.'
              }
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
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Site' : 'New Site'}
        subtitle="Create or update a site / branch for this organisation."
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
              {editing ? 'Save changes' : 'Create site'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Site name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Head Office"
          />
          <FormField
            label="Code"
            name="code"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            placeholder="HQ"
          />
          <FormField
            label="Address"
            name="address"
            textarea
            rows={3}
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            placeholder="Lusaka, Zambia"
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
