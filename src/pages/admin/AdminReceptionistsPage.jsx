import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  ConciergeBell,
  Eye,
  Map,
  MapPin,
  Network,
  Plus,
  Search,
  Trash2,
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
  ConfirmDialog,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';
import { useOrganisationPrerequisite } from '../../hooks/useOrganisationPrerequisite';
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';
import OrganisationRequiredBanner from '../../components/admin/OrganisationRequiredBanner';
import StructureRelationHint from '../../components/admin/StructureRelationHint';
import {
  activeSitesForOrg,
  hasStructurePrerequisites,
  resolveDefaultOrganisationId,
  zonesForOrg,
} from '../../utils/adminStructureDefaults';

const emptyForm = () => ({
  organisationId: '',
  name: '',
  email: '',
  phone: '',
  siteId: '',
  zoneIds: [],
  departmentId: '',
  status: 'active',
  password: '',
});

function ZoneCheckboxField({
  label,
  zones,
  selectedIds,
  onChange,
  required = false,
  helpText = '',
}) {
  const toggleZone = (zoneId) => {
    onChange(
      selectedIds.includes(zoneId)
        ? selectedIds.filter((id) => id !== zoneId)
        : [...selectedIds, zoneId],
    );
  };

  return (
    <div>
      {label ? (
        <p className="mb-1.5 block text-sm font-medium text-navy-700">
          {label} {required ? <span className="text-red-400">*</span> : null}
        </p>
      ) : null}
      <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-navy-200 bg-navy-50 p-3">
        {zones.length === 0 ? (
          <p className="text-sm text-navy-400">No zones available for this site.</p>
        ) : (
          zones.map((zone) => (
            <label
              key={zone.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-white/70"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(zone.value)}
                onChange={() => toggleZone(zone.value)}
                className="mt-0.5 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="font-medium text-navy-900">{zone.label}</span>
            </label>
          ))
        )}
      </div>
      {helpText ? <p className="mt-1 text-xs text-navy-400">{helpText}</p> : null}
    </div>
  );
}

export default function AdminReceptionistsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const {
    organisations,
    hasOrganisation,
    hasActiveOrganisation,
    loading: orgLoading,
  } = useOrganisationPrerequisite();
  const { organisationId: selectedOrganisationId } = useAdminOrganisation();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [zones, setZones] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
      const [rows, deptRows, siteRows, zoneRows] = await Promise.all([
        visitorApi.getReceptionists(),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getZones(),
      ]);
      setAllRows(Array.isArray(rows) ? rows : []);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setZones(Array.isArray(zoneRows) ? zoneRows : []);
      setKpis(rows?.stats || { total: rows?.length || 0 });
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load receptionists.');
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
      [row.name, row.email, row.organisation_name, row.site_name, row.zone_name, row.zone_names, row.department_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [allRows, search]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const orgOptions = useMemo(
    () => organisations
      .filter((org) => org.status !== 'inactive')
      .map((org) => ({ value: org.id, label: org.name })),
    [organisations],
  );

  const siteOptions = useMemo(
    () => sites
      .filter((s) => s.status !== 'inactive')
      .filter((s) => !form.organisationId || s.organisation_id === form.organisationId)
      .map((s) => ({ value: s.id, label: s.name })),
    [sites, form.organisationId],
  );

  const zoneOptions = useMemo(() => {
    const list = zones.filter((z) => {
      if (form.organisationId && z.organisation_id && z.organisation_id !== form.organisationId) return false;
      if (form.siteId && z.site_id && z.site_id !== form.siteId) return false;
      return true;
    });
    return list.map((z) => ({
      value: z.id,
      label: z.building_name ? `${z.name} · ${z.building_name}` : z.name,
    }));
  }, [zones, form.organisationId, form.siteId]);

  const departmentOptions = useMemo(() => [
    { value: '', label: 'No department (optional)' },
    ...departments
      .filter((d) => !form.organisationId || d.organisation_id === form.organisationId)
      .map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
  ], [departments, form.organisationId]);

  const prerequisitesReady = hasStructurePrerequisites({
    orgOptions,
    sites,
    zones,
    preferredOrgId: selectedOrganisationId,
    requireZones: true,
  });

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first.');
      return;
    }
    if (!orgOptions.length) {
      toast.error('Create an organisation first.');
      return;
    }
    const defaultOrgId = resolveDefaultOrganisationId({
      orgOptions,
      sites,
      zones,
      preferredOrgId: selectedOrganisationId,
      requireZones: true,
    });
    const siteForOrg = activeSitesForOrg(sites, defaultOrgId);
    if (!defaultOrgId || !siteForOrg.length) {
      toast.error('Create a site/branch under an organisation first.');
      return;
    }
    const zonesForSite = zonesForOrg(zones, defaultOrgId, siteForOrg[0].id);
    if (!zonesForSite.length) {
      toast.error('Create a zone first.');
      return;
    }
    const defaultSiteId = siteForOrg[0].id;
    const zoneForSite = zonesForSite[0];
    setEditing(null);
    setForm({
      ...emptyForm(),
      organisationId: defaultOrgId,
      siteId: zoneForSite?.site_id || defaultSiteId,
      zoneIds: zonesForSite.length ? [zonesForSite[0].id] : [],
    });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      organisationId: row.organisation_id || '',
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      siteId: row.site_id || '',
      zoneIds: Array.isArray(row.zone_ids) && row.zone_ids.length
        ? row.zone_ids
        : (row.zone_id ? [row.zone_id] : []),
      departmentId: row.department_id || '',
      status: row.status || 'active',
      password: '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Receptionist name is required.');
      return;
    }
    if (!editing && !form.organisationId) {
      toast.error('Organisation is required.');
      return;
    }
    if (!form.siteId) {
      toast.error('Site / branch is required.');
      return;
    }
    if (!form.zoneIds.length) {
      toast.error('Select at least one zone.');
      return;
    }
    if (!form.email.trim()) {
      toast.error('Email is required for receptionist login.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        siteId: form.siteId,
        zoneIds: form.zoneIds,
        departmentId: form.departmentId || null,
        status: form.status,
        password: form.password || undefined,
      };
      if (editing?.id) {
        await visitorApi.updateReceptionist(editing.id, payload);
        toast.success('Receptionist updated.');
      } else {
        await visitorApi.createReceptionist({
          ...payload,
          organisationId: form.organisationId,
        });
        toast.success('Receptionist created with Reception portal access.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save receptionist.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await visitorApi.deleteReceptionist(deleteTarget.id);
      toast.success('Receptionist deleted.');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete receptionist.');
    } finally {
      setDeleting(false);
    }
  };

  const openShow = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/receptionists/${row.id}`);
  }, [navigate]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Receptionist',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.email || '—'}</p>
        </div>
      ),
    },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'site_name', label: 'Site / Branch' },
    { key: 'zone_names', label: 'Zones', render: (_, row) => row.zone_names || row.zone_name || '—' },
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
            label="View receptionist"
            iconSize={16}
            onClick={(e) => {
              e.stopPropagation();
              openShow(row);
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete receptionist"
            iconSize={16}
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
          />
        </div>
      ),
    },
  ], []);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Receptionists"
        subtitle="Organisation → Site + Zones → Receptionist. Creates Reception portal login access."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Receptionists' }]}
        actions={(
          <button
            type="button"
            onClick={openCreate}
            disabled={!canManageStructure || orgLoading || !prerequisitesReady}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Receptionist
          </button>
        )}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Receptionists" />
      )}
      <StructureRelationHint highlight="Employee" />

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { key: 'total', label: 'Receptionists', icon: ConciergeBell },
          { key: 'active', label: 'Active', icon: ConciergeBell },
          { key: 'with_zone', label: 'With zone', icon: Map },
          { key: 'with_login', label: 'With login', icon: Building2 },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
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
                  placeholder="Search name, email, organisation, site, zone..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                />
              </label>
            </div>
            <DataTable
              embedded
              columns={columns}
              data={pageRows}
              loading={loading}
              emptyTitle={!prerequisitesReady ? 'Prerequisites missing' : 'No receptionists found.'}
              emptyDescription={
                !orgOptions.length
                  ? 'Create an Organisation first.'
                  : !prerequisitesReady
                    ? 'Add a Site / Branch and Zone under an organisation, or select that organisation in the header switcher.'
                    : 'Add a receptionist under an organisation, site and zone.'
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
        title={editing ? 'Edit Receptionist' : 'New Receptionist'}
        subtitle="Organisation → Site + Zones → Receptionist (Reception portal access)"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              {editing ? 'Save changes' : 'Create receptionist'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Organisation"
            name="organisationId"
            type="select"
            required
            value={form.organisationId}
            disabled={Boolean(editing)}
            onChange={(e) => {
              const organisationId = e.target.value;
              const siteForOrg = sites.filter((s) => s.status !== 'inactive' && s.organisation_id === organisationId);
              const nextSiteId = siteForOrg[0]?.id || '';
              const nextZones = zonesForOrg(zones, organisationId, nextSiteId);
              setForm((prev) => ({
                ...prev,
                organisationId,
                siteId: nextSiteId,
                zoneIds: nextZones.length ? [nextZones[0].id] : [],
                departmentId: '',
              }));
            }}
            options={orgOptions}
            helpText={editing ? 'Organisation cannot be changed after create.' : 'Required.'}
          />
          <FormField
            label="Full name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Grace Phiri"
          />
          <FormField
            label="Email"
            name="email"
            required
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="reception@company.com"
            helpText="Used for Reception portal login."
          />
          <FormField
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+260..."
          />
          <FormField
            label="Site / Branch"
            name="siteId"
            type="select"
            required
            value={form.siteId}
            onChange={(e) => {
              const siteId = e.target.value;
              const nextZones = zonesForOrg(zones, form.organisationId, siteId);
              setForm((prev) => ({
                ...prev,
                siteId,
                zoneIds: prev.zoneIds.filter((zoneId) => nextZones.some((zone) => zone.id === zoneId)),
              }));
            }}
            options={siteOptions}
          />
          <ZoneCheckboxField
            label="Zones"
            zones={zoneOptions}
            selectedIds={form.zoneIds}
            onChange={(zoneIds) => setForm((prev) => ({ ...prev, zoneIds }))}
            required
            helpText="Select every reception desk zone this receptionist can cover."
          />
          <FormField
            label="Department"
            name="departmentId"
            type="select"
            value={form.departmentId}
            onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value }))}
            options={departmentOptions}
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
          <FormField
            label={editing ? 'Reset password' : 'Temporary password'}
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder={editing ? 'Leave blank to keep current' : 'Optional — defaults to demo password'}
            helpText={editing ? 'Leave blank to keep the current password.' : 'Optional. Defaults to the portal demo password if empty.'}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete receptionist?"
        message={
          deleteTarget
            ? `Remove ${deleteTarget.name} from receptionists and revoke Reception portal access.`
            : 'Are you sure you want to proceed?'
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
