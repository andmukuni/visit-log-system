import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  FormField,
  ActionToolbar,
  SaveAction,
  Spinner,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import { scopeReceptionReferenceData } from '../../utils/receptionZoneScope';

export default function ReceptionRegisterPage() {
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
      const data = scopeReceptionReferenceData(await receptionApi.getReferenceData());
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
      const visit = await receptionApi.registerVisit(form);
      toastHostApprovalRequested(
        toast,
        visit,
        `Walk-in registered. Pass code: ${visit.pass_code}. Host approval requested.`,
      );
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
        title="Register Walk-in"
        subtitle="Creates a visit pending host approval — it appears on the calendar once approved"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Register' }]}
      />

      <Card title="Visitor details">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size={24} /></div>
        ) : (
          <form onSubmit={handleSubmit} className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Full name" name="fullName" value={form.fullName} onChange={update('fullName')} required />
            <FormField label="Phone" name="phone" type="tel" value={form.phone} onChange={update('phone')} placeholder="+260…" />
            <FormField label="Email" name="email" type="email" value={form.email} onChange={update('email')} />
            <FormField label="Organisation / Company" name="company" value={form.company} onChange={update('company')} />
            <FormField label="Visitor category" name="categoryId" type="select" value={form.categoryId} onChange={update('categoryId')} options={categoryOptions} />
            <FormField label="Host / Person visiting" name="hostId" type="select" value={form.hostId} onChange={update('hostId')} options={hostOptions} required />
            <FormField label="Purpose of visit" name="purpose" textarea value={form.purpose} onChange={update('purpose')} rows={3} className="md:col-span-2" />
            <div className="md:col-span-2">
              <ActionToolbar>
                <SaveAction type="submit" loading={submitting} label="Register & request approval" />
              </ActionToolbar>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
