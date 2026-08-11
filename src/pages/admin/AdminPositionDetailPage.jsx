import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Edit3,
  Trash2,
  Users,
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

const emptyForm = () => ({
  name: '',
  code: '',
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

export default function AdminPositionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setPosition(await visitorApi.getPosition(id));
    } catch (err) {
      setPosition(null);
      toast.error(err?.message || 'Unable to load position.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!position) return;
    setForm({
      name: position.name || '',
      code: position.code || '',
      status: position.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!position?.id) return;
    if (!form.name.trim()) {
      toast.error('Position name is required.');
      return;
    }
    setSaving(true);
    try {
      await visitorApi.updatePosition(position.id, {
        name: form.name,
        code: form.code,
        status: form.status,
      });
      toast.success('Position updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save position.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!position?.id) return;
    setDeleting(true);
    try {
      const result = await visitorApi.deletePosition(position.id);
      toast.success(result?.message || 'Position deleted.');
      navigate('/admin/positions');
    } catch (err) {
      toast.error(err?.message || 'Could not delete position.');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Position"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Positions', to: '/admin/positions' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading position…
        </div>
      </div>
    );
  }

  if (!position) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Position not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Positions', to: '/admin/positions' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This position could not be found or you do not have access.</p>
          <Link
            to="/admin/positions"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to positions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={position.name}
        subtitle={position.code || 'No position code'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Positions', to: '/admin/positions' },
          { label: position.name },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/positions')}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 sm:px-3"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 sm:px-3"
            >
              <Trash2 size={14} />
              Delete
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
              <h2 className="text-lg font-bold text-navy-900">{position.name}</h2>
              <StatusBadge status={position.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{position.code || 'No code'}</p>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Belongs to</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Building2} label="Organisation" value={position.organisation_name} />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Usage</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Briefcase} label="Status" value={position.status === 'inactive' ? 'Inactive' : 'Active'} />
              <DetailItem
                icon={Users}
                label="Assigned hosts"
                value={`${Number(position.host_count || 0)} host${Number(position.host_count || 0) === 1 ? '' : 's'}`}
              />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Position"
        subtitle="Update the job title used when assigning hosts."
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
            label="Position name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Senior Manager"
          />
          <FormField
            label="Code"
            name="code"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            placeholder="SM"
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

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete position?"
        confirmLabel="Delete"
        variant="danger"
        message={
          Number(position.host_count || 0) > 0
            ? `Delete “${position.name}”? It will be cleared from ${position.host_count} host${Number(position.host_count) === 1 ? '' : 's'}.`
            : `Delete “${position.name}”? This cannot be undone.`
        }
      />
    </div>
  );
}
