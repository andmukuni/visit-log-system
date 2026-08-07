import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader, Card, DataTable, Spinner, Modal, FormField, StatusBadge,
  IconButton, AddAction, SaveAction, CancelAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { complianceApi } from '../../utils/visitorApi';

export default function CompliancePrivacyPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    requestType: 'access',
    subjectName: '',
    subjectEmail: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await complianceApi.getPrivacyRequests());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setSaving(true);
    try {
      await complianceApi.createPrivacyRequest(form);
      toast.success('Privacy request logged.');
      setShowForm(false);
      setForm({ requestType: 'access', subjectName: '', subjectEmail: '', notes: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async (id) => {
    try {
      await complianceApi.updatePrivacyRequest(id, { status: 'completed' });
      toast.success('Request marked completed.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    {
      key: 'request_type',
      label: 'Type',
      render: (_, row) => row.request_type?.replace('_', ' ') || row.request_type,
    },
    { key: 'subject_name', label: 'Subject' },
    { key: 'subject_email', label: 'Email' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    { key: 'notes', label: 'Notes' },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => row.status === 'open' ? (
        <IconButton
          icon={Check}
          label="Complete"
          tooltip="Complete"
          variant="ghost"
          size="sm"
          onClick={() => markComplete(row.id)}
        />
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Privacy Requests"
        subtitle="Subject access, erasure and rectification requests"
        breadcrumbs={[{ label: 'Compliance', to: '/compliance' }, { label: 'Privacy' }]}
        actions={<AddAction onClick={() => setShowForm(true)} label="Log request" />}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} requests`}>
          <DataTable columns={columns} data={rows} emptyTitle="No privacy requests" />
        </Card>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Log privacy request"
        footer={(
          <>
            <CancelAction onClick={() => setShowForm(false)} />
            <SaveAction loading={saving} onClick={submit} />
          </>
        )}
      >
        <div className="space-y-4">
          <FormField
            name="requestType"
            label="Request type"
            type="select"
            value={form.requestType}
            onChange={(e) => setForm({ ...form, requestType: e.target.value })}
            options={[
              { value: 'access', label: 'Access (copy of data)' },
              { value: 'erasure', label: 'Erasure' },
              { value: 'rectification', label: 'Rectification' },
              { value: 'objection', label: 'Objection' },
            ]}
          />
          <FormField name="subjectName" label="Subject name" value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} />
          <FormField name="subjectEmail" label="Subject email" type="email" value={form.subjectEmail} onChange={(e) => setForm({ ...form, subjectEmail: e.target.value })} />
          <FormField name="notes" label="Notes" textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
