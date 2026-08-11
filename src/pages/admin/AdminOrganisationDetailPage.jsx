import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Edit3,
  Eye,
  Globe2,
  Network,
} from 'lucide-react';
import {
  PageHeader,
  StatusBadge,
  Modal,
  FormField,
  LoadingButton,
  DataTable,
  IconButton,
} from '../../components/ui';
import { toast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

const emptyForm = () => ({
  name: '',
  slug: '',
  timezone: 'Africa/Lusaka',
  status: 'active',
});

const MODULE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sites', label: 'Sites', badgeKey: 'sites' },
  { id: 'departments', label: 'Departments', badgeKey: 'departments' },
  { id: 'offices', label: 'Offices', badgeKey: 'offices' },
  { id: 'employees', label: 'Employees', badgeKey: 'employees' },
  { id: 'stations', label: 'Stations', badgeKey: 'stations' },
];

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

function StructureStat({ label, value, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-gray-100 bg-navy-50/40 px-3.5 py-3 text-left transition-colors hover:border-gray-200 hover:bg-navy-50/70"
    >
      <p className="text-2xl font-bold tabular-nums text-navy-900">{Number(value || 0)}</p>
      <p className="mt-1 text-xs font-semibold text-gray-600">{label}</p>
    </button>
  );
}

function formatHostName(row) {
  const title = String(row?.title || '').trim();
  const name = String(row?.name || '').trim();
  if (title && name) return `${title} ${name}`;
  return name || '—';
}

function ModuleTableCard({
  title,
  subtitle,
  manageTo,
  manageLabel,
  columns,
  data,
  loading,
  emptyTitle,
  onRowClick,
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {manageTo && (
          <Link
            to={manageTo}
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {manageLabel || 'Manage'}
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-100">
        <DataTable
          embedded
          columns={columns}
          data={data}
          loading={loading}
          emptyTitle={emptyTitle}
          onRowClick={onRowClick}
          pageSize={10}
          pagination
        />
      </div>
    </div>
  );
}

export default function AdminOrganisationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  const [organisation, setOrganisation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [offices, setOffices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [stations, setStations] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const setTab = useCallback((nextTab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!nextTab || nextTab === 'overview') next.delete('tab');
      else next.set('tab', nextTab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const loadOrganisation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setOrganisation(await visitorApi.getOrganisation(id));
    } catch (err) {
      setOrganisation(null);
      toast.error(err?.message || 'Unable to load organisation.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadModules = useCallback(async () => {
    if (!id) return;
    setModulesLoading(true);
    try {
      const [siteRows, deptRows, officeRows, hostRows, stationRows] = await Promise.all([
        visitorApi.getSites(),
        visitorApi.getDepartments(),
        visitorApi.getOffices(),
        visitorApi.getHosts(),
        visitorApi.getStations(),
      ]);

      const matchesOrg = (row) => String(row?.organisation_id || '') === String(id);

      setSites((Array.isArray(siteRows) ? siteRows : []).filter(matchesOrg));
      setDepartments((Array.isArray(deptRows) ? deptRows : []).filter(matchesOrg));
      setOffices((Array.isArray(officeRows) ? officeRows : []).filter(matchesOrg));
      setEmployees((Array.isArray(hostRows) ? hostRows : []).filter(matchesOrg));
      setStations((Array.isArray(stationRows) ? stationRows : []).filter(matchesOrg));
    } catch (err) {
      setSites([]);
      setDepartments([]);
      setOffices([]);
      setEmployees([]);
      setStations([]);
      toast.error(err?.message || 'Unable to load organisation modules.');
    } finally {
      setModulesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOrganisation();
  }, [loadOrganisation]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const badgeCounts = useMemo(() => ({
    sites: sites.length,
    departments: departments.length,
    offices: offices.length,
    employees: employees.length,
    stations: stations.length,
  }), [sites, departments, offices, employees, stations]);

  const openEdit = () => {
    if (!organisation) return;
    setForm({
      name: organisation.name || '',
      slug: organisation.slug || '',
      timezone: organisation.timezone || 'Africa/Lusaka',
      status: organisation.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!organisation?.id) return;
    if (!form.name.trim()) {
      toast.error('Organisation name is required.');
      return;
    }
    setSaving(true);
    try {
      await visitorApi.updateOrganisation(organisation.id, form);
      toast.success('Organisation updated.');
      setModalOpen(false);
      await loadOrganisation();
    } catch (err) {
      toast.error(err?.message || 'Could not save organisation.');
    } finally {
      setSaving(false);
    }
  };

  const siteColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Site / Branch',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.code || '—'}</p>
        </div>
      ),
    },
    {
      key: 'station_count',
      label: 'Stations',
      render: (value) => <span className="tabular-nums">{Number(value || 0)}</span>,
    },
    {
      key: 'office_count',
      label: 'Offices',
      render: (value) => <span className="tabular-nums">{Number(value || 0)}</span>,
    },
    {
      key: 'employee_count',
      label: 'Employees',
      render: (value) => <span className="tabular-nums">{Number(value || 0)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
  ], []);

  const departmentColumns = useMemo(() => [
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
      key: 'office_count',
      label: 'Offices',
      render: (value) => <span className="tabular-nums">{Number(value || 0)}</span>,
    },
    {
      key: 'employee_count',
      label: 'Employees',
      render: (value) => <span className="tabular-nums">{Number(value || 0)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
  ], []);

  const officeColumns = useMemo(() => [
    {
      key: 'office_number',
      label: 'Office',
      render: (_, row) => (
        <p className="font-medium text-gray-900">{row.office_number || row.name || '—'}</p>
      ),
    },
    { key: 'department_name', label: 'Department' },
    { key: 'site_name', label: 'Site' },
    { key: 'building_name', label: 'Building' },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
  ], []);

  const employeeColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Employee',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{formatHostName(row)}</p>
          <p className="text-xs text-gray-500">{row.email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'position_name',
      label: 'Position',
      render: (value) => value || '—',
    },
    { key: 'department_name', label: 'Department' },
    { key: 'site_name', label: 'Site' },
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
            navigate(`/admin/hosts/${row.id}`);
          }}
        />
      ),
    },
  ], [navigate]);

  const stationColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Station',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.code || row.type || '—'}</p>
        </div>
      ),
    },
    { key: 'site_name', label: 'Site' },
    {
      key: 'type',
      label: 'Type',
      render: (value) => value || '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value || 'active'} />,
    },
  ], []);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Organisation"
          breadcrumbs={[
            { label: 'Admin', to: '/admin' },
            { label: 'Organisations', to: '/admin/organisations' },
            { label: 'Details' },
          ]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading organisation…
        </div>
      </div>
    );
  }

  if (!organisation) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Organisation not found"
          breadcrumbs={[
            { label: 'Admin', to: '/admin' },
            { label: 'Organisations', to: '/admin/organisations' },
            { label: 'Details' },
          ]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">
            This organisation could not be found or you do not have access.
          </p>
          <Link
            to="/admin/organisations"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to organisations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={organisation.name}
        subtitle={organisation.slug || 'No slug'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Organisations', to: '/admin/organisations' },
          { label: organisation.name },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/organisations')}
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
              <h2 className="text-lg font-bold text-navy-900">{organisation.name}</h2>
              <StatusBadge status={organisation.status || 'active'} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{organisation.slug || 'No slug'}</p>
          </div>
        </div>

        <div className="border-b border-gray-200">
          <div className="flex gap-0 overflow-x-auto px-4 pt-0.5 sm:px-5">
            {MODULE_TABS.map(({ id: tabId, label, badgeKey }) => {
              const active = tab === tabId;
              const badge = badgeKey ? badgeCounts[badgeKey] : null;
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setTab(tabId)}
                  className={`relative shrink-0 whitespace-nowrap px-3 pb-2 pt-2 text-xs font-semibold transition-colors sm:px-4 sm:pb-2.5 sm:pt-2.5 sm:text-sm ${
                    active
                      ? 'text-navy-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#1a73e8]'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {label}
                    {badge != null && (
                      <span className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {tab === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">
                  Company
                </h3>
                <div className="mt-2.5 grid gap-3">
                  <DetailItem icon={Globe2} label="Timezone" value={organisation.timezone} />
                  <DetailItem icon={Building2} label="Slug" value={organisation.slug} />
                  <DetailItem
                    icon={Network}
                    label="Status"
                    value={(organisation.status || 'active').replace(/^\w/, (c) => c.toUpperCase())}
                  />
                </div>
              </section>

              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">
                  Structure
                </h3>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <StructureStat label="Sites" value={badgeCounts.sites} onClick={() => setTab('sites')} />
                  <StructureStat label="Departments" value={badgeCounts.departments} onClick={() => setTab('departments')} />
                  <StructureStat label="Offices" value={badgeCounts.offices} onClick={() => setTab('offices')} />
                  <StructureStat label="Employees" value={badgeCounts.employees} onClick={() => setTab('employees')} />
                  <StructureStat label="Stations" value={badgeCounts.stations} onClick={() => setTab('stations')} />
                  <StructureStat
                    label="Users"
                    value={organisation.user_count}
                    onClick={() => setTab('employees')}
                  />
                </div>
              </section>
            </div>
          )}

          {tab === 'sites' && (
            <ModuleTableCard
              title="Sites & Branches"
              subtitle={`${sites.length} site${sites.length === 1 ? '' : 's'} in this organisation`}
              manageTo="/admin/sites"
              manageLabel="Manage sites"
              columns={siteColumns}
              data={sites}
              loading={modulesLoading}
              emptyTitle="No sites for this organisation."
            />
          )}

          {tab === 'departments' && (
            <ModuleTableCard
              title="Departments"
              subtitle={`${departments.length} department${departments.length === 1 ? '' : 's'} in this organisation`}
              manageTo="/admin/departments"
              manageLabel="Manage departments"
              columns={departmentColumns}
              data={departments}
              loading={modulesLoading}
              emptyTitle="No departments for this organisation."
            />
          )}

          {tab === 'offices' && (
            <ModuleTableCard
              title="Offices"
              subtitle={`${offices.length} office${offices.length === 1 ? '' : 's'} in this organisation`}
              manageTo="/admin/offices"
              manageLabel="Manage offices"
              columns={officeColumns}
              data={offices}
              loading={modulesLoading}
              emptyTitle="No offices for this organisation."
            />
          )}

          {tab === 'employees' && (
            <ModuleTableCard
              title="Employees"
              subtitle={`${employees.length} employee${employees.length === 1 ? '' : 's'} in this organisation`}
              manageTo="/admin/hosts"
              manageLabel="Manage employees"
              columns={employeeColumns}
              data={employees}
              loading={modulesLoading}
              emptyTitle="No employees for this organisation."
              onRowClick={(row) => navigate(`/admin/hosts/${row.id}`)}
            />
          )}

          {tab === 'stations' && (
            <ModuleTableCard
              title="Stations"
              subtitle={`${stations.length} station${stations.length === 1 ? '' : 's'} in this organisation`}
              manageTo="/admin/stations"
              manageLabel="Manage stations"
              columns={stationColumns}
              data={stations}
              loading={modulesLoading}
              emptyTitle="No stations for this organisation."
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Organisation"
        subtitle="Update company identity used across sites, hosts, and visits."
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
              Save changes
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
            helpText="URL-safe identifier."
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
    </div>
  );
}
