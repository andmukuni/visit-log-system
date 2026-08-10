import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DoorOpen, Eye, MapPin, Plus, Search, X, Edit3 } from 'lucide-react';
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
import { STATION_TYPES } from '../../../shared/orgHierarchy.js';

const emptyForm = () => ({
  name: '',
  siteId: '',
  type: 'reception',
  status: 'active',
});

export default function AdminStationsPage() {
  const toast = useToast();
  const { hasOrganisation, hasActiveOrganisation, loading: orgLoading } = useOrganisationPrerequisite();
  const canManageStructure = hasOrganisation && hasActiveOrganisation;
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize') || 7)));

  const [searchInput, setSearchInput] = useState(search);
  const [allRows, setAllRows] = useState([]);
  const [sites, setSites] = useState([]);
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
      const [rows, siteRows] = await Promise.all([
        visitorApi.getStations(),
        visitorApi.getSites(),
      ]);
      setAllRows(Array.isArray(rows) ? rows : []);
      setSites(Array.isArray(siteRows) ? siteRows : []);
      setKpis(rows?.stats || {
        total: rows?.length || 0,
        active: (rows || []).filter((r) => r.status === 'active').length,
        gates: (rows || []).filter((r) => r.type === 'gate').length,
        reception: (rows || []).filter((r) => r.type === 'reception').length,
      });
    } catch (err) {
      setAllRows([]);
      toast.error(err?.message || 'Unable to load stations.');
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
      [row.name, row.site_name, row.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [allRows, search]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const siteOptions = useMemo(
    () => (sites || [])
      .filter((site) => site.status === 'active')
      .map((site) => ({ value: site.id, label: site.name })),
    [sites],
  );

  const openCreate = () => {
    if (!canManageStructure) {
      toast.error('Create an organisation first.');
      return;
    }
    if (!siteOptions.length) {
      toast.error('Create a site/branch first. Stations belong to a site.');
      return;
    }
    setEditing(null);
    setForm({ ...emptyForm(), siteId: siteOptions[0].value });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      siteId: row.site_id || '',
      type: row.type || 'reception',
      status: row.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Station name is required.');
      return;
    }
    if (!form.siteId) {
      toast.error('Select a site/branch.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await visitorApi.updateStation(editing.id, form);
        toast.success('Station updated.');
      } else {
        await visitorApi.createStation(form);
        toast.success('Station created.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save station.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Station',
      render: (_, row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs capitalize text-gray-500">{row.type || '—'}</p>
        </div>
      ),
    },
    {
      key: 'site_name',
      label: 'Site / Branch',
      render: (value) => <span className="text-sm text-gray-700">{value || '—'}</span>,
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
          label="View station"
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
        title="Stations & Gates"
        subtitle="Belong to a Site / Branch — reception desks and entry points."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Stations' }]}
        actions={(
          <button
            type="button"
            onClick={openCreate}
            disabled={!canManageStructure || orgLoading || !siteOptions.length}
            className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Station
          </button>
        )}
      />

      {!orgLoading && !canManageStructure && (
        <OrganisationRequiredBanner entityLabel="Stations & Gates" />
      )}
      <StructureRelationHint highlight="Station" />

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { key: 'total', label: 'Stations', icon: DoorOpen },
          { key: 'active', label: 'Active', icon: DoorOpen },
          { key: 'gates', label: 'Gates', icon: MapPin },
          { key: 'reception', label: 'Reception', icon: DoorOpen },
        ].map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500">
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
                  placeholder="Search stations or sites..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/15"
                />
              </label>
            </div>
            <DataTable
              embedded
              columns={columns}
              data={pageRows}
              loading={loading}
              emptyTitle={!siteOptions.length ? 'No sites yet' : 'No stations found.'}
              emptyDescription={
                !siteOptions.length
                  ? 'Create a Site / Branch first. Stations belong to a site.'
                  : 'Add a reception desk or gate on a site.'
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
                  <p className="mt-0.5 text-xs capitalize text-gray-500">{selected.type}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3 px-4 py-3 text-sm">
                <StatusBadge status={selected.status || 'active'} />
                <p><span className="text-gray-500">Site:</span> <span className="font-semibold text-navy-900">{selected.site_name || '—'}</span></p>
                <p className="text-xs text-gray-500">Stations belong to a site — not a department.</p>
              </div>
              <div className="mt-auto border-t border-gray-200 p-3">
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1a73e8] px-3 py-2 text-sm font-semibold text-[#1a73e8]"
                >
                  <Edit3 size={16} /> Edit Station
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Station' : 'New Station / Gate'}
        subtitle="Station → Site → Organisation"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <LoadingButton loading={saving} onClick={handleSave}>
              {editing ? 'Save changes' : 'Create station'}
            </LoadingButton>
          </div>
        )}
      >
        <div className="space-y-3">
          <FormField
            label="Site / Branch"
            name="siteId"
            type="select"
            required
            value={form.siteId}
            onChange={(e) => setForm((prev) => ({ ...prev, siteId: e.target.value }))}
            options={siteOptions}
          />
          <FormField
            label="Name"
            name="name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Main Gate"
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
