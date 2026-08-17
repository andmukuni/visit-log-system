import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  DoorOpen,
  Eye,
  MapPin,
  Network,
  Plus,
  Search,
  Trash2,
  X,
  Edit3,
  KeyRound,
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
} from '../../utils/adminStructureDefaults';

const emptyForm = () => ({
  organisationId: '',
  name: '',
  email: '',
  phone: '',
  siteId: '',
  stationId: '',
  departmentId: '',
  status: 'active',
  password: '',
});

export default function AdminSecurityGuardsPage() {
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
  const [stations, setStations] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);

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
      const [rows, deptRows, siteRows, stationRows] = await Promise.all([
        visitorApi.getSecurityGuards(),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getStations(),
      ]);
      setAllRows(Array.isArray(rows) ? rows : []);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setStations(Array.isArray(stationRows) ? stationRows : []);
      setKpis(rows?.stats || { total: rows?.length || 0 });
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load security guards.');
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
      [row.name, row.email, row.organisation_name, row.site_name, row.station_name, row.department_name]
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

  const stationOptions = useMemo(() => {
    const list = stations.filter((st) => {
      if (form.organisationId && st.organisation_id && st.organisation_id !== form.organisationId) return false;
      if (form.siteId && st.site_id && st.site_id !== form.siteId) return false;
      return st.status !== 'inactive';
    });
    return [
      { value: '', label: 'No station (optional)' },
      ...list.map((st) => ({ value: st.id, label: st.name })),
    ];
  }, [stations, form.organisationId, form.siteId]);

  const departmentOptions = useMemo(() => [
    { value: '', label: 'No department (optional)' },
    ...departments
      .filter((d) => !form.organisationId || d.organisation_id === form.organisationId)
      .map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
  ], [departments, form.organisationId]);

  const prerequisitesReady = hasStructurePrerequisites({
    orgOptions,
    sites,
    preferredOrgId: selectedOrganisationId,
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
      preferredOrgId: selectedOrganisationId,
    });
    const siteForOrg = activeSitesForOrg(sites, defaultOrgId);
    if (!defaultOrgId || !siteForOrg.length) {
      toast.error('Create a site/branch under an organisation first.');
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm(),
      organisationId: defaultOrgId,
      siteId: siteForOrg[0].id,
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
      stationId: row.station_id || '',
      departmentId: row.department_id || '',
      status: row.status || 'active',
      password: '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Security Guard name is required.');
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
    if (!form.email.trim()) {
      toast.error('Email is required for security guard login.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        siteId: form.siteId,
        stationId: form.stationId || null,
        departmentId: form.departmentId || null,
        status: form.status,
        password: form.password || undefined,
      };
      if (editing?.id) {
        await visitorApi.updateSecurityGuard(editing.id, payload);
        toast.success('Security Guard updated.');
      } else {
        await visitorApi.createSecurityGuard({
          ...payload,
          organisationId: form.organisationId,
        });
        toast.success('Security Guard created with Station portal access.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save security guard.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await visitorApi.deleteSecurityGuard(deleteTarget.id);
      toast.success('Security Guard deleted.');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete security guard.');
    } finally {
      setDeleting(false);
    }
  };

  const openPasswordModal = (row) => {
    if (!row?.email?.trim()) {
      toast.error('Add an email address before setting a password.');
      return;
    }
    setPasswordTarget(row);
    setPasswordForm({ password: '', confirmPassword: '' });
  };

  const handlePasswordSave = async () => {
    if (!passwordTarget?.id) return;
    const password = passwordForm.password.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();
    if (!password) {
      toast.error('Enter a new password.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await visitorApi.updateSecurityGuard(passwordTarget.id, {
        name: passwordTarget.name,
        email: passwordTarget.email,
        phone: passwordTarget.phone,
        siteId: passwordTarget.site_id,
        stationId: passwordTarget.station_id || null,
        departmentId: passwordTarget.department_id || null,
        status: passwordTarget.status,
        password,
      });
      toast.success('Password updated. The guard can sign in with the new password.');
      setPasswordTarget(null);
      setPasswordForm({ password: '', confirmPassword: '' });
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const openShow = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/security-guards/${row.id}`);
  }, [navigate]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Security Guard',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.email || '—'}</p>
        </div>
      ),
    },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'site_name', label: 'Site / Branch' },
    { key: 'station_name', label: 'Station' },
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
            label="View security guard"
            iconSize={16}
            onClick={(e) => {
              e.stopPropagation();
              openShow(row);
            }}
          />
          <IconButton
            icon={Edit3}
            label="Edit security guard"
            iconSize={16}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
          />
          <IconButton
            icon={KeyRound}
            label="Change password"
            iconSize={16}
            disabled={!row.email}
            onClick={(e) => {
              e.stopPropagation();
              openPasswordModal(row);
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete security guard"
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
  ], [openShow]);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Security Guards"
        subtitle="Organisation → Site + Station → Security Guard. Creates Station portal login access."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Security Guards' }]}
        actions={(
          <button
            type="button"
            onClick={openCreate}
            disabled={!canManageStructure || orgLoading || !prerequisitesReady}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Security Guard
          </button>
        )}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Security Guards" />
      )}
      <StructureRelationHint highlight="Employee" />

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { key: 'total', label: 'Security Guards', icon: ShieldCheck },
          { key: 'active', label: 'Active', icon: ShieldCheck },
          { key: 'with_station', label: 'With station', icon: DoorOpen },
          { key: 'with_login', label: 'With login', icon: Building2 },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
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
                  placeholder="Search name, email, organisation, site, station..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                />
              </label>
            </div>
            <DataTable
              embedded
              columns={columns}
              data={pageRows}
              loading={loading}
              emptyTitle={!prerequisitesReady ? 'Prerequisites missing' : 'No security guards found.'}
              emptyDescription={
                !orgOptions.length
                  ? 'Create an Organisation first.'
                  : !sites.some((s) => s.status !== 'inactive')
                    ? 'Create a Site / Branch first.'
                    : 'Add a security guard under an organisation and site.'
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
        title={editing ? 'Edit Security Guard' : 'New Security Guard'}
        subtitle="Organisation → Site + Station → Security Guard (Station portal access)"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              {editing ? 'Save changes' : 'Create security guard'}
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
              setForm((prev) => ({
                ...prev,
                organisationId,
                siteId: siteForOrg[0]?.id || '',
                stationId: '',
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
            placeholder="guard@company.com"
            helpText="Used for Station portal login."
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
            onChange={(e) => setForm((prev) => ({ ...prev, siteId: e.target.value, stationId: '' }))}
            options={siteOptions}
          />
          <FormField
            label="Station / Gate"
            name="stationId"
            type="select"
            value={form.stationId}
            onChange={(e) => setForm((prev) => ({ ...prev, stationId: e.target.value }))}
            options={stationOptions}
            helpText="Optional. Optional. Gate/station for scoped security operations."
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
          {!editing ? (
            <FormField
              label="Temporary password"
              name="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Optional — defaults to demo password"
              helpText="Optional. Defaults to the portal demo password if empty."
            />
          ) : (
            <p className="rounded-lg border border-navy-100 bg-navy-50/60 px-3 py-2 text-xs text-navy-600">
              Use the key icon in the table or the guard detail page to change the Station portal password.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(passwordTarget)}
        onClose={() => !savingPassword && setPasswordTarget(null)}
        title="Change password"
        subtitle={passwordTarget?.email ? `Station portal login for ${passwordTarget.email}` : 'Station portal login'}
        size="sm"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={savingPassword}
              onClick={() => setPasswordTarget(null)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <LoadingButton loading={savingPassword} onClick={handlePasswordSave}>
              Save password
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="New password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={passwordForm.password}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Enter new password"
            helpText="Minimum length follows your organisation security settings (usually 8 characters)."
          />
          <FormField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            placeholder="Re-enter new password"
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete security guard?"
        message={
          deleteTarget
            ? `Remove ${deleteTarget.name} from security guards and revoke Station portal access.`
            : 'Are you sure you want to proceed?'
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
