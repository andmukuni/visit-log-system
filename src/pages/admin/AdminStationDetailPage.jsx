import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  DoorOpen,
  Edit3,
  MapPin,
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
import { STATION_TYPES } from '../../../shared/orgHierarchy.js';

const emptyForm = () => ({
  name: '',
  type: 'reception',
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

function stationTypeLabel(type) {
  return STATION_TYPES.find((item) => item.value === type)?.label || type || '—';
}

export default function AdminStationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [station, setStation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setStation(await visitorApi.getStation(id));
    } catch (err) {
      setStation(null);
      toast.error(err?.message || 'Unable to load station.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!station) return;
    setForm({
      name: station.name || '',
      type: station.type || 'reception',
      status: station.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!station?.id) return;
    if (!form.name.trim()) {
      toast.error('Station name is required.');
      return;
    }
    setSaving(true);
    try {
      await visitorApi.updateStation(station.id, form);
      toast.success('Station updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save station.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Station"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Stations', to: '/admin/stations' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading station…
        </div>
      </div>
    );
  }

  if (!station) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Station not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Stations', to: '/admin/stations' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This station could not be found or you do not have access.</p>
          <Link
            to="/admin/stations"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to stations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={station.name}
        subtitle={stationTypeLabel(station.type)}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Stations', to: '/admin/stations' },
          { label: station.name },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/stations')}
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
              <h2 className="text-lg font-bold text-navy-900">{station.name}</h2>
              <StatusBadge status={station.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{stationTypeLabel(station.type)}</p>
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Identity</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={DoorOpen} label="Type" value={stationTypeLabel(station.type)} />
              <DetailItem
                icon={DoorOpen}
                label="Status"
                value={station.status === 'inactive' ? 'Inactive' : 'Active'}
              />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Location</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={MapPin} label="Site" value={station.site_name} />
              <DetailItem icon={Building2} label="Organisation" value={station.organisation_name} />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Station"
        subtitle="Update station name, type, and status."
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
            label="Station name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Main Reception"
          />
          <FormField
            label="Type"
            name="type"
            type="select"
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
            options={STATION_TYPES}
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
