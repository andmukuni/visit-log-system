import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, DoorClosed, Eye, Map, Network, Plus, Search, X, Edit3 } from 'lucide-react';
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
import StructureRelationHint from '../../components/admin/StructureRelationHint';

const emptyForm = () => ({
  officeNumber: '',
  name: '',
  departmentId: '',
  siteId: '',
  buildingId: '',
  zoneId: '',
  status: 'active',
});

export default function AdminOfficesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { hasOrganisation, hasActiveOrganisation, loading: orgLoading } = useOrganisationPrerequisite();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [zones, setZones] = useState([]);
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
      const [rows, deptRows, siteRows, buildingRows, zoneRows] = await Promise.all([
        visitorApi.getOffices(),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getBuildings(),
        visitorApi.getZones(),
      ]);
      setAllRows(Array.isArray(rows) ? rows : []);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setBuildings(Array.isArray(buildingRows) ? buildingRows : []);
      setZones(Array.isArray(zoneRows) ? zoneRows : []);
      setKpis(rows?.stats || { total: rows?.length || 0 });
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load offices.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) =>
      [row.office_number, row.name, row.department_name, row.building_name, row.zone_name, row.site_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [allRows, search]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
    [departments],
  );

  const siteOptions = useMemo(
    () => sites.filter((s) => s.status !== 'inactive').map((s) => ({ value: s.id, label: s.name })),
    [sites],
  );

  const buildingOptions = useMemo(() => {
    const list = form.siteId
      ? buildings.filter((b) => b.site_id === form.siteId)
      : buildings;
    return list.map((b) => ({
      value: b.id,
      label: b.site_name ? `${b.name} · ${b.site_name}` : b.name,
    }));
  }, [buildings, form.siteId]);

  const zoneOptions = useMemo(() => {
    const list = form.buildingId
      ? zones.filter((z) => z.building_id === form.buildingId)
      : form.siteId
        ? zones.filter((z) => z.site_id === form.siteId || buildings.some((b) => b.id === z.building_id && b.site_id === form.siteId))
        : zones;
    return list.map((z) => ({
      value: z.id,
      label: z.access_level ? `${z.name} · ${z.access_level}` : z.name,
    }));
  }, [zones, buildings, form.buildingId, form.siteId]);

  const prerequisitesReady = departmentOptions.length > 0 && buildingOptions.length > 0 && zones.length > 0;

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first.');
      return;
    }
    if (!departmentOptions.length) {
      toast.error('Create a department first. Offices belong to a department and a zone.');
      return;
    }
    if (!buildings.length) {
      toast.error('Create a building first.');
      return;
    }
    if (!zones.length) {
      toast.error('Create a zone first. Offices fall under a zone inside a building.');
      return;
    }
    const firstBuilding = buildings[0];
    const firstZone = zones.find((z) => z.building_id === firstBuilding?.id) || zones[0];
    setEditing(null);
    setForm({
      ...emptyForm(),
      departmentId: departmentOptions[0].value,
      siteId: firstBuilding?.site_id || firstZone?.site_id || siteOptions[0]?.value || '',
      buildingId: firstZone?.building_id || firstBuilding?.id || '',
      zoneId: firstZone?.id || '',
    });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      officeNumber: row.office_number || '',
      name: row.name || '',
      departmentId: row.department_id || '',
      siteId: row.site_id || '',
      buildingId: row.building_id || '',
      zoneId: row.zone_id || '',
      status: row.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.officeNumber.trim()) {
      toast.error('Office label is required.');
      return;
    }
    if (!form.departmentId || !form.buildingId || !form.zoneId) {
      toast.error('Department, building, and zone are required.');
      return;
    }
    setSaving(true);
    try {
      const label = form.officeNumber.trim();
      const payload = {
        officeNumber: label,
        name: label,
        departmentId: form.departmentId,
        buildingId: form.buildingId,
        zoneId: form.zoneId,
        status: form.status,
      };
      if (editing?.id) {
        await visitorApi.updateOffice(editing.id, payload);
        toast.success('Office updated.');
      } else {
        await visitorApi.createOffice(payload);
        toast.success('Office created.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save office.');
    } finally {
      setSaving(false);
    }
  };

  const openShow = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/offices/${row.id}`);
  }, [navigate]);

  const columns = useMemo(() => [
    {
      key: 'office_number',
      label: 'Office Label',
      render: (_, row) => (
        <p className="font-medium text-gray-900">{row.office_number || row.name || '—'}</p>
      ),
    },
    { key: 'department_name', label: 'Department' },
    { key: 'zone_name', label: 'Zone' },
    { key: 'building_name', label: 'Building' },
    { key: 'site_name', label: 'Site' },
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
          label="View office"
          iconSize={16}
          onClick={(e) => {
            e.stopPropagation();
            openShow(row);
          }}
        />
      ),
    },
  ], []);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Offices"
        subtitle="Building → Zone + Department → Office. Site is inherited from the building."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Offices' }]}
        actions={(
          <button
            type="button"
            onClick={openCreate}
            disabled={!canManageStructure || orgLoading || !prerequisitesReady}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Office
          </button>
        )}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Offices" />
      )}
      <StructureRelationHint highlight="Office" />

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { key: 'total', label: 'Offices', icon: DoorClosed },
          { key: 'active', label: 'Active', icon: DoorClosed },
          { key: 'zones', label: 'Zones', icon: Map },
          { key: 'buildings', label: 'Buildings', icon: Building2 },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
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
            <div className="border-b border-gray-200 px-4 py-2 sm:px-5">
              <label className="relative block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search office label, department, zone, building..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                />
              </label>
            </div>
            <DataTable
              embedded
              columns={columns}
              data={pageRows}
              loading={loading}
              emptyTitle={!prerequisitesReady ? 'Prerequisites missing' : 'No offices found.'}
              emptyDescription={
                !departmentOptions.length
                  ? 'Create a Department first, then a Zone, then an Office.'
                  : !buildings.length
                    ? 'Create a Building under a Site first.'
                    : !zones.length
                      ? 'Create a Zone under a Building first, then add offices.'
                      : 'Add an office label in a zone for a department.'
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

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Office' : 'New Office'}
        subtitle="Office → Zone + Building + Department (site from building)"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              {editing ? 'Save changes' : 'Create office'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Department"
            name="departmentId"
            type="select"
            required
            value={form.departmentId}
            onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value }))}
            options={departmentOptions}
          />
          <FormField
            label="Site / Branch"
            name="siteId"
            type="select"
            required
            value={form.siteId}
            onChange={(e) => {
              const siteId = e.target.value;
              const nextBuilding = buildings.find((b) => b.site_id === siteId);
              const nextZone = zones.find((z) => z.building_id === nextBuilding?.id);
              setForm((prev) => ({
                ...prev,
                siteId,
                buildingId: nextBuilding?.id || '',
                zoneId: nextZone?.id || '',
              }));
            }}
            options={siteOptions}
            helpText="Used to filter buildings and zones."
          />
          <FormField
            label="Building"
            name="buildingId"
            type="select"
            required
            value={form.buildingId}
            onChange={(e) => {
              const buildingId = e.target.value;
              const nextZone = zones.find((z) => z.building_id === buildingId);
              setForm((prev) => ({
                ...prev,
                buildingId,
                zoneId: nextZone?.id || '',
              }));
            }}
            options={buildingOptions}
          />
          <FormField
            label="Zone"
            name="zoneId"
            type="select"
            required
            value={form.zoneId}
            onChange={(e) => {
              const zoneId = e.target.value;
              const zone = zones.find((z) => z.id === zoneId);
              setForm((prev) => ({
                ...prev,
                zoneId,
                buildingId: zone?.building_id || prev.buildingId,
                siteId: zone?.site_id || prev.siteId,
              }));
            }}
            options={zoneOptions}
            helpText="Required. Office belongs to this zone inside the building."
          />
          <FormField
            label="Office Label"
            name="officeNumber"
            required
            value={form.officeNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, officeNumber: e.target.value }))}
            placeholder="IT Dep Group office 6"
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
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
