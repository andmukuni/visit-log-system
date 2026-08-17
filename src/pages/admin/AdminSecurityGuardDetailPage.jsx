import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  DoorOpen,
  Edit3,
  ExternalLink,
  KeyRound,
  Mail,
  MapPin,
  MonitorSmartphone,
  Network,
  Phone,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import {
  PageHeader,
  StatusBadge,
  Modal,
  FormField,
  LoadingButton,
  ConfirmDialog,
  Spinner,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

const emptyForm = () => ({
  organisationId: '',
  name: '',
  email: '',
  phone: '',
  siteId: '',
  stationId: '',
  departmentId: '',
  status: 'active',
});

const emptyPasswordForm = () => ({
  password: '',
  confirmPassword: '',
});

function guardInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'SG';
  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

function DetailItem({ icon: Icon, label, value, action = null }) {
  return (
    <div className="flex gap-3 rounded-xl border border-navy-100 bg-navy-50/40 px-3.5 py-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-navy-500 shadow-sm ring-1 ring-navy-100">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-navy-400">{label}</p>
        <p className="mt-1 text-sm font-semibold text-navy-900 break-words">{value || '—'}</p>
        {action}
      </div>
    </div>
  );
}

function ScopeChip({ children, tone = 'cyan', icon: Icon = null }) {
  const tones = {
    cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-600/15',
    amber: 'bg-amber-50 text-amber-900 ring-amber-600/15',
    slate: 'bg-slate-100 text-slate-700 ring-slate-400/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tones[tone] || tones.cyan}`}>
      {Icon ? <Icon size={12} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export default function AdminSecurityGuardDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [guard, setGuard] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm());
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [row, deptRows, siteRows, stationRows] = await Promise.all([
        visitorApi.getSecurityGuard(id),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getStations(),
      ]);
      setGuard(row || null);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setStations(Array.isArray(stationRows) ? stationRows : []);
    } catch (err) {
      setGuard(null);
      toast.error(err?.message || 'Unable to load security guard.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const orgOptions = useMemo(() => {
    if (!guard?.organisation_id) return [];
    return [{
      value: guard.organisation_id,
      label: guard.organisation_name || 'Organisation',
    }];
  }, [guard]);

  const siteOptions = useMemo(
    () => sites
      .filter((s) => s.status !== 'inactive')
      .filter((s) => !form.organisationId || s.organisation_id === form.organisationId)
      .map((s) => ({ value: s.id, label: s.name })),
    [sites, form.organisationId],
  );

  const stationOptions = useMemo(() => [
    { value: '', label: 'No station (site-wide)' },
    ...stations
      .filter((st) => !form.siteId || st.site_id === form.siteId)
      .map((st) => ({ value: st.id, label: st.name })),
  ], [stations, form.siteId]);

  const departmentOptions = useMemo(() => [
    { value: '', label: 'No department (optional)' },
    ...departments
      .filter((d) => !form.organisationId || d.organisation_id === form.organisationId)
      .map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
  ], [departments, form.organisationId]);

  const stationNames = useMemo(() => {
    if (!guard) return [];
    if (guard.station_names) {
      return String(guard.station_names).split(',').map((s) => s.trim()).filter(Boolean);
    }
    return guard.station_name ? [guard.station_name] : [];
  }, [guard]);

  const buildingNames = useMemo(() => {
    if (!guard?.building_names) return [];
    return String(guard.building_names).split(',').map((s) => s.trim()).filter(Boolean);
  }, [guard]);

  const openEdit = () => {
    if (!guard) return;
    setForm({
      organisationId: guard.organisation_id || '',
      name: guard.name || '',
      email: guard.email || '',
      phone: guard.phone || '',
      siteId: guard.site_id || '',
      stationId: guard.station_id || '',
      departmentId: guard.department_id || '',
      status: guard.status || 'active',
    });
    setModalOpen(true);
  };

  const openPasswordModal = () => {
    if (!guard) return;
    if (!guard.email?.trim()) {
      toast.error('Add an email address before setting a password.');
      return;
    }
    setPasswordForm(emptyPasswordForm());
    setPasswordModalOpen(true);
  };

  const handleSave = async () => {
    if (!guard?.id) return;
    if (!form.name.trim()) {
      toast.error('Security guard name is required.');
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
      await visitorApi.updateSecurityGuard(guard.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        siteId: form.siteId,
        stationId: form.stationId || null,
        departmentId: form.departmentId || null,
        status: form.status,
      });
      toast.success('Security guard updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save security guard.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!guard?.id) return;
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
      await visitorApi.updateSecurityGuard(guard.id, {
        name: guard.name,
        email: guard.email,
        phone: guard.phone,
        siteId: guard.site_id,
        stationId: guard.station_id || null,
        departmentId: guard.department_id || null,
        status: guard.status,
        password,
      });
      toast.success('Password updated. The guard can sign in with the new password.');
      setPasswordModalOpen(false);
      setPasswordForm(emptyPasswordForm());
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDelete = async () => {
    if (!guard?.id) return;
    setDeleting(true);
    try {
      await visitorApi.deleteSecurityGuard(guard.id);
      toast.success('Security guard deleted.');
      navigate('/admin/security-guards');
    } catch (err) {
      toast.error(err?.message || 'Could not delete security guard.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Security Guard"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Security Guards', to: '/admin/security-guards' }, { label: 'Details' }]}
        />
        <div className="flex justify-center rounded-2xl border border-navy-100 bg-white px-5 py-16 shadow-sm">
          <Spinner size={28} />
        </div>
      </div>
    );
  }

  if (!guard) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Security guard not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Security Guards', to: '/admin/security-guards' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-navy-100 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-navy-600">This security guard could not be found or you do not have access.</p>
          <Link
            to="/admin/security-guards"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-700 hover:underline"
          >
            <ArrowLeft size={14} /> Back to security guards
          </Link>
        </div>
      </div>
    );
  }

  const loginLinked = Boolean(guard.user_id);
  const isActive = (guard.status || 'active') === 'active';
  const passwordActionLabel = loginLinked ? 'Change password' : 'Set password';

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={guard.name}
        subtitle={guard.email || 'No email on file'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Security Guards', to: '/admin/security-guards' },
          { label: guard.name },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/security-guards')}
              className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-700 shadow-sm hover:bg-navy-50 sm:px-3"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              type="button"
              onClick={openPasswordModal}
              disabled={!guard.email}
              className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-800 shadow-sm hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
            >
              <KeyRound size={14} />
              {passwordActionLabel}
            </button>
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 sm:px-3"
            >
              <Edit3 size={14} />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 sm:px-3"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      />

      <section className="overflow-hidden rounded-2xl border border-navy-100 bg-gradient-to-br from-white via-white to-cyan-50/50 shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-lg font-bold tracking-wide text-white shadow-md"
              aria-hidden="true"
            >
              {guardInitials(guard.name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-navy-900">{guard.name}</h2>
                <StatusBadge status={guard.status || 'active'} />
              </div>
              <p className="mt-1 text-sm text-navy-600">{guard.email || 'No email'}</p>
              {guard.phone ? (
                <p className="mt-0.5 text-sm text-navy-500">{guard.phone}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <ScopeChip tone="amber" icon={ShieldCheck}>Gate Security</ScopeChip>
                <ScopeChip icon={MonitorSmartphone}>Station portal</ScopeChip>
                <ScopeChip tone={loginLinked ? 'cyan' : 'slate'} icon={KeyRound}>
                  {loginLinked ? 'Login linked' : 'No login'}
                </ScopeChip>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:min-w-[220px]">
            <div className="rounded-xl border border-navy-100 bg-white px-3 py-2.5 text-center shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">Site</p>
              <p className="mt-1 truncate text-sm font-semibold text-navy-900">{guard.site_name || '—'}</p>
            </div>
            <div className="rounded-xl border border-navy-100 bg-white px-3 py-2.5 text-center shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">Gate</p>
              <p className="mt-1 truncate text-sm font-semibold text-navy-900">{guard.station_name || stationNames[0] || 'Site-wide'}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm">
            <div className="border-b border-navy-100 px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-navy-900">Contact & assignment</h3>
              <p className="mt-0.5 text-xs text-navy-500">Organisation placement and portal login.</p>
            </div>
            <div className="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-5">
              <DetailItem icon={User} label="Full name" value={guard.name} />
              <DetailItem icon={Mail} label="Email" value={guard.email} />
              <DetailItem icon={Phone} label="Phone" value={guard.phone} />
              <DetailItem icon={Building2} label="Organisation" value={guard.organisation_name} />
              <DetailItem
                icon={MapPin}
                label="Site / branch"
                value={guard.site_name}
                action={guard.site_id ? (
                  <Link
                    to={`/admin/sites/${guard.site_id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline"
                  >
                    View site <ExternalLink size={12} aria-hidden="true" />
                  </Link>
                ) : null}
              />
              <DetailItem icon={Network} label="Department" value={guard.department_name} />
              <DetailItem
                icon={DoorOpen}
                label="Primary station"
                value={guard.station_name || 'Not set'}
                action={guard.station_id ? (
                  <Link
                    to={`/admin/stations/${guard.station_id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline"
                  >
                    View station <ExternalLink size={12} aria-hidden="true" />
                  </Link>
                ) : null}
              />
              <DetailItem
                icon={KeyRound}
                label="Portal login"
                value={loginLinked ? guard.email : 'Not linked — edit to set email'}
                action={guard.email ? (
                  <button
                    type="button"
                    onClick={openPasswordModal}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline"
                  >
                    <KeyRound size={12} aria-hidden="true" />
                    {passwordActionLabel}
                  </button>
                ) : null}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm">
            <div className="border-b border-navy-100 px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-navy-900">Gate scope</h3>
              <p className="mt-0.5 text-xs text-navy-500">Stations and buildings this officer can see at the gate.</p>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-navy-400">Stations / gates</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {stationNames.length ? stationNames.map((name) => (
                    <ScopeChip key={name}>{name}</ScopeChip>
                  )) : (
                    <ScopeChip tone="slate">Whole site (no gate filter)</ScopeChip>
                  )}
                </div>
              </div>
              {buildingNames.length ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-navy-400">Buildings</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {buildingNames.map((name) => (
                      <ScopeChip key={name} tone="amber">{name}</ScopeChip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-cyan-900">Station portal access</h3>
            <p className="mt-2 text-sm leading-relaxed text-cyan-950/80">
              This officer signs in to the <strong>Station</strong> portal with role <strong>Gate Security</strong>.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-cyan-950/80">
              <li>Gate check-in / check-out</li>
              <li>Expected arrivals & visitor logs</li>
              <li>Current occupancy at assigned gates</li>
            </ul>
            {!isActive ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                Status is inactive — portal login is disabled until reactivated.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-navy-100 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-navy-900">Portal login</h3>
            <p className="mt-1 text-sm text-navy-600">{guard.email || 'No email — add one via Edit before setting a password.'}</p>
            <LoadingButton
              size="md"
              variant="secondary"
              icon={KeyRound}
              loading={savingPassword}
              disabled={!guard.email}
              onClick={openPasswordModal}
              className="mt-3 w-full border-navy-200"
            >
              {passwordActionLabel}
            </LoadingButton>
          </div>

          <div className="rounded-2xl border border-navy-100 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-navy-900">Quick actions</h3>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-sm font-semibold text-navy-800 hover:bg-navy-50"
              >
                <Edit3 size={15} aria-hidden="true" />
                Edit details or gate
              </button>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Security Guard"
        subtitle="Organisation → Site + Station → Gate Security (Station portal access)"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-navy-200 px-3 py-2 text-sm font-medium text-navy-700"
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
            label="Organisation"
            name="organisationId"
            type="select"
            required
            value={form.organisationId}
            disabled
            onChange={() => {}}
            options={orgOptions}
            helpText="Organisation cannot be changed after create."
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
            type="email"
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
            helpText="Leave empty for site-wide gate access at this site."
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
        </div>
      </Modal>

      <Modal
        isOpen={passwordModalOpen}
        onClose={() => !savingPassword && setPasswordModalOpen(false)}
        title={passwordActionLabel}
        subtitle={`Station portal login for ${guard.email}`}
        size="sm"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={savingPassword}
              onClick={() => setPasswordModalOpen(false)}
              className="rounded-lg border border-navy-200 px-3 py-2 text-sm font-medium text-navy-700"
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
        isOpen={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete security guard?"
        message={`Remove ${guard.name} and revoke Station portal access.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
