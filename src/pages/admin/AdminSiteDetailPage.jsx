import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  DoorOpen,
  Edit3,
  MapPin,
  Users,
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

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const emptyForm = () => ({
  name: '',
  code: '',
  address: '',
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

export default function AdminSiteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setSite(await visitorApi.getSite(id));
    } catch (err) {
      setSite(null);
      toast.error(err?.message || 'Unable to load site.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!site) return;
    setForm({
      name: site.name || '',
      code: site.code || '',
      address: site.address || '',
      status: site.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!site?.id) return;
    if (!form.name.trim()) {
      toast.error('Site name is required.');
      return;
    }
    setSaving(true);
    try {
      await visitorApi.updateSite(site.id, form);
      toast.success('Site updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save site.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Site"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Sites', to: '/admin/sites' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading site…
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Site not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Sites', to: '/admin/sites' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This site could not be found or you do not have access.</p>
          <Link
            to="/admin/sites"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to sites
          </Link>
        </div>
      </div>
    );
  }

  const stationCount = Number(site.station_count || 0);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={site.name}
        subtitle={site.code || 'No site code'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Sites', to: '/admin/sites' },
          { label: site.name },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/sites')}
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
              <h2 className="text-lg font-bold text-navy-900">{site.name}</h2>
              <StatusBadge status={site.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{site.code || 'No code'}</p>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Location</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={MapPin} label="Address" value={site.address} />
              <DetailItem icon={Building2} label="Organisation" value={site.organisation_name} />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Structure</h3>
            <div className="mt-2.5 grid gap-2.5">
              <div className="flex gap-3">
                <DoorOpen size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Stations</p>
                  <p className="mt-1 text-sm font-semibold text-navy-900">
                    {stationCount > 0 ? (
                      <Link to="/admin/stations" className="text-[#1a73e8] hover:underline">
                        {stationCount} station{stationCount === 1 ? '' : 's'}
                      </Link>
                    ) : (
                      '0 stations'
                    )}
                  </p>
                </div>
              </div>
              <DetailItem
                icon={Building2}
                label="Buildings"
                value={`${Number(site.building_count || 0)} building${Number(site.building_count || 0) === 1 ? '' : 's'}`}
              />
              <DetailItem
                icon={Building2}
                label="Offices"
                value={`${Number(site.office_count || 0)} office${Number(site.office_count || 0) === 1 ? '' : 's'}`}
              />
              <DetailItem
                icon={Users}
                label="Employees"
                value={`${Number(site.employee_count || 0)} employee${Number(site.employee_count || 0) === 1 ? '' : 's'}`}
              />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Site"
        subtitle="Update site identity and location details."
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
            label="Site name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Head Office"
          />
          <FormField
            label="Code"
            name="code"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            placeholder="HQ"
          />
          <FormField
            label="Address"
            name="address"
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            placeholder="123 Main Street"
          />
          <FormField
            label="Status"
            name="status"
            type="select"
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            options={STATUS_OPTIONS}
          />
        </div>
      </Modal>
    </div>
  );
}
