import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Edit3,
  KeyRound,
  Layers3,
  Mail,
  MapPin,
  Network,
  Phone,
  User,
} from 'lucide-react';
import {
  PageHeader,
  StatusBadge,
  Modal,
  FormField,
  LoadingButton,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';
import { zonesForOrg } from '../../utils/adminStructureDefaults';

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

function DetailItem({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-semibold text-navy-900 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function AdminReceptionistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [receptionist, setReceptionist] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [row, deptRows, siteRows, zoneRows] = await Promise.all([
        visitorApi.getReceptionist(id),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getZones(),
      ]);
      setReceptionist(row || null);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setZones(Array.isArray(zoneRows) ? zoneRows : []);
    } catch (err) {
      setReceptionist(null);
      toast.error(err?.message || 'Unable to load receptionist.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const orgOptions = useMemo(() => {
    if (!receptionist?.organisation_id) return [];
    return [{
      value: receptionist.organisation_id,
      label: receptionist.organisation_name || 'Organisation',
    }];
  }, [receptionist]);

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

  const openEdit = () => {
    if (!receptionist) return;
    setForm({
      organisationId: receptionist.organisation_id || '',
      name: receptionist.name || '',
      email: receptionist.email || '',
      phone: receptionist.phone || '',
      siteId: receptionist.site_id || '',
      zoneIds: Array.isArray(receptionist.zone_ids) && receptionist.zone_ids.length
        ? receptionist.zone_ids
        : (receptionist.zone_id ? [receptionist.zone_id] : []),
      departmentId: receptionist.department_id || '',
      status: receptionist.status || 'active',
      password: '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!receptionist?.id) return;
    if (!form.name.trim()) {
      toast.error('Receptionist name is required.');
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
      await visitorApi.updateReceptionist(receptionist.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        siteId: form.siteId,
        zoneIds: form.zoneIds,
        departmentId: form.departmentId || null,
        status: form.status,
        password: form.password || undefined,
      });
      toast.success('Receptionist updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save receptionist.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Receptionist"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Receptionists', to: '/admin/receptionists' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading receptionist…
        </div>
      </div>
    );
  }

  if (!receptionist) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Receptionist not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Receptionists', to: '/admin/receptionists' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This receptionist could not be found or you do not have access.</p>
          <Link
            to="/admin/receptionists"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to receptionists
          </Link>
        </div>
      </div>
    );
  }

  const zoneDisplay = receptionist.zone_names || receptionist.zone_name;

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={receptionist.name}
        subtitle={receptionist.email || 'No email'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Receptionists', to: '/admin/receptionists' },
          { label: receptionist.name },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/receptionists')}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 sm:px-3"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 sm:px-3"
            >
              <Edit3 size={14} />
              Edit
            </button>
          </div>
        )}
      />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">{receptionist.name}</h2>
              <StatusBadge status={receptionist.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{receptionist.email || 'No email'}</p>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Contact</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={User} label="Name" value={receptionist.name} />
              <DetailItem icon={Mail} label="Email" value={receptionist.email} />
              <DetailItem icon={Phone} label="Phone" value={receptionist.phone} />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Assignment</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Building2} label="Organisation" value={receptionist.organisation_name} />
              <DetailItem icon={MapPin} label="Site" value={receptionist.site_name} />
              <DetailItem icon={Layers3} label="Zone(s)" value={zoneDisplay} />
              <DetailItem icon={Network} label="Department" value={receptionist.department_name} />
              <DetailItem
                icon={KeyRound}
                label="Portal login"
                value={receptionist.user_id ? `Linked (${receptionist.user_id})` : 'Not linked'}
              />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Receptionist"
        subtitle="Organisation → Site + Zones → Receptionist (Reception portal access)"
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
            label="Reset password"
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Leave blank to keep current"
            helpText="Leave blank to keep the current password."
          />
        </div>
      </Modal>
    </div>
  );
}
