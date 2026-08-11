import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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

function SiteDetailSidebar({ site, onClose, onEdit }) {
  if (!site) return null;

  return (
    <aside className="hidden w-full shrink-0 flex-col border-t border-gray-200 bg-white lg:flex lg:w-[320px] lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy-900">{site.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{site.code || 'No site code'}</p>
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
          <StatusBadge status={site.status || 'active'} />
        </div>

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Location
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={MapPin} label="Address" value={site.address} />
            <DetailRow icon={Building2} label="Organisation" value={site.organisation_name} />
          </div>
        </section>

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Capacity
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={DoorOpen} label="Stations & Gates" value={String(site.station_count ?? 0)} />
            <DetailRow icon={Layers3} label="Buildings" value={String(site.building_count ?? 0)} />
            <DetailRow icon={Building2} label="Offices" value={String(site.office_count ?? 0)} />
            <DetailRow icon={Users} label="Employees" value={String(site.employee_count ?? 0)} />
          </div>
        </section>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-gray-200 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => onEdit?.(site)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] bg-white px-2.5 py-2 text-xs font-semibold text-[#1a73e8] transition-colors hover:bg-sky-50 sm:text-sm"
        >
          <Edit3 size={16} aria-hidden="true" />
          Edit Site
        </button>
        <Link
          to="/admin/stations"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800 sm:text-sm"
        >
          <DoorOpen size={16} aria-hidden="true" />
          View Stations
        </Link>
      </div>
    </aside>
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
  const [selected, setSelected] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

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

  useEffect(() => {
    if (!selected) return;
    const fresh = allRows.find((row) => row.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [allRows, selected]);

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
            setSelected(row);
            if (window.innerWidth < 1024) setMobileDetailOpen(true);
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

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (window.innerWidth < 1024) setMobileDetailOpen(true);
  }, []);

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
            <SiteDetailSidebar
              site={selected}
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
              <p className="truncate font-semibold text-navy-900">{selected.name}</p>
              <p className="text-xs text-gray-500">{selected.code || 'Site details'}</p>
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
            <StatusBadge status={selected.status || 'active'} />
            <div className="mt-4 grid grid-cols-[16px_1fr] gap-x-3">
              <DetailRow icon={MapPin} label="Address" value={selected.address} />
              <DetailRow icon={DoorOpen} label="Stations" value={String(selected.station_count ?? 0)} />
              <DetailRow icon={Users} label="Employees" value={String(selected.employee_count ?? 0)} />
              <DetailRow icon={Building2} label="Offices" value={String(selected.office_count ?? 0)} />
            </div>
          </div>
          <div className="flex gap-2 border-t border-gray-200 p-4">
            <button
              type="button"
              onClick={() => openEdit(selected)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] px-3 py-2.5 text-sm font-semibold text-[#1a73e8]"
            >
              <Edit3 size={16} aria-hidden="true" />
              Edit Site
            </button>
            <Link
              to="/admin/stations"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2.5 text-sm font-semibold text-white"
            >
              <DoorOpen size={16} aria-hidden="true" />
              View Stations
            </Link>
          </div>
        </div>
      )}

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
