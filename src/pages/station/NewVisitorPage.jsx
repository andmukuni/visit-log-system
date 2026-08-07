import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  FormField,
  ActionToolbar,
  SaveAction,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

export default function NewVisitorPage() {
  const toast = useToast();
  const [refData, setRefData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    company: '',
    hostId: '',
    categoryId: '',
    purpose: '',
  });

  const loadRef = useCallback(async () => {
    try {
      const data = await visitorApi.getReferenceData();
      setRefData(data);
    } catch {
      toast.error('Failed to load reference data.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRef();
  }, [loadRef]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const visit = await visitorApi.registerVisit(form);
      toast.success(`Visitor registered. Pass code: ${visit.pass_code}`);
      setForm({ fullName: '', phone: '', email: '', company: '', hostId: '', categoryId: '', purpose: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const hostOptions = [{ value: '', label: 'Select host…' }, ...(refData?.hosts || []).map((h) => ({ value: h.id, label: h.name }))];
  const categoryOptions = [{ value: '', label: 'Select category…' }, ...(refData?.categories || []).map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div>
      <PageHeader
        title="New Visitor"
        subtitle="Register a walk-in or returning visitor"
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: 'New Visitor' }]}
      />

      <Card title="Visitor details">
        {loading ? (
          <p className="text-sm text-navy-500">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <FormField label="Full name" name="fullName" value={form.fullName} onChange={update('fullName')} required />
            <FormField label="Phone" name="phone" type="tel" value={form.phone} onChange={update('phone')} placeholder="+260…" />
            <FormField label="Email" name="email" type="email" value={form.email} onChange={update('email')} />
            <FormField label="Organisation / Company" name="company" value={form.company} onChange={update('company')} />
            <FormField label="Visitor category" name="categoryId" type="select" value={form.categoryId} onChange={update('categoryId')} options={categoryOptions} />
            <FormField label="Host / Person visiting" name="hostId" type="select" value={form.hostId} onChange={update('hostId')} options={hostOptions} />
            <FormField label="Purpose of visit" name="purpose" textarea value={form.purpose} onChange={update('purpose')} rows={3} />
            <div className="md:col-span-2">
              <ActionToolbar>
                <SaveAction type="submit" loading={submitting} label="Register visitor" />
              </ActionToolbar>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
