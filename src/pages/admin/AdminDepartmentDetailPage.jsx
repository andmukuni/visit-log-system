import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  DoorClosed,
  Edit3,
  Network,
  Users,
} from 'lucide-react';
import {
  PageHeader,
  Modal,
  FormField,
  LoadingButton,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

const emptyForm = () => ({
  name: '',
  code: '',
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

export default function AdminDepartmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [department, setDepartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setDepartment(await visitorApi.getDepartment(id));
    } catch (err) {
      setDepartment(null);
      toast.error(err?.message || 'Unable to load department.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!department) return;
    setForm({
      name: department.name || '',
      code: department.code || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!department?.id) return;
    if (!form.name.trim()) {
      toast.error('Department name is required.');
      return;
    }
    setSaving(true);
    try {
      await visitorApi.updateDepartment(department.id, form);
      toast.success('Department updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save department.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Department"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Departments', to: '/admin/departments' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading department…
        </div>
      </div>
    );
  }

  if (!department) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Department not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Departments', to: '/admin/departments' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This department could not be found or you do not have access.</p>
          <Link
            to="/admin/departments"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to departments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={department.name}
        subtitle={department.code || 'No department code'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Departments', to: '/admin/departments' },
          { label: department.name },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/departments')}
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
            <h2 className="text-lg font-bold text-navy-900">{department.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{department.code || 'No code'}</p>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Belongs to</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Building2} label="Organisation" value={department.organisation_name} />
              <DetailItem icon={Network} label="Code" value={department.code} />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Usage</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem
                icon={DoorClosed}
                label="Offices"
                value={`${Number(department.office_count || 0)} office${Number(department.office_count || 0) === 1 ? '' : 's'}`}
              />
              <DetailItem
                icon={Users}
                label="Employees"
                value={`${Number(department.employee_count || 0)} employee${Number(department.employee_count || 0) === 1 ? '' : 's'}`}
              />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Department"
        subtitle="Update the department name and code."
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
            label="Department name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Human Resources"
          />
          <FormField
            label="Code"
            name="code"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            placeholder="HR"
          />
        </div>
      </Modal>
    </div>
  );
}
