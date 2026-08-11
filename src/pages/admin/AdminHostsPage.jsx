import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DoorClosed, Eye, Network, Plus, Search, UserCheck } from 'lucide-react';
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
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';
import OrganisationRequiredBanner from '../../components/admin/OrganisationRequiredBanner';
import StructureRelationHint from '../../components/admin/StructureRelationHint';
import {
  activeSitesForOrg,
  hasStructurePrerequisites,
  resolveDefaultOrganisationId,
} from '../../utils/adminStructureDefaults';

const TITLE_OPTIONS = [
  { value: '', label: 'No title' },
  { value: 'Mr', label: 'Mr' },
  { value: 'Mrs', label: 'Mrs' },
  { value: 'Ms', label: 'Ms' },
  { value: 'Miss', label: 'Miss' },
  { value: 'Dr', label: 'Dr' },
  { value: 'Prof', label: 'Prof' },
  { value: 'Eng', label: 'Eng' },
  { value: 'Hon', label: 'Hon' },
  { value: 'Rev', label: 'Rev' },
];

const PORTAL_ROLE_OPTIONS = [
  { value: 'host', label: 'General Employee' },
  { value: 'ceo', label: 'CEO' },
  { value: 'dceo', label: 'Deputy CEO' },
];

const emptyForm = () => ({
  organisationId: '',
  title: '',
  name: '',
  email: '',
  phone: '',
  departmentId: '',
  siteId: '',
  officeId: '',
  status: 'active',
  availability: 'available',
  portalRole: 'host',
  password: '',
});

function formatHostDisplayName(row) {
  const title = String(row?.title || '').trim();
  const name = String(row?.name || '').trim();
  if (title && name) return `${title} ${name}`;
  return name || '—';
}

export default function AdminHostsPage() {
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
  const [offices, setOffices] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
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
      const [rows, deptRows, siteRows, officeRows] = await Promise.all([
        visitorApi.getHosts(),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getOffices(),
      ]);
      setAllRows(Array.isArray(rows) ? rows : []);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setOffices(Array.isArray(officeRows) ? officeRows : []);
      setKpis(rows?.stats || { total: rows?.length || 0 });
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load employees.');
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
      [
        row.title,
        row.name,
        row.email,
        row.organisation_name,
        row.department_name,
        row.site_name,
        row.office_number,
        row.portal_role_label,
        row.portal_role,
      ]
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

  const departmentOptions = useMemo(
    () => departments
      .filter((d) => !form.organisationId || d.organisation_id === form.organisationId)
      .map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
    [departments, form.organisationId],
  );

  const siteOptions = useMemo(
    () => sites
      .filter((s) => s.status !== 'inactive')
      .filter((s) => !form.organisationId || s.organisation_id === form.organisationId)
      .map((s) => ({ value: s.id, label: s.name })),
    [sites, form.organisationId],
  );

  const officeOptions = useMemo(() => {
    const list = offices.filter((ofc) => {
      if (form.organisationId && ofc.organisation_id && ofc.organisation_id !== form.organisationId) return false;
      if (form.departmentId && ofc.department_id !== form.departmentId) return false;
      if (form.siteId && ofc.site_id && ofc.site_id !== form.siteId) return false;
      return ofc.status !== 'inactive';
    });
    return [
      { value: '', label: 'No office (optional)' },
      ...list.map((ofc) => ({
        value: ofc.id,
        label: `#${ofc.office_number}${ofc.name ? ` · ${ofc.name}` : ''}`,
      })),
    ];
  }, [offices, form.organisationId, form.departmentId, form.siteId]);

  const prerequisitesReady = hasStructurePrerequisites({
    orgOptions,
    sites,
    departments,
    preferredOrgId: selectedOrganisationId,
    requireDepartments: true,
  });

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first.');
      return;
    }
    if (!orgOptions.length) {
      toast.error('Create an organisation first. Employees belong to an organisation.');
      return;
    }
    const defaultOrgId = resolveDefaultOrganisationId({
      orgOptions,
      sites,
      departments,
      preferredOrgId: selectedOrganisationId,
      requireDepartments: true,
    });
    const deptForOrg = departments.filter((d) => d.organisation_id === defaultOrgId);
    const siteForOrg = activeSitesForOrg(sites, defaultOrgId);
    if (!defaultOrgId || !deptForOrg.length) {
      toast.error('Create a department under an organisation first.');
      return;
    }
    if (!siteForOrg.length) {
      toast.error('Create a site/branch under an organisation first.');
      return;
    }
    setForm({
      ...emptyForm(),
      organisationId: defaultOrgId,
      departmentId: deptForOrg[0].id,
      siteId: siteForOrg[0].id,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Host name is required.');
      return;
    }
    if (!form.organisationId) {
      toast.error('Organisation is required.');
      return;
    }
    if (!form.departmentId || !form.siteId) {
      toast.error('Department and site are required.');
      return;
    }
    if (form.password && !form.email.trim()) {
      toast.error('Email is required to set a host password.');
      return;
    }
    if ((form.portalRole === 'ceo' || form.portalRole === 'dceo') && !form.email.trim()) {
      toast.error('Email is required for CEO or Deputy CEO.');
      return;
    }
    setSaving(true);
    try {
      const created = await visitorApi.createHost({
        title: form.title || null,
        name: form.name,
        email: form.email,
        phone: form.phone,
        departmentId: form.departmentId,
        siteId: form.siteId,
        officeId: form.officeId || null,
        status: form.status,
        availability: form.availability,
        portalRole: form.portalRole || 'host',
        password: form.password || undefined,
        organisationId: form.organisationId,
      });
      toast.success('Host created.');
      setModalOpen(false);
      if (created?.id) {
        navigate(`/admin/hosts/${created.id}`);
        return;
      }
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save host.');
    } finally {
      setSaving(false);
    }
  };

  const openHost = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/hosts/${row.id}`);
  }, [navigate]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Host',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{formatHostDisplayName(row)}</p>
          <p className="text-xs text-gray-500">{row.email || '—'}</p>
        </div>
      ),
    },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'department_name', label: 'Department' },
    { key: 'site_name', label: 'Site / Branch' },
    {
      key: 'office_number',
      label: 'Office',
      render: (value) => (value ? `#${value}` : '—'),
    },
    {
      key: 'portal_role_label',
      label: 'Role',
      render: (_, row) => row.portal_role_label
        || PORTAL_ROLE_OPTIONS.find((option) => option.value === row.portal_role)?.label
        || 'General Employee',
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
    {
      key: 'availability',
      label: 'Availability',
      render: (value) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
            value === 'unavailable'
              ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
              : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${value === 'unavailable' ? 'bg-rose-500' : 'bg-emerald-500'}`}
            aria-hidden="true"
          />
          {value === 'unavailable' ? 'Not available' : 'Available'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <IconButton
          icon={Eye}
          label="View employee"
          iconSize={16}
          onClick={(e) => {
            e.stopPropagation();
            openHost(row);
          }}
        />
      ),
    },
  ], [openHost]);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Hosts"
        subtitle="Organisation → Department + Site → Employee. Manage Available / Not available for reception."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Hosts' }]}
        actions={(
          <button
            type="button"
            onClick={openCreate}
            disabled={!canManageStructure || orgLoading || !prerequisitesReady}
            title={!canManageStructure ? 'Create an organisation first' : undefined}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Employee
          </button>
        )}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Hosts" />
      )}
      <StructureRelationHint highlight="Employee" />

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { key: 'total', label: 'Employees', icon: UserCheck },
          { key: 'active', label: 'Active', icon: UserCheck },
          { key: 'with_office', label: 'With office', icon: DoorClosed },
          { key: 'departments', label: 'Departments', icon: Network },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
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
        <div className="border-b border-gray-200 px-4 py-2 sm:px-5">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, department, site..."
              className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
            />
          </label>
        </div>
        <DataTable
          embedded
          columns={columns}
          data={pageRows}
          loading={loading}
          emptyTitle={!prerequisitesReady ? 'Prerequisites missing' : 'No employees found.'}
          emptyDescription={
            !orgOptions.length
              ? 'Create an Organisation first. Employees belong to an organisation.'
              : !departments.length
                ? 'Create a Department first, then assign employees to department + site.'
                : !sites.some((s) => s.status !== 'inactive')
                  ? 'Create a Site / Branch first, then assign employees.'
                  : 'Add an employee under an organisation, department and site.'
          }
          onRowClick={openHost}
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

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="New Host"
        subtitle="Organisation → Host → Department + Site (+ optional Office)"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              Create host
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
            onChange={(e) => {
              const organisationId = e.target.value;
              const deptForOrg = departments.filter((d) => d.organisation_id === organisationId);
              const siteForOrg = sites.filter((s) => s.status !== 'inactive' && s.organisation_id === organisationId);
              setForm((prev) => ({
                ...prev,
                organisationId,
                departmentId: deptForOrg[0]?.id || '',
                siteId: siteForOrg[0]?.id || '',
                officeId: '',
              }));
            }}
            options={orgOptions}
            helpText="Required. Host belongs to this organisation."
          />
          <FormField
            label="Title"
            name="title"
            type="select"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            options={TITLE_OPTIONS}
            helpText="Optional salutation (Mr, Mrs, Dr, etc.)."
          />
          <FormField
            label="Full name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Jane Banda"
          />
          <FormField
            label="Email"
            name="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="jane@company.com"
            helpText="Required for Host portal login and password reset emails."
          />
          <FormField
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+260..."
          />
          <FormField
            label="Department"
            name="departmentId"
            type="select"
            required
            value={form.departmentId}
            onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value, officeId: '' }))}
            options={departmentOptions}
          />
          <FormField
            label="Site / Branch"
            name="siteId"
            type="select"
            required
            value={form.siteId}
            onChange={(e) => setForm((prev) => ({ ...prev, siteId: e.target.value, officeId: '' }))}
            options={siteOptions}
          />
          <FormField
            label="Office"
            name="officeId"
            type="select"
            value={form.officeId}
            onChange={(e) => setForm((prev) => ({ ...prev, officeId: e.target.value }))}
            options={officeOptions}
            helpText="Optional. Must match the selected department and site."
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
            label="Availability"
            name="availability"
            type="select"
            value={form.availability}
            onChange={(e) => setForm((prev) => ({ ...prev, availability: e.target.value }))}
            options={[
              { value: 'available', label: 'Available' },
              { value: 'unavailable', label: 'Not available' },
            ]}
            helpText="Shown on reception Host Queue. Only admins can change this."
          />
          <FormField
            label="Role"
            name="portalRole"
            type="select"
            value={form.portalRole}
            onChange={(e) => setForm((prev) => ({ ...prev, portalRole: e.target.value }))}
            options={PORTAL_ROLE_OPTIONS}
            helpText="CEO and Deputy CEO see Executive Calendar; General Employee sees Calendar."
          />
          <FormField
            label="Temporary password"
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Optional"
            helpText="Optional. Creates Host portal login when email is set. Prefer sending a password reset from the host details page."
          />
        </div>
      </Modal>
    </div>
  );
}
