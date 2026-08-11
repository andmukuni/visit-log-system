import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Car,
  ChevronDown,
  Edit3,
  Filter,
  Palette,
  Plus,
  Search,
  Trash2,
  User,
  X,
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
import { VEHICLE_STATUS_OPTIONS } from '../../components/logbook/filterOptions';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { platformApi } from '../../utils/visitorApi';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...VEHICLE_STATUS_OPTIONS.filter((option) => option.value),
  { value: 'arrived_at_gate', label: 'Arrived at gate' },
  { value: 'departed', label: 'Departed' },
  { value: 'exited', label: 'Exited' },
];

const FORM_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.value);

const emptyForm = () => ({
  organisation_id: '',
  plate_number: '',
  vehicle_type: '',
  make: '',
  colour: '',
  driver_name: '',
  status: 'on_site',
});

function FilterDropdown({ label, icon: Icon, value, onChange, options }) {
  const activeLabel = options.find((option) => option.value === value)?.label || label;
  const isActive = Boolean(value);

  return (
    <label className="relative inline-flex shrink-0">
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
          isActive
            ? 'border-[#1a73e8]/30 bg-sky-50 text-[#1a73e8]'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" />}
        <span>{activeLabel}</span>
        <ChevronDown size={14} className="text-gray-400" aria-hidden="true" />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value || 'all'} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <>
      <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0 pb-2">
        <p className="text-xs font-medium leading-none text-gray-500">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-snug text-navy-900">
          {value || '—'}
        </p>
      </div>
    </>
  );
}

function VehicleDetailSidebar({ vehicle, onClose, onEdit, onDelete }) {
  if (!vehicle) return null;

  return (
    <aside className="hidden w-full shrink-0 flex-col border-t border-gray-200 bg-white lg:flex lg:w-[320px] lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy-900">{vehicle.plate_number}</p>
          <p className="mt-0.5 text-xs text-gray-500">{vehicle.organisation_name || 'No organisation'}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close details"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        <StatusBadge status={vehicle.status || 'on_site'} />

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Vehicle
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={Car} label="Type" value={vehicle.vehicle_type} />
            <DetailRow icon={Car} label="Make" value={vehicle.make} />
            <DetailRow icon={Palette} label="Colour" value={vehicle.colour} />
            <DetailRow icon={User} label="Driver" value={vehicle.driver_name} />
          </div>
        </section>

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Timeline
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={Building2} label="Organisation" value={vehicle.organisation_name} />
            <DetailRow icon={Car} label="Entered" value={vehicle.entered_at ? formatDateTime(vehicle.entered_at) : '—'} />
            <DetailRow icon={Car} label="Exited" value={vehicle.exited_at ? formatDateTime(vehicle.exited_at) : '—'} />
            <DetailRow icon={Car} label="Registered" value={formatDateTime(vehicle.created_at)} />
          </div>
        </section>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => onEdit?.(vehicle)}
          aria-label="Edit vehicle"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#1a73e8] bg-white text-[#1a73e8] transition-colors hover:bg-sky-50"
        >
          <Edit3 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(vehicle)}
          aria-label="Delete vehicle"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default function PlatformVehiclesPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [organisations, setOrganisations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [vehicleRows, orgRows] = await Promise.all([
        platformApi.getVehicles({ ...params, limit: 200 }),
        platformApi.getOrganisations(),
      ]);
      setRows(Array.isArray(vehicleRows) ? vehicleRows : []);
      setOrganisations(Array.isArray(orgRows) ? orgRows : []);
    } catch (err) {
      setRows([]);
      toast.error(err?.message || 'Unable to load vehicles.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.plate_number, row.driver_name, row.make, row.colour, row.organisation_name, row.vehicle_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q)));
  }, [rows, searchInput]);

  useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((row) => row.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [rows, selected]);

  const organisationOptions = useMemo(
    () => organisations.map((org) => ({ value: org.id, label: org.name })),
    [organisations],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      organisation_id: organisations[0]?.id || '',
    });
    setModalOpen(true);
  };

  const openEdit = (vehicle) => {
    setEditing(vehicle);
    setForm({
      organisation_id: vehicle.organisation_id || '',
      plate_number: vehicle.plate_number || '',
      vehicle_type: vehicle.vehicle_type || '',
      make: vehicle.make || '',
      colour: vehicle.colour || '',
      driver_name: vehicle.driver_name || '',
      status: vehicle.status || 'on_site',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.organisation_id) {
      toast.error('Organisation is required.');
      return;
    }
    if (!form.plate_number.trim()) {
      toast.error('Plate number is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await platformApi.updateVehicle(editing.id, form);
        toast.success('Vehicle updated.');
      } else {
        await platformApi.createVehicle(form);
        toast.success('Vehicle created.');
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save vehicle.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await platformApi.deleteVehicle(deleteTarget.id);
      toast.success('Vehicle deleted.');
      if (selected?.id === deleteTarget.id) {
        setSelected(null);
        setMobileDetailOpen(false);
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete vehicle.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (window.innerWidth < 1024) setMobileDetailOpen(true);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'plate_number',
      label: 'Plate',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.plate_number}</p>
          <p className="text-xs text-gray-500">{row.vehicle_type || '—'}</p>
        </div>
      ),
    },
    {
      key: 'make',
      label: 'Make',
      render: (value, row) => (
        <span className="text-gray-700">{value || '—'}{row.colour ? ` · ${row.colour}` : ''}</span>
      ),
    },
    {
      key: 'driver_name',
      label: 'Driver',
      render: (value) => <span className="text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'organisation_name',
      label: 'Organisation',
      render: (value) => <span className="text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'on_site'} />,
    },
    {
      key: 'entered_at',
      label: 'Entered',
      render: (_, row) => (
        <span className="text-sm text-gray-600">
          {row.entered_at ? formatDateTime(row.entered_at) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Edit3}
            label="Edit vehicle"
            iconSize={16}
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete vehicle"
            iconSize={16}
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
          />
        </div>
      ),
    },
  ], []);

  const pageActions = (
    <button
      type="button"
      onClick={openCreate}
      disabled={!organisations.length}
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="hidden sm:inline">New Vehicle</span>
      <span className="sm:hidden">New</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Vehicles"
        subtitle="Platform-wide vehicle register across all organisations"
        iconKey="vehicles"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Vehicles' }]}
        actions={pageActions}
      />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="border-b border-gray-200 px-4 py-2 sm:px-5 sm:py-2.5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <label className="relative block min-w-0 flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search plate, driver, make, colour, organisation…"
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                  />
                </label>
                <FilterDropdown
                  label="Status"
                  icon={Filter}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>

            <DataTable
              embedded
              columns={columns}
              data={filteredRows}
              loading={loading}
              emptyTitle="No vehicles found."
              emptyDescription="Register a vehicle or adjust your filters."
              onRowClick={handleSelect}
              activeRowId={selected?.id}
              pagination
              pageSize={10}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>

          {selected && (
            <VehicleDetailSidebar
              vehicle={selected}
              onClose={() => setSelected(null)}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          )}
        </div>
      </div>

      {mobileDetailOpen && selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy-900">{selected.plate_number}</p>
              <p className="text-xs text-gray-500">{selected.organisation_name || 'Vehicle details'}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileDetailOpen(false)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <StatusBadge status={selected.status || 'on_site'} />
            <div className="mt-4 grid grid-cols-[16px_1fr] gap-x-3">
              <DetailRow icon={Car} label="Type" value={selected.vehicle_type} />
              <DetailRow icon={Car} label="Make" value={selected.make} />
              <DetailRow icon={Palette} label="Colour" value={selected.colour} />
              <DetailRow icon={User} label="Driver" value={selected.driver_name} />
              <DetailRow icon={Building2} label="Organisation" value={selected.organisation_name} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4">
            <button
              type="button"
              onClick={() => openEdit(selected)}
              aria-label="Edit vehicle"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#1a73e8] text-[#1a73e8]"
            >
              <Edit3 size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(selected)}
              aria-label="Delete vehicle"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 text-red-600"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Vehicle' : 'New Vehicle'}
        subtitle="Platform-wide vehicle records are linked to a tenant organisation."
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              {editing ? 'Save changes' : 'Create vehicle'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Organisation"
            name="organisation_id"
            type="select"
            required
            value={form.organisation_id}
            onChange={(e) => setForm((prev) => ({ ...prev, organisation_id: e.target.value }))}
            options={[
              { value: '', label: 'Select organisation…' },
              ...organisationOptions,
            ]}
          />
          <FormField
            label="Plate number"
            name="plate_number"
            required
            value={form.plate_number}
            onChange={(e) => setForm((prev) => ({ ...prev, plate_number: e.target.value.toUpperCase() }))}
            placeholder="ABC 1234"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="Vehicle type"
              name="vehicle_type"
              value={form.vehicle_type}
              onChange={(e) => setForm((prev) => ({ ...prev, vehicle_type: e.target.value }))}
              placeholder="Car, truck…"
            />
            <FormField
              label="Make"
              name="make"
              value={form.make}
              onChange={(e) => setForm((prev) => ({ ...prev, make: e.target.value }))}
              placeholder="Toyota"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="Colour"
              name="colour"
              value={form.colour}
              onChange={(e) => setForm((prev) => ({ ...prev, colour: e.target.value }))}
              placeholder="White"
            />
            <FormField
              label="Driver name"
              name="driver_name"
              value={form.driver_name}
              onChange={(e) => setForm((prev) => ({ ...prev, driver_name: e.target.value }))}
              placeholder="John Banda"
            />
          </div>
          <FormField
            label="Status"
            name="status"
            type="select"
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            options={FORM_STATUS_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        message={
          deleteTarget
            ? `Delete "${deleteTarget.plate_number}"? Vehicles currently on site must be checked out before deletion.`
            : ''
        }
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
