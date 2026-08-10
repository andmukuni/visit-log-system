import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DoorClosed, Eye, MapPin, Network, Plus, Search, UserCheck, X, Edit3 } from 'lucide-react';
import {
  PageHeader,
  DataTable,
  StatusBadge,
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

const emptyForm = () => ({
  name: '',
  email: '',
  phone: '',
  departmentId: '',
  siteId: '',
  officeId: '',
  status: 'active',
});

export default function AdminHostsPage() {
  const toast = useToast();
  const { hasOrganisation, hasActiveOrganisation, loading: orgLoading } = useOrganisationPrerequisite();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [offices, setOffices] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
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
      const [rows, deptRows, siteRows, officeRows] = await Promise.all([
        visitorApi.getHosts(),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getOffices(),
      ]);
      setAllRows(Array.isArray(rows) ? rows : []);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setOffices(Array.isArray(officeRows) ? officeRows : []);
      setKpis(rows?.stats || { total: rows?.length || 0 });
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) =>
      [row.name, row.email, row.department_name, row.site_name, row.office_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [allRows, search]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
    [departments],
  );

  const siteOptions = useMemo(
    () => sites.filter((s) => s.status !== 'inactive').map((s) => ({ value: s.id, label: s.name })),
    [sites],
  );

  const officeOptions = useMemo(() => {
    const list = offices.filter((ofc) => {
      if (form.departmentId && ofc.department_id !== form.departmentId) return false;
      if (form.siteId && ofc.site_id && ofc.site_id !== form.siteId) return false;
      return ofc.status !== 'inactive';
    });
    return [
      { value: '', label: 'No office (optional)' },
      ...list.map((ofc) => ({
        value: ofc.id,
        label: `#${ofc.office_number}${ofc.name ? ` · ${ofc.name}` : ''}`,
      })),
    ];
  }, [offices, form.departmentId, form.siteId]);

  const prerequisitesReady = departmentOptions.length > 0 && siteOptions.length > 0;

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first.');
      return;
    }
    if (!departmentOptions.length) {
      toast.error('Create a department first. Employees belong to a department and a site.');
      return;
    }
    if (!siteOptions.length) {
      toast.error('Create a site/branch first. Employees are assigned to a site.');
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm(),
      departmentId: departmentOptions[0].value,
      siteId: siteOptions[0].value,
    });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      departmentId: row.department_id || '',
      siteId: row.site_id || '',
      officeId: row.office_id || '',
      status: row.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Employee name is required.');
      return;
    }
    if (!form.departmentId || !form.siteId) {
      toast.error('Department and site are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        departmentId: form.departmentId,
        siteId: form.siteId,
        officeId: form.officeId || null,
        status: form.status,
      };
      if (editing?.id) {
        await visitorApi.updateHost(editing.id, payload);
        toast.success('Employee updated.');
      } else {
        await visitorApi.createHost(payload);
        toast.success('Employee created.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save employee.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Employee',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.email || '—'}</p>
        </div>
      ),
    },
    { key: 'department_name', label: 'Department' },
    { key: 'site_name', label: 'Site / Branch' },
    {
      key: 'office_number',
      label: 'Office',
      render: (value) => (value ? `#${value}` : '—'),
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
        <IconButton
          icon={Eye}
          label="View employee"
          iconSize={16}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(row);
          }}
        />
      ),
    },
  ], []);

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title="Employees & Hosts"
        subtitle="Department + Site → Employee. Optional office must match that department and site."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Employees' }]}
        actions={(
          <button
            type="button"
            onClick={openCreate}
            disabled={!canManageStructure || orgLoading || !prerequisitesReady}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Employee
          </button>
        )}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Employees & Hosts" />
      )}
      <StructureRelationHint highlight="Employee" />

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { key: 'total', label: 'Employees', icon: UserCheck },
          { key: 'active', label: 'Active', icon: UserCheck },
          { key: 'with_office', label: 'With office', icon: DoorClosed },
          { key: 'departments', label: 'Departments', icon: Network },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
              <Icon size={16} />
            </span>
            <div>
              <p className="text-lg font-bold tabular-nums text-slate-900">{Number(kpis[key] ?? 0)}</p>
              <p className="text-xs font-semibold text-gray-600">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="border-b border-gray-200 px-4 py-2 sm:px-5">
              <label className="relative block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, email, department, site..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                />
              </label>
            </div>
            <DataTable
              embedded
              columns={columns}
              data={pageRows}
              loading={loading}
              emptyTitle={!prerequisitesReady ? 'Prerequisites missing' : 'No employees found.'}
              emptyDescription={
                !departmentOptions.length
                  ? 'Create a Department first, then assign employees to department + site.'
                  : !siteOptions.length
                    ? 'Create a Site / Branch first, then assign employees.'
                    : 'Add an employee under a department and site.'
              }
              onRowClick={setSelected}
              activeRowId={selected?.id}
              serverPagination
              page={page}
              pageSize={pageSize}
              totalItems={filteredRows.length}
              onPageChange={(value) => updateParams({ page: value })}
              onPageSizeChange={(value) => updateParams({ pageSize: value, page: 1 })}
              pageSizeOptions={[7, 10, 25, 50]}
              pagination
            />
          </div>

          {selected && (
            <aside className="hidden w-full shrink-0 border-t border-gray-200 bg-white lg:flex lg:w-[300px] lg:flex-col lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-navy-900">{selected.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{selected.email || 'No email'}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-2 px-4 py-3 text-sm">
                <StatusBadge status={selected.status || 'active'} />
                <p className="flex items-center gap-2"><Network size={14} className="text-gray-400" /><span className="font-semibold">{selected.department_name || '—'}</span></p>
                <p className="flex items-center gap-2"><MapPin size={14} className="text-gray-400" /><span className="font-semibold">{selected.site_name || '—'}</span></p>
                <p className="flex items-center gap-2"><DoorClosed size={14} className="text-gray-400" /><span className="font-semibold">{selected.office_number ? `#${selected.office_number}` : 'No office'}</span></p>
              </div>
              <div className="mt-auto border-t border-gray-200 p-3">
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] px-3 py-2 text-sm font-semibold text-[#1a73e8]"
                >
                  <Edit3 size={16} /> Edit Employee
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Employee' : 'New Employee / Host'}
        subtitle="Employee → Department + Site (+ optional Office) → Organisation"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              {editing ? 'Save changes' : 'Create employee'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Full name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Jane Banda"
          />
          <FormField
            label="Email"
            name="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="jane@company.com"
          />
          <FormField
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+260..."
          />
          <FormField
            label="Department"
            name="departmentId"
            type="select"
            required
            value={form.departmentId}
            onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value, officeId: '' }))}
            options={departmentOptions}
          />
          <FormField
            label="Site / Branch"
            name="siteId"
            type="select"
            required
            value={form.siteId}
            onChange={(e) => setForm((prev) => ({ ...prev, siteId: e.target.value, officeId: '' }))}
            options={siteOptions}
          />
          <FormField
            label="Office"
            name="officeId"
            type="select"
            value={form.officeId}
            onChange={(e) => setForm((prev) => ({ ...prev, officeId: e.target.value }))}
            options={officeOptions}
            helpText="Optional. Must match the selected department and site."
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
