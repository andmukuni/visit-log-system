import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  Edit3,
  Filter,
  Globe2,
  MapPin,
  Network,
  Plus,
  Search,
  Trash2,
  Users,
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
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { platformApi } from '../../utils/visitorApi';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const emptyForm = () => ({
  name: '',
  slug: '',
  timezone: 'Africa/Lusaka',
  status: 'active',
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

function OrganisationDetailSidebar({ organisation, onClose, onEdit, onDelete }) {
  if (!organisation) return null;

  return (
    <aside className="hidden w-full shrink-0 flex-col border-t border-gray-200 bg-white lg:flex lg:w-[320px] lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy-900">{organisation.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{organisation.slug || 'No slug'}</p>
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
        <StatusBadge status={organisation.status || 'active'} />

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Company
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={Globe2} label="Timezone" value={organisation.timezone} />
            <DetailRow icon={Building2} label="Slug" value={organisation.slug} />
            <DetailRow icon={Globe2} label="Created" value={formatDateTime(organisation.created_at)} />
          </div>
        </section>

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Subscription
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={Building2} label="Plan" value={organisation.plan_name || 'None'} />
            <DetailRow icon={Globe2} label="Subscription status" value={organisation.subscription_status || '—'} />
          </div>
        </section>

        <section className="mt-4 sm:mt-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
            Structure
          </h3>
          <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-x-3 sm:mt-2">
            <DetailRow icon={MapPin} label="Sites" value={String(organisation.site_count ?? 0)} />
            <DetailRow icon={Building2} label="Buildings" value={String(organisation.building_count ?? 0)} />
            <DetailRow icon={Network} label="Departments" value={String(organisation.department_count ?? 0)} />
            <DetailRow icon={Users} label="Employees" value={String(organisation.employee_count ?? 0)} />
            <DetailRow icon={Users} label="Users" value={String(organisation.user_count ?? 0)} />
          </div>
        </section>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => onEdit?.(organisation)}
          title="Edit organisation"
          aria-label="Edit organisation"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#1a73e8] bg-white text-[#1a73e8] transition-colors hover:bg-sky-50"
        >
          <Edit3 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(organisation)}
          title="Delete organisation"
          aria-label="Delete organisation"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default function PlatformOrganisationsPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
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
      const data = await platformApi.getOrganisations();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      toast.error(err?.message || 'Unable to load organisations.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((row) => row.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [rows, selected]);

  const filteredRows = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!q) return true;
      return [row.name, row.slug, row.plan_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [rows, searchInput, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (organisation) => {
    setEditing(organisation);
    setForm({
      name: organisation.name || '',
      slug: organisation.slug || '',
      timezone: organisation.timezone || 'Africa/Lusaka',
      status: organisation.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Organisation name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await platformApi.updateOrganisation(editing.id, form);
        toast.success('Organisation updated.');
      } else {
        await platformApi.createOrganisation(form);
        toast.success('Organisation created.');
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save organisation.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await platformApi.deleteOrganisation(deleteTarget.id);
      toast.success('Organisation deleted.');
      if (selected?.id === deleteTarget.id) {
        setSelected(null);
        setMobileDetailOpen(false);
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete organisation.');
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
      key: 'name',
      label: 'Organisation',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.slug || '—'}</p>
        </div>
      ),
    },
    {
      key: 'plan_name',
      label: 'Plan',
      render: (value) => <span className="text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'site_count',
      label: 'Sites',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'user_count',
      label: 'Users',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => (
        <span className="text-sm text-gray-600">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Edit3}
            label="Edit organisation"
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
            label="Delete organisation"
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
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 sm:px-3"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="hidden sm:inline">New Organisation</span>
      <span className="sm:hidden">New</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Organisations"
        subtitle="Manage tenant organisations on the platform"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Organisations' }]}
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
                    placeholder="Search by name, slug or plan..."
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
              emptyTitle="No organisations found."
              emptyDescription="Create a tenant organisation or adjust your filters."
              onRowClick={handleSelect}
              activeRowId={selected?.id}
              pagination
              pageSize={10}
              pageSizeOptions={[10, 25, 50]}
            />
          </div>

          {selected && (
            <OrganisationDetailSidebar
              organisation={selected}
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
              <p className="truncate font-semibold text-navy-900">{selected.name}</p>
              <p className="text-xs text-gray-500">{selected.slug || 'Organisation details'}</p>
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
            <StatusBadge status={selected.status || 'active'} />
            <div className="mt-4 grid grid-cols-[16px_1fr] gap-x-3">
              <DetailRow icon={Globe2} label="Timezone" value={selected.timezone} />
              <DetailRow icon={Building2} label="Plan" value={selected.plan_name || 'None'} />
              <DetailRow icon={MapPin} label="Sites" value={String(selected.site_count ?? 0)} />
              <DetailRow icon={Users} label="Users" value={String(selected.user_count ?? 0)} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4">
            <button
              type="button"
              onClick={() => openEdit(selected)}
              title="Edit organisation"
              aria-label="Edit organisation"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#1a73e8] text-[#1a73e8]"
            >
              <Edit3 size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(selected)}
              title="Delete organisation"
              aria-label="Delete organisation"
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
        title={editing ? 'Edit Organisation' : 'New Organisation'}
        subtitle="Platform tenants are created here before sites, users and subscriptions are configured."
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
              {editing ? 'Save changes' : 'Create organisation'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Organisation name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Wonderful Group"
          />
          <FormField
            label="Slug"
            name="slug"
            value={form.slug}
            onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
            placeholder="wonderful-group"
            helpText="URL-safe identifier. Leave blank to generate from the name."
          />
          <FormField
            label="Timezone"
            name="timezone"
            value={form.timezone}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
            placeholder="Africa/Lusaka"
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
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete organisation"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This cannot be undone. Organisations with sites, users, or visits must be suspended instead.`
            : ''
        }
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
