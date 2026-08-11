import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  DoorOpen,
  Edit3,
  KeyRound,
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

const emptyForm = () => ({
  name: '',
  email: '',
  phone: '',
  status: 'active',
});

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

export default function AdminSecurityGuardDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [guard, setGuard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setGuard(await visitorApi.getSecurityGuard(id));
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

  const openEdit = () => {
    if (!guard) return;
    setForm({
      name: guard.name || '',
      email: guard.email || '',
      phone: guard.phone || '',
      status: guard.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!guard?.id) return;
    if (!form.name.trim()) {
      toast.error('Security guard name is required.');
      return;
    }
    if (!form.email.trim()) {
      toast.error('Email is required.');
      return;
    }
    setSaving(true);
    try {
      await visitorApi.updateSecurityGuard(guard.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
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

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Security Guard"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Security Guards', to: '/admin/security-guards' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading security guard…
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
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This security guard could not be found or you do not have access.</p>
          <Link
            to="/admin/security-guards"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to security guards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={guard.name}
        subtitle={guard.email || 'No email'}
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
              <h2 className="text-lg font-bold text-navy-900">{guard.name}</h2>
              <StatusBadge status={guard.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{guard.email || 'No email'}</p>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Contact</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={User} label="Name" value={guard.name} />
              <DetailItem icon={Mail} label="Email" value={guard.email} />
              <DetailItem icon={Phone} label="Phone" value={guard.phone} />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Assignment</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Building2} label="Organisation" value={guard.organisation_name} />
              <DetailItem icon={MapPin} label="Site" value={guard.site_name} />
              <DetailItem icon={DoorOpen} label="Station" value={guard.station_name} />
              <DetailItem icon={Network} label="Department" value={guard.department_name} />
              <DetailItem
                icon={KeyRound}
                label="Portal login"
                value={guard.user_id ? `Linked (${guard.user_id})` : 'Not linked'}
              />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Security Guard"
        subtitle="Update contact details and status. Change site or station from the security guards list."
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
            label="Name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="John Smith"
          />
          <FormField
            label="Email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="john@example.com"
          />
          <FormField
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+260 ..."
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
