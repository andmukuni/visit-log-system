import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Building2,
  Download,
  Eye,
  Network,
  Plus,
  Search,
  Users,
  DoorClosed,
  X,
  Edit3,
} from 'lucide-react';
import {
  PageHeader,
  DataTable,
  IconButton,
  Modal,
  FormField,
  LoadingButton,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';
import { useOrganisationPrerequisite } from '../../hooks/useOrganisationPrerequisite';
import OrganisationRequiredBanner from '../../components/admin/OrganisationRequiredBanner';
import StructureRelationHint from '../../components/admin/StructureRelationHint';

const TABS = [
  { id: 'all', label: 'All Departments' },
];

const emptyForm = () => ({
  name: '',
  code: '',
  organisationId: '',
});

function DetailRow({ icon: Icon, label, value }) {
  return (
    <>
      <Icon size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <div className="min-w-0 pb-2">
        <p className="text-xs font-medium leading-none text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-semibold leading-snug text-navy-900 break-words">
          {value || '—'}
        </p>
      </div>
    </>
  );
}

function DepartmentsKpiRow({ kpis = {} }) {
  const items = [
    {
      key: 'total',
      primaryLabel: 'Total',
      secondaryLabel: 'Departments',
      icon: Network,
      iconWrap: 'bg-sky-50 text-sky-500',
    },
    {
      key: 'offices',
      primaryLabel: 'Offices',
      secondaryLabel: 'Linked',
      icon: DoorClosed,
      iconWrap: 'bg-violet-50 text-violet-500',
    },
    {
      key: 'employees',
      primaryLabel: 'Employees',
      secondaryLabel: 'Assigned',
      icon: Users,
      iconWrap: 'bg-emerald-50 text-emerald-500',
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

function exportDepartmentsCsv(rows) {
  const headers = ['Name', 'Code', 'Organisation', 'Offices', 'Employees'];
  const lines = rows.map((row) => [
    row.name || '',
    row.code || '',
    row.organisation_name || '',
    row.office_count ?? 0,
    row.employee_count ?? 0,
  ]);

  const csv = [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'departments.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminDepartmentsPage() {
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
      const rows = await visitorApi.getDepartments();
      setAllRows(Array.isArray(rows) ? rows : []);
      setKpis(rows?.stats || {
        total: rows?.length || 0,
        offices: (rows || []).reduce((sum, r) => sum + Number(r.office_count || 0), 0),
        employees: (rows || []).reduce((sum, r) => sum + Number(r.employee_count || 0), 0),
        organisations: new Set((rows || []).map((r) => r.organisation_id).filter(Boolean)).size,
      });
    } catch (err) {
      setAllRows([]);
      setKpis({});
      toast.error(err?.message || 'Unable to load departments.');
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
      [row.name, row.code, row.organisation_name]
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

  const openShow = useCallback((row) => {
    if (!row?.id) return;
    navigate(`/admin/departments/${row.id}`);
  }, [navigate]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Department',
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
      key: 'office_count',
      label: 'Offices',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'employee_count',
      label: 'Employees',
      render: (value) => <span className="tabular-nums text-gray-800">{Number(value || 0)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <IconButton
          icon={Eye}
          label="View department"
          iconSize={16}
          onClick={(e) => {
            e.stopPropagation();
            openShow(row);
          }}
        />
      ),
    },
  ], []);

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first. Departments are created under an organisation.');
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm(),
      organisationId: orgOptions[0]?.value || '',
    });
    setModalOpen(true);
  };

  const openEdit = (department) => {
    setEditing(department);
    setForm({
      name: department.name || '',
      code: department.code || '',
      organisationId: department.organisation_id || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Department name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await visitorApi.updateDepartment(editing.id, {
          name: form.name,
          code: form.code,
        });
        toast.success('Department updated.');
      } else {
        await visitorApi.createDepartment({
          name: form.name,
          code: form.code,
          organisationId: form.organisationId || undefined,
        });
        toast.success('Department created.');
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save department.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = openShow;

  const pageActions = (
    <button
      type="button"
      onClick={openCreate}
      disabled={!canManageStructure || orgLoading}
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      <span className="hidden sm:inline">New Department</span>
      <span className="sm:hidden">New</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Departments"
        subtitle="Organisation → Department. Then offices and employees attach to the department."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Departments' }]}
        actions={pageActions}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Departments" />
      )}
      <StructureRelationHint highlight="Department" />

      <DepartmentsKpiRow kpis={kpis} />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
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
                    placeholder="Search by department name, code or organisation..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => exportDepartmentsCsv(filteredRows)}
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
              emptyTitle={!canManageStructure ? 'No organisation yet' : 'No departments found.'}
              emptyDescription={
                !canManageStructure
                  ? 'Create an organisation first. Departments are created under an organisation.'
                  : 'Add a department under your organisation.'
              }
              onRowClick={openShow}
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
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Department' : 'New Department'}
        subtitle="Departments are created with an organisation — site and building are not required."
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
              {editing ? 'Save changes' : 'Create department'}
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
            label="Department name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Information Technology"
          />
          <FormField
            label="Code"
            name="code"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            placeholder="IT"
          />
        </div>
      </Modal>
    </div>
  );
}
