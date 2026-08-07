import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, Modal, FormField, StatusBadge, IconButton, AddAction, ActionToolbar, ConfirmAction, CancelAction } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityIncidentsPage() {
  const toast = useToast();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    narrative: '',
    severity: 'medium',
    incidentType: 'security',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setIncidents(await securityApi.getIncidents());
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    setSaving(true);
    try {
      await securityApi.createIncident(form);
      toast.success('Incident logged.');
      setShowForm(false);
      setForm({ title: '', narrative: '', severity: 'medium', incidentType: 'security' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (id) => {
    try {
      await securityApi.updateIncident(id, { status: 'resolved' });
      toast.success('Incident resolved.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'site_name', label: 'Site' },
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
    { key: 'reported_by_name', label: 'Reported by' },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => row.status === 'open' ? (
        <IconButton icon={Check} label="Resolve" tooltip="Resolve" variant="ghost" size="sm" onClick={() => resolve(row.id)} />
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Incidents"
        subtitle="Security incidents and investigations"
        breadcrumbs={[{ label: 'Security', to: '/security' }, { label: 'Incidents' }]}
        actions={(
          <ActionToolbar>
            <AddAction onClick={() => setShowForm(true)} label="Log incident" />
          </ActionToolbar>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${incidents.length} incidents`}>
          <DataTable columns={columns} data={incidents} emptyTitle="No incidents" />
        </Card>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Log incident">
        <div className="space-y-4">
          <FormField name="title" label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
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
              { value: 'critical', label: 'Critical' },
            ]}
          />
          <FormField
            name="narrative"
            label="Details"
            textarea
            value={form.narrative}
            onChange={(e) => setForm({ ...form, narrative: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <CancelAction onClick={() => setShowForm(false)} />
            <ConfirmAction loading={saving} onClick={submit} label="Submit" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
