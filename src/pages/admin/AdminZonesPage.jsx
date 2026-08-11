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
  Shield,
  Layers3,
  X,
  Edit3,
  Lock,
} from 'lucide-react';
import {
  PageHeader,
  DataTable,
  IconButton,
  Modal,
  FormField,
  LoadingButton,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';
import { useOrganisationPrerequisite } from '../../hooks/useOrganisationPrerequisite';
import OrganisationRequiredBanner from '../../components/admin/OrganisationRequiredBanner';
import StructureRelationHint from '../../components/admin/StructureRelationHint';

const ACCESS_LEVELS = [
  { value: 'public', label: 'Public' },
  { value: 'staff', label: 'Staff only' },
  { value: 'restricted', label: 'Restricted' },
  { value: 'high-security', label: 'High security' },
];

const TABS = [
  { id: 'all', label: 'All Zones' },
  { id: 'public', label: 'Public', badgeKey: 'public' },
  { id: 'staff', label: 'Staff', badgeKey: 'staff' },
  { id: 'restricted', label: 'Restricted', badgeKey: 'restricted' },
];

const KPI_ITEMS = [
  {
    key: 'total',
    primaryLabel: 'Total',
    secondaryLabel: 'Zones',
    icon: Layers3,
    iconWrap: 'bg-sky-50 text-sky-500',
  },
  {
    key: 'buildings',
    primaryLabel: 'Buildings',
    secondaryLabel: 'Configured',
    icon: Building2,
    iconWrap: 'bg-violet-50 text-violet-500',
  },
  {
    key: 'public',
    primaryLabel: 'Public',
    secondaryLabel: 'Zones',
    icon: MapPin,
    iconWrap: 'bg-emerald-50 text-emerald-500',
  },
  {
    key: 'staff',
    primaryLabel: 'Staff',
    secondaryLabel: 'Only Zones',
    icon: Shield,
    iconWrap: 'bg-orange-50 text-orange-500',
  },
  {
    key: 'restricted',
    primaryLabel: 'Restricted',
    secondaryLabel: 'High Security',
    icon: Lock,
    iconWrap: 'bg-rose-50 text-rose-500',
  },
];

const emptyForm = () => ({
  name: '',
  buildingId: '',
  accessLevel: 'public',
});

function normalizeAccess(level = '') {
  const value = String(level || '').toLowerCase();
  if (value === 'staff-only' || value === 'staff_only') return 'staff';
  if (value === 'high_security') return 'high-security';
  return value || 'public';
}

function accessLabel(level) {
  const normalized = normalizeAccess(level);
  return ACCESS_LEVELS.find((item) => item.value === normalized)?.label || level || 'Public';
}

function AccessBadge({ level }) {
  const normalized = normalizeAccess(level);
  const tones = {
    public: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    staff: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    restricted: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    'high-security': 'bg-rose-50 text-rose-700 ring-rose-600/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[normalized] || tones.public}`}>
      {accessLabel(normalized)}
    </span>
  );
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

function ZonesKpiRow({ kpis = {} }) {
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

function ZoneDetailSidebar({ zone, onClose, onEdit }) {
  if (!zone) return null;

  return (
    <aside className="hidden w-full shrink-0 flex-col border-t border-gray-200 bg-white lg:flex lg:w-[320px] lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy-900">{zone.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{zone.building_name || 'Building'}</p>
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
        <AccessBadge level={zone.access_level} />

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Location
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={Building2} label="Building" value={zone.building_name} />
            <DetailRow icon={MapPin} label="Site / Branch" value={zone.site_name} />
            <DetailRow icon={Shield} label="Access level" value={accessLabel(zone.access_level)} />
          </div>
        </section>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-gray-200 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => onEdit?.(zone)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] bg-white px-2.5 py-2 text-xs font-semibold text-[#1a73e8] transition-colors hover:bg-sky-50 sm:text-sm"
        >
          <Edit3 size={16} aria-hidden="true" />
          Edit Zone
        </button>
        <Link
          to="/admin/sites"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800 sm:text-sm"
        >
          View Sites
        </Link>
      </div>
    </aside>
  );
}

function exportZonesCsv(rows) {
  const headers = ['Zone', 'Building', 'Site', 'Access level'];
  const lines = rows.map((row) => [
    row.name || '',
    row.building_name || '',
    row.site_name || '',
    accessLabel(row.access_level),
  ]);

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zones.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminZonesPage() {
  const toast = useToast();
  const { hasOrganisation, hasActiveOrganisation, loading: orgLoading } = useOrganisationPrerequisite();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') || 'all';
  const search = searchParams.get('search') || '';
  const access = searchParams.get('access') || '';
  const siteId = searchParams.get('site') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [sites, setSites] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [buildingModalOpen, setBuildingModalOpen] = useState(false);
  const [buildingForm, setBuildingForm] = useState({ name: '', siteId: '' });
  const [savingBuilding, setSavingBuilding] = useState(false);

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
      const [zones, buildingRows, siteRows] = await Promise.all([
        visitorApi.getZones(),
        visitorApi.getBuildings(),
        visitorApi.getSites(),
      ]);
      setAllRows(Array.isArray(zones) ? zones : []);
      setBuildings(Array.isArray(buildingRows) ? buildingRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setKpis(zones?.stats || {
        total: zones?.length || 0,
        buildings: new Set((zones || []).map((z) => z.building_id)).size,
        public: (zones || []).filter((z) => normalizeAccess(z.access_level) === 'public').length,
        staff: (zones || []).filter((z) => normalizeAccess(z.access_level) === 'staff').length,
        restricted: (zones || []).filter((z) => ['restricted', 'high-security'].includes(normalizeAccess(z.access_level))).length,
      });
    } catch (err) {
      setAllRows([]);
      setBuildings([]);
      setSites([]);
      setKpis({});
      toast.error(err?.message || 'Unable to load zones.');
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

  const siteOptions = useMemo(() => [
    { value: '', label: 'Site / Branch' },
    ...sites.map((site) => ({ value: site.id, label: site.name })),
  ], [sites]);

  const accessOptions = useMemo(() => [
    { value: '', label: 'Access level' },
    ...ACCESS_LEVELS,
  ], []);

  const buildingOptions = useMemo(() => (
    buildings.map((building) => ({
      value: building.id,
      label: `${building.name}${building.site_name ? ` · ${building.site_name}` : ''}`,
    }))
  ), [buildings]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      const level = normalizeAccess(row.access_level);
      if (tab === 'public' && level !== 'public') return false;
      if (tab === 'staff' && level !== 'staff') return false;
      if (tab === 'restricted' && !['restricted', 'high-security'].includes(level)) return false;
      if (access && level !== normalizeAccess(access)) return false;
      if (siteId && row.site_id !== siteId) return false;
      if (!q) return true;
      return [row.name, row.building_name, row.site_name, accessLabel(row.access_level)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [allRows, tab, access, siteId, search]);

  const total = filteredRows.length;
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const tabStats = useMemo(() => ({
    public: allRows.filter((r) => normalizeAccess(r.access_level) === 'public').length,
    staff: allRows.filter((r) => normalizeAccess(r.access_level) === 'staff').length,
    restricted: allRows.filter((r) => ['restricted', 'high-security'].includes(normalizeAccess(r.access_level))).length,
  }), [allRows]);

  useEffect(() => {
    if (!selected) return;
    const fresh = allRows.find((row) => row.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [allRows, selected]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Zone',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.building_name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'site_name',
      label: 'Site / Branch',
      render: (value) => <span className="text-sm text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'access_level',
      label: 'Access',
      render: (value) => <AccessBadge level={value} />,
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <IconButton
          icon={Eye}
          label="View zone"
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
      toast.error('Create an organisation first. Buildings & zones cannot exist without an organisation.');
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm(),
      buildingId: buildings[0]?.id || '',
    });
    setModalOpen(true);
  };

  const openCreateBuilding = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first. Buildings cannot exist without an organisation.');
      return;
    }
    setBuildingForm({ name: '', siteId: sites[0]?.id || '' });
    setBuildingModalOpen(true);
  };

  const openEdit = (zone) => {
    setEditing(zone);
    setForm({
      name: zone.name || '',
      buildingId: zone.building_id || '',
      accessLevel: normalizeAccess(zone.access_level),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Zone name is required.');
      return;
    }
    if (!form.buildingId) {
      toast.error('Select a building.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await visitorApi.updateZone(editing.id, form);
        toast.success('Zone updated.');
      } else {
        await visitorApi.createZone(form);
        toast.success('Zone created.');
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save zone.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBuilding = async () => {
    if (!buildingForm.name.trim()) {
      toast.error('Building name is required.');
      return;
    }
    if (!buildingForm.siteId) {
      toast.error('Select a site.');
      return;
    }
    setSavingBuilding(true);
    try {
      const created = await visitorApi.createBuilding(buildingForm);
      toast.success('Building created.');
      setBuildingModalOpen(false);
      setBuildingForm({ name: '', siteId: '' });
      await load();
      if (created?.id) {
        setForm((prev) => ({ ...prev, buildingId: created.id }));
      }
    } catch (err) {
      toast.error(err?.message || 'Could not save building.');
    } finally {
      setSavingBuilding(false);
    }
  };

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (window.innerWidth < 1024) setMobileDetailOpen(true);
  }, []);

  const pageActions = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={openCreateBuilding}
        disabled={!canManageStructure || orgLoading}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
      >
        <Building2 size={14} strokeWidth={2.5} aria-hidden="true" />
        <span className="hidden sm:inline">New Building</span>
        <span className="sm:hidden">Building</span>
      </button>
      <button
        type="button"
        onClick={openCreate}
        disabled={!canManageStructure || orgLoading}
        className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
      >
        <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
        <span className="hidden sm:inline">New Zone</span>
        <span className="sm:hidden">New</span>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Buildings & Zones"
        subtitle="Site → Building → Zone. Offices also sit in a building."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Zones' }]}
        actions={pageActions}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Buildings & Zones" />
      )}
      <StructureRelationHint highlight="Building" />

      <ZonesKpiRow kpis={kpis} />

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
                    placeholder="Search by zone, building or site..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0">
                  <FilterDropdown
                    label="Site"
                    icon={MapPin}
                    value={siteId}
                    onChange={(value) => updateParams({ site: value, page: 1 })}
                    options={siteOptions}
                  />
                  <FilterDropdown
                    label="Access"
                    icon={Filter}
                    value={access}
                    onChange={(value) => updateParams({ access: value, page: 1 })}
                    options={accessOptions}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => exportZonesCsv(filteredRows)}
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
              emptyTitle={!canManageStructure ? 'No organisation yet' : 'No zones match your filters.'}
              emptyDescription={
                !canManageStructure
                  ? 'Create an organisation first. Buildings & zones cannot exist without an organisation.'
                  : 'Try adjusting your search or create a new zone.'
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
            <ZoneDetailSidebar
              zone={selected}
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
              <p className="text-xs text-gray-500">{selected.building_name || 'Zone details'}</p>
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
            <AccessBadge level={selected.access_level} />
            <div className="mt-4 grid grid-cols-[16px_1fr] gap-x-3">
              <DetailRow icon={Building2} label="Building" value={selected.building_name} />
              <DetailRow icon={MapPin} label="Site / Branch" value={selected.site_name} />
              <DetailRow icon={Shield} label="Access level" value={accessLabel(selected.access_level)} />
            </div>
          </div>
          <div className="flex gap-2 border-t border-gray-200 p-4">
            <button
              type="button"
              onClick={() => openEdit(selected)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] px-3 py-2.5 text-sm font-semibold text-[#1a73e8]"
            >
              Edit Zone
            </button>
            <Link
              to="/admin/sites"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2.5 text-sm font-semibold text-white"
            >
              View Sites
            </Link>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Zone' : 'New Zone'}
        subtitle="Assign a zone to a building and set its access level."
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
              {editing ? 'Save changes' : 'Create zone'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Zone name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Reception Area"
          />
          <FormField
            label="Building"
            name="buildingId"
            type="select"
            required
            value={form.buildingId}
            onChange={(e) => setForm((prev) => ({ ...prev, buildingId: e.target.value }))}
            options={[
              { value: '', label: 'Select building' },
              ...buildingOptions,
            ]}
          />
          <FormField
            label="Access level"
            name="accessLevel"
            type="select"
            value={form.accessLevel}
            onChange={(e) => setForm((prev) => ({ ...prev, accessLevel: e.target.value }))}
            options={ACCESS_LEVELS}
          />
        </div>
      </Modal>

      <Modal
        isOpen={buildingModalOpen}
        onClose={() => !savingBuilding && setBuildingModalOpen(false)}
        title="New Building"
        subtitle="Create a building under a site / branch."
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={savingBuilding}
              onClick={() => setBuildingModalOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <LoadingButton loading={savingBuilding} onClick={handleSaveBuilding}>
              Create building
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Building name"
            name="buildingName"
            required
            value={buildingForm.name}
            onChange={(e) => setBuildingForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Main Building"
          />
          <FormField
            label="Site / Branch"
            name="siteId"
            type="select"
            required
            value={buildingForm.siteId}
            onChange={(e) => setBuildingForm((prev) => ({ ...prev, siteId: e.target.value }))}
            options={[
              { value: '', label: 'Select site' },
              ...sites.map((site) => ({ value: site.id, label: site.name })),
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
