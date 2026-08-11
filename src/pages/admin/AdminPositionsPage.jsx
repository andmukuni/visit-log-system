import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Briefcase,
  Download,
  Eye,
  Plus,
  Search,
  Edit3,
  Trash2,
  Users,
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
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';
import { useOrganisationPrerequisite } from '../../hooks/useOrganisationPrerequisite';
import OrganisationRequiredBanner from '../../components/admin/OrganisationRequiredBanner';

const TABS = [
  { id: 'all', label: 'All Positions' },
];

const emptyForm = () => ({
  name: '',
  code: '',
  status: 'active',
  organisationId: '',
});

function PositionsKpiRow({ kpis = {} }) {
  const items = [
    {
      key: 'total',
      primaryLabel: 'Total',
      secondaryLabel: 'Positions',
      icon: Briefcase,
      iconWrap: 'bg-sky-50 text-sky-500',
    },
    {
      key: 'active',
      primaryLabel: 'Active',
      secondaryLabel: 'In use',
      icon: Briefcase,
      iconWrap: 'bg-emerald-50 text-emerald-500',
    },
    {
      key: 'inactive',
      primaryLabel: 'Inactive',
      secondaryLabel: 'Archived',
      icon: Briefcase,
      iconWrap: 'bg-amber-50 text-amber-500',
    },
    {
      key: 'organisations',
      primaryLabel: 'Organisations',
      secondaryLabel: 'Covered',
      icon: Building2,
      iconWrap: 'bg-orange-50 text-orange-500',
    },
  ];

  return (
    <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4">
      {items.map(({ key, primaryLabel, secondaryLabel, icon: Icon, iconWrap }) => (
        <div
          key={key}
          className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm"
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none tabular-nums text-slate-900 sm:text-xl">
              {Number(kpis[key] ?? 0)}
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-tight text-gray-600 sm:text-xs">{primaryLabel}</p>
            <p className="mt-0.5 hidden text-xs leading-tight text-gray-400 sm:block">{secondaryLabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function exportPositionsCsv(rows) {
  const headers = ['Name', 'Code', 'Status', 'Organisation'];
  const lines = rows.map((row) => [
    row.name || '',
    row.code || '',
    row.status || '',
    row.organisation_name || '',
  ]);

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'positions.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminPositionsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const {
    organisations,
    hasOrganisation,
    hasActiveOrganisation,
    loading: orgLoading,
  } = useOrganisationPrerequisite();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const updateParams = useCallback((updates) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === '' || value == null) next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visitorApi.getPositions();
      setAllRows(Array.isArray(rows) ? rows : []);
      setKpis(rows?.stats || {
        total: rows?.length || 0,
        active: (rows || []).filter((r) => r.status === 'active').length,
        inactive: (rows || []).filter((r) => r.status !== 'active').length,
        organisations: new Set((rows || []).map((r) => r.organisation_id).filter(Boolean)).size,
      });
    } catch (err) {
      setAllRows([]);
      setKpis({});
      toast.error(err?.message || 'Unable to load positions.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        updateParams({ search: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) =>
      [row.name, row.code, row.status, row.organisation_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [allRows, search]);

  const total = filteredRows.length;
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const orgOptions = useMemo(
    () => organisations
      .filter((org) => org.status === 'active')
      .map((org) => ({ value: org.id, label: org.name })),
    [organisations],
  );

  const openPosition = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/positions/${row.id}`);
  }, [navigate]);

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first. Positions are created under an organisation.');
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm(),
      organisationId: orgOptions[0]?.value || '',
    });
    setModalOpen(true);
  };

  const openEdit = useCallback((position) => {
    setEditing(position);
    setForm({
      name: position.name || '',
      code: position.code || '',
      status: position.status || 'active',
      organisationId: position.organisation_id || '',
    });
    setModalOpen(true);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Position',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.code || '—'}</p>
        </div>
      ),
    },
    {
      key: 'organisation_name',
      label: 'Organisation',
      render: (value) => <span className="text-sm text-gray-700">{value || '—'}</span>,
    },
    {
      key: 'host_count',
      label: 'Hosts',
      render: (value) => Number(value || 0),
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Eye}
            label="View position"
            iconSize={16}
            onClick={(e) => {
              e.stopPropagation();
              openPosition(row);
            }}
          />
          <IconButton
            icon={Edit3}
            label="Edit position"
            iconSize={16}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete position"
            iconSize={16}
            className="text-rose-600 hover:bg-rose-50"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
          />
        </div>
      ),
    },
  ], [openEdit, openPosition]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Position name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await visitorApi.updatePosition(editing.id, {
          name: form.name,
          code: form.code,
          status: form.status,
        });
        toast.success('Position updated.');
      } else {
        await visitorApi.createPosition({
          name: form.name,
          code: form.code,
          status: form.status,
          organisationId: form.organisationId || undefined,
        });
        toast.success('Position created.');
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save position.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      const result = await visitorApi.deletePosition(deleteTarget.id);
      toast.success(result?.message || 'Position deleted.');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete position.');
    } finally {
      setDeleting(false);
    }
  };

  const pageActions = (
    <button
      type="button"
      onClick={openCreate}
      disabled={!canManageStructure || orgLoading}
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="hidden sm:inline">New Position</span>
      <span className="sm:hidden">New</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Positions"
        subtitle="Organisation → Position. Job titles and role labels used across the organisation."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Positions' }]}
        actions={pageActions}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Positions" />
      )}

      <PositionsKpiRow kpis={kpis} />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200">
          <div className="flex gap-0 overflow-x-auto px-4 pt-0.5 sm:px-5">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="relative shrink-0 whitespace-nowrap px-3 pb-2 pt-2 text-xs font-semibold text-navy-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#1a73e8] sm:px-4 sm:pb-2.5 sm:pt-2.5 sm:text-sm"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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
                placeholder="Search by position name, code or organisation..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
              />
            </label>

            <button
              type="button"
              onClick={() => exportPositionsCsv(filteredRows)}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm lg:self-center"
            >
              <Download size={14} aria-hidden="true" />
              Export
            </button>
          </div>
        </div>

        <DataTable
          embedded
          columns={columns}
          data={pageRows}
          loading={loading}
          emptyTitle={!canManageStructure ? 'No organisation yet' : 'No positions found.'}
          emptyDescription={
            !canManageStructure
              ? 'Create an organisation first. Positions are created under an organisation.'
              : 'Add a position under your organisation.'
          }
          onRowClick={openPosition}
          serverPagination
          page={page}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={(value) => updateParams({ page: value })}
          onPageSizeChange={(value) => updateParams({ pageSize: value, page: 1 })}
          pageSizeOptions={[7, 10, 25, 50]}
          pagination
        />
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Position' : 'New Position'}
        subtitle="Positions are created with an organisation — job titles like Manager, Officer, or Analyst."
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
              {editing ? 'Save changes' : 'Create position'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          {!editing && orgOptions.length > 1 && (
            <FormField
              label="Organisation"
              name="organisationId"
              type="select"
              required
              value={form.organisationId}
              onChange={(e) => setForm((prev) => ({ ...prev, organisationId: e.target.value }))}
              options={orgOptions}
            />
          )}
          {!editing && orgOptions.length === 1 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs font-medium text-gray-500">Organisation</p>
              <p className="mt-0.5 text-sm font-semibold text-navy-900">{orgOptions[0].label}</p>
            </div>
          )}
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
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete position?"
        confirmLabel="Delete"
        variant="danger"
        message={
          deleteTarget
            ? (
              Number(deleteTarget.host_count || 0) > 0
                ? `Delete “${deleteTarget.name}”? It will be cleared from ${deleteTarget.host_count} host${Number(deleteTarget.host_count) === 1 ? '' : 's'}.`
                : `Delete “${deleteTarget.name}”? This cannot be undone.`
            )
            : 'Are you sure you want to proceed?'
        }
      />
    </div>
  );
}
