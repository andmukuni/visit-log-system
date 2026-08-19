import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Edit3,
  Layers3,
  MapPin,
  Network,
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

const emptyForm = () => ({
  officeNumber: '',
  name: '',
  departmentId: '',
  siteId: '',
  buildingId: '',
  zoneId: '',
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

export default function AdminOfficeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [office, setOffice] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [row, deptRows, siteRows, buildingRows, zoneRows] = await Promise.all([
        visitorApi.getOffice(id),
        visitorApi.getDepartments(),
        visitorApi.getSites(),
        visitorApi.getBuildings(),
        visitorApi.getZones(),
      ]);
      setOffice(row || null);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setBuildings(Array.isArray(buildingRows) ? buildingRows : []);
      setZones(Array.isArray(zoneRows) ? zoneRows : []);
    } catch (err) {
      setOffice(null);
      toast.error(err?.message || 'Unable to load office.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.code ? `${d.name} (${d.code})` : d.name })),
    [departments],
  );

  const siteOptions = useMemo(
    () => sites
      .filter((s) => s.status !== 'inactive' || s.id === form.siteId)
      .map((s) => ({ value: s.id, label: s.name })),
    [sites, form.siteId],
  );

  const buildingOptions = useMemo(() => {
    const list = form.siteId
      ? buildings.filter((b) => b.site_id === form.siteId)
      : buildings;
    return list.map((b) => ({
      value: b.id,
      label: b.site_name ? `${b.name} · ${b.site_name}` : b.name,
    }));
  }, [buildings, form.siteId]);

  const zoneOptions = useMemo(() => {
    const list = form.buildingId
      ? zones.filter((z) => z.building_id === form.buildingId)
      : form.siteId
        ? zones.filter((z) => z.site_id === form.siteId || buildings.some((b) => b.id === z.building_id && b.site_id === form.siteId))
        : zones;
    return list.map((z) => ({
      value: z.id,
      label: z.access_level ? `${z.name} · ${z.access_level}` : z.name,
    }));
  }, [zones, buildings, form.buildingId, form.siteId]);

  const openEdit = () => {
    if (!office) return;
    const building = buildings.find((b) => b.id === office.building_id);
    const zone = zones.find((z) => z.id === office.zone_id);
    setForm({
      officeNumber: office.office_number || '',
      name: office.name || '',
      departmentId: office.department_id || '',
      siteId: office.site_id || building?.site_id || zone?.site_id || '',
      buildingId: office.building_id || zone?.building_id || '',
      zoneId: office.zone_id || '',
      status: office.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!office?.id) return;
    if (!form.officeNumber.trim()) {
      toast.error('Office label is required.');
      return;
    }
    if (!form.departmentId || !form.buildingId || !form.zoneId) {
      toast.error('Department, building, and zone are required.');
      return;
    }
    setSaving(true);
    try {
      const label = form.officeNumber.trim();
      await visitorApi.updateOffice(office.id, {
        officeNumber: label,
        name: form.name.trim() || label,
        departmentId: form.departmentId,
        buildingId: form.buildingId,
        zoneId: form.zoneId,
        status: form.status,
      });
      toast.success('Office updated.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save office.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Office"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Offices', to: '/admin/offices' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-sm text-gray-500 shadow-sm">
          Loading office…
        </div>
      </div>
    );
  }

  if (!office) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Office not found"
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Offices', to: '/admin/offices' }, { label: 'Details' }]}
        />
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm">
          <p className="text-sm text-gray-600">This office could not be found or you do not have access.</p>
          <Link
            to="/admin/offices"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a73e8] hover:underline"
          >
            <ArrowLeft size={14} /> Back to offices
          </Link>
        </div>
      </div>
    );
  }

  const displayName = office.office_number || office.name || 'Office';

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      <PageHeader
        title={displayName}
        subtitle={office.name && office.name !== office.office_number ? office.name : 'Office room'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Offices', to: '/admin/offices' },
          { label: displayName },
        ]}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/offices')}
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
              <h2 className="text-lg font-bold text-navy-900">{displayName}</h2>
              <StatusBadge status={office.status || 'active'} />
            </div>
            {office.name && office.name !== office.office_number && (
              <p className="mt-1 text-sm text-gray-500">{office.name}</p>
            )}
          </div>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Placement</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem icon={Network} label="Department" value={office.department_name} />
              <DetailItem icon={Layers3} label="Zone" value={office.zone_name} />
              <DetailItem icon={Building2} label="Building" value={office.building_name} />
              <DetailItem icon={MapPin} label="Site" value={office.site_name} />
              <DetailItem icon={Building2} label="Organisation" value={office.organisation_name} />
            </div>
          </section>
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Usage</h3>
            <div className="mt-2.5 grid gap-2.5">
              <DetailItem
                icon={Users}
                label="Employees"
                value={`${Number(office.employee_count || 0)} employee${Number(office.employee_count || 0) === 1 ? '' : 's'}`}
              />
            </div>
          </section>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Edit Office"
        subtitle="Office → Zone + Building + Department (site from building)"
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
            label="Department"
            name="departmentId"
            type="searchable-select"
            required
            value={form.departmentId}
            onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value }))}
            options={departmentOptions}
            placeholder="Search department…"
          />
          <FormField
            label="Site / Branch"
            name="siteId"
            type="searchable-select"
            required
            value={form.siteId}
            onChange={(e) => {
              const siteId = e.target.value;
              const nextBuilding = buildings.find((b) => b.site_id === siteId);
              const nextZone = zones.find((z) => z.building_id === nextBuilding?.id);
              setForm((prev) => ({
                ...prev,
                siteId,
                buildingId: nextBuilding?.id || '',
                zoneId: nextZone?.id || '',
              }));
            }}
            options={siteOptions}
            placeholder="Search site…"
            helpText="Used to filter buildings and zones."
          />
          <FormField
            label="Building"
            name="buildingId"
            type="searchable-select"
            required
            value={form.buildingId}
            onChange={(e) => {
              const buildingId = e.target.value;
              const nextZone = zones.find((z) => z.building_id === buildingId);
              setForm((prev) => ({
                ...prev,
                buildingId,
                zoneId: nextZone?.id || '',
              }));
            }}
            options={buildingOptions}
            placeholder="Search building…"
          />
          <FormField
            label="Zone"
            name="zoneId"
            type="searchable-select"
            required
            value={form.zoneId}
            onChange={(e) => {
              const zoneId = e.target.value;
              const zone = zones.find((z) => z.id === zoneId);
              setForm((prev) => ({
                ...prev,
                zoneId,
                buildingId: zone?.building_id || prev.buildingId,
                siteId: zone?.site_id || prev.siteId,
              }));
            }}
            options={zoneOptions}
            placeholder="Search zone…"
            helpText="Required. Office belongs to this zone inside the building."
          />
          <FormField
            label="Office label"
            name="officeNumber"
            required
            value={form.officeNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, officeNumber: e.target.value }))}
            placeholder="IT Dep Group office 6"
          />
          <FormField
            label="Name"
            name="name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Executive suite"
            helpText="Optional display name. Defaults to the office label if left blank."
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
