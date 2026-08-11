import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  DoorClosed,
  Edit3,
  KeyRound,
  Mail,
  MapPin,
  Network,
  Phone,
  UserCheck,
} from 'lucide-react';
import {
  PageHeader,
  StatusBadge,
  Modal,
  FormField,
  LoadingButton,
  ConfirmDialog,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

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

function formatHostDisplayName(row) {
  const title = String(row?.title || '').trim();
  const name = String(row?.name || '').trim();
  if (title && name) return `${title} ${name}`;
  return name || '—';
}

function DetailItem({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm ring-1 ring-gray-100">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-semibold text-navy-900 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function AdminHostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [host, setHost] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [row, deptRows, siteRows, officeRows] = await Promise.all([
        visitorApi.getHost(id),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getOffices(),
      ]);
      setHost(row || null);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setOffices(Array.isArray(officeRows) ? officeRows : []);
    } catch (err) {
      setHost(null);
      toast.error(err?.message || 'Unable to load host.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentOptions = useMemo(
    () => departments
      .filter((d) => !form?.organisationId || d.organisation_id === form.organisationId)
      .map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
    [departments, form?.organisationId],
  );

  const siteOptions = useMemo(
    () => sites
      .filter((s) => s.status !== 'inactive')
      .filter((s) => !form?.organisationId || s.organisation_id === form.organisationId)
      .map((s) => ({ value: s.id, label: s.name })),
    [sites, form?.organisationId],
  );

  const officeOptions = useMemo(() => {
    if (!form) return [{ value: '', label: 'No office (optional)' }];
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
  }, [offices, form]);

  const openEdit = () => {
    if (!host) return;
    setForm({
      organisationId: host.organisation_id || '',
      title: host.title || '',
      name: host.name || '',
      email: host.email || '',
      phone: host.phone || '',
      departmentId: host.department_id || '',
      siteId: host.site_id || '',
      officeId: host.office_id || '',
      status: host.status || 'active',
      availability: host.availability === 'unavailable' ? 'unavailable' : 'available',
      portalRole: host.portal_role || 'host',
      password: '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!host?.id || !form) return;
    if (!form.name.trim()) {
      toast.error('Host name is required.');
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
      await visitorApi.updateHost(host.id, {
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
      });
      toast.success(form.password ? 'Host updated and password changed.' : 'Host updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save host.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!host?.id) return;
    setSendingReset(true);
    try {
      const result = await visitorApi.sendHostPasswordReset(host.id);
      toast.success(result?.message || `Password reset email sent to ${host.email}.`);
      setResetOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not send password reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  const displayName = formatHostDisplayName(host);
  const roleLabel = host?.portal_role_label
    || PORTAL_ROLE_OPTIONS.find((option) => option.value === host?.portal_role)?.label
    || 'General Employee';

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Host"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Hosts', to: '/admin/hosts' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading host…
        </div>
      </div>
    );
  }

  if (!host) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Host not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Hosts', to: '/admin/hosts' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This host could not be found or you do not have access.</p>
          <Link
            to="/admin/hosts"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to hosts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={displayName}
        subtitle={host.email || 'No email on file'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Hosts', to: '/admin/hosts' },
          { label: displayName },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/hosts')}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 sm:px-3"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              type="button"
              disabled={!host.email}
              onClick={() => setResetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-800 shadow-sm hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
            >
              <Mail size={14} />
              Password reset
            </button>
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 sm:px-3"
            >
              <Edit3 size={14} />
              Edit host
            </button>
          </div>
        )}
      />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">{displayName}</h2>
              <StatusBadge status={host.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{host.email || 'No email'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                host.availability === 'unavailable'
                  ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
                  : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${host.availability === 'unavailable' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                aria-hidden="true"
              />
              {host.availability === 'unavailable' ? 'Not available' : 'Available'}
            </span>
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-600/15">
              {roleLabel}
            </span>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Contact</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Mail} label="Email" value={host.email} />
              <DetailItem icon={Phone} label="Phone" value={host.phone} />
              <DetailItem
                icon={UserCheck}
                label="Portal login"
                value={host.user_id ? 'Enabled' : host.email ? 'Email on file' : 'Not linked'}
              />
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Placement</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Building2} label="Organisation" value={host.organisation_name} />
              <DetailItem icon={Network} label="Department" value={host.department_name} />
              <DetailItem icon={MapPin} label="Site / Branch" value={host.site_name} />
              <DetailItem
                icon={DoorClosed}
                label="Office"
                value={host.office_number ? `#${host.office_number}${host.office_name ? ` · ${host.office_name}` : ''}` : null}
              />
            </div>
          </section>

          <section className="lg:col-span-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Portal</h3>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
              <DetailItem icon={UserCheck} label="Role" value={roleLabel} />
              <DetailItem
                icon={KeyRound}
                label="Availability"
                value={host.availability === 'unavailable' ? 'Not available' : 'Available'}
              />
              <DetailItem icon={UserCheck} label="Status" value={host.status === 'inactive' ? 'Inactive' : 'Active'} />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Host"
        subtitle="Organisation → Host → Department + Site (+ optional Office)"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              Save changes
            </LoadingButton>
          </div>
        )}
      >
        {form ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs font-medium text-gray-500">Organisation</p>
              <p className="mt-0.5 text-sm font-semibold text-navy-900">{host.organisation_name || '—'}</p>
            </div>
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
              label="Change password"
              name="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Leave blank to keep current"
              helpText="Set a new password for the host login, or leave blank. You can also email a reset link from this page."
            />
            {host.email ? (
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setResetOpen(true);
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-navy-200 px-3 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50"
              >
                <KeyRound size={16} /> Send password reset email
              </button>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={resetOpen}
        onClose={() => !sendingReset && setResetOpen(false)}
        onConfirm={handleSendPasswordReset}
        loading={sendingReset}
        title="Send password reset?"
        message={`Email a password reset link to ${host.name} (${host.email}). The link expires in 24 hours.`}
        confirmLabel="Send email"
      />
    </div>
  );
}
