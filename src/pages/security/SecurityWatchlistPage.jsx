import { UserX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, Modal, FormField, StatusBadge, IconButton, AddAction, ActionToolbar, SaveAction, CancelAction } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityWatchlistPage() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entryType: 'visitor',
    fullName: '',
    phone: '',
    plateNumber: '',
    reason: '',
    severity: 'medium',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await securityApi.getWatchlist());
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!form.reason.trim()) {
      toast.error('Reason is required.');
      return;
    }
    setSaving(true);
    try {
      await securityApi.createWatchlistEntry({
        entryType: form.entryType,
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
        plateNumber: form.plateNumber || undefined,
        reason: form.reason.trim(),
        severity: form.severity,
      });
      toast.success('Watchlist entry added.');
      setShowForm(false);
      setForm({ entryType: 'visitor', fullName: '', phone: '', plateNumber: '', reason: '', severity: 'medium' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id) => {
    try {
      await securityApi.updateWatchlistEntry(id, { status: 'inactive' });
      toast.success('Entry deactivated.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    {
      key: 'entry_type',
      label: 'Type',
      render: (_, row) => row.entry_type === 'vehicle' ? 'Vehicle' : 'Visitor',
    },
    { key: 'full_name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'plate_number', label: 'Plate' },
    {
      key: 'severity',
      label: 'Severity',
      render: (_, row) => <StatusBadge status={row.severity} />,
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    { key: 'reason', label: 'Reason' },
    {
      key: 'created_at',
      label: 'Added',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => row.status === 'active' ? (
        <IconButton icon={UserX} label="Deactivate" tooltip="Deactivate" variant="danger" size="sm" onClick={() => deactivate(row.id)} />
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Watchlist"
        subtitle="Restricted visitors and vehicles — reason visible to authorised security staff only"
        breadcrumbs={[{ label: 'Security', to: '/security' }, { label: 'Watchlist' }]}
        actions={(
          <ActionToolbar>
            <AddAction onClick={() => setShowForm(true)} label="Add entry" />
          </ActionToolbar>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${entries.length} entries`}>
          <DataTable columns={columns} data={entries} emptyTitle="Watchlist empty" />
        </Card>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Add watchlist entry">
        <div className="space-y-4">
          <FormField
            name="entryType"
            label="Type"
            type="select"
            value={form.entryType}
            onChange={(e) => setForm({ ...form, entryType: e.target.value })}
            options={[
              { value: 'visitor', label: 'Visitor' },
              { value: 'vehicle', label: 'Vehicle' },
            ]}
          />
          {form.entryType === 'visitor' ? (
            <>
              <FormField name="fullName" label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              <FormField name="phone" label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </>
          ) : (
            <FormField name="plateNumber" label="Plate number" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
          )}
          <FormField
            name="severity"
            label="Severity"
            type="select"
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
          <FormField
            name="reason"
            label="Reason"
            textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <CancelAction onClick={() => setShowForm(false)} />
            <SaveAction loading={saving} onClick={submit} label="Save entry" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
