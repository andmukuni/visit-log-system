import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, FormField, SaveAction } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { hostApi } from '../../utils/visitorApi';

export default function HostInvitePage() {
  const toast = useToast();
  const [refData, setRefData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    company: '',
    categoryId: '',
    purpose: '',
    expectedAt: '',
    siteId: '',
  });

  const loadRef = useCallback(async () => {
    try {
      const data = await hostApi.getReferenceData();
      setRefData(data);
      setForm((f) => ({ ...f, siteId: data.defaultSiteId || data.sites?.[0]?.id || '' }));
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
      const visit = await hostApi.inviteVisitor({
        ...form,
        expectedAt: form.expectedAt || null,
      });
      const inviteMsg = visit.inviteUrl
        ? ` Pass code: ${visit.pass_code}. Self-service link: ${window.location.origin}${visit.inviteUrl}`
        : ` Pass code: ${visit.pass_code}`;
      toast.success(
        (visit.status === 'approved' ? 'Invitation sent.' : 'Invitation submitted for approval.') + inviteMsg,
      );
      setForm({
        fullName: '',
        phone: '',
        email: '',
        company: '',
        categoryId: '',
        purpose: '',
        expectedAt: '',
        siteId: refData?.defaultSiteId || refData?.sites?.[0]?.id || '',
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = [
    { value: '', label: 'Select category…' },
    ...(refData?.categories || []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const siteOptions = (refData?.sites || []).map((s) => ({ value: s.id, label: `${s.name} (${s.code || '—'})` }));

  return (
    <div>
      <PageHeader
        title="Invite Visitor"
        subtitle="Pre-register an expected guest — they will receive a pass code when approved"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'Invite Visitor' }]}
      />

      <Card title="Visitor invitation">
        {loading ? (
          <p className="text-sm text-navy-500">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <FormField label="Full name" name="fullName" value={form.fullName} onChange={update('fullName')} required />
            <FormField label="Phone" name="phone" type="tel" value={form.phone} onChange={update('phone')} />
            <FormField label="Email" name="email" type="email" value={form.email} onChange={update('email')} />
            <FormField label="Company" name="company" value={form.company} onChange={update('company')} />
            <FormField label="Site" name="siteId" type="select" value={form.siteId} onChange={update('siteId')} options={siteOptions} required />
            <FormField label="Category" name="categoryId" type="select" value={form.categoryId} onChange={update('categoryId')} options={categoryOptions} />
            <FormField label="Expected arrival" name="expectedAt" type="datetime-local" value={form.expectedAt} onChange={update('expectedAt')} />
            <FormField label="Purpose" name="purpose" textarea value={form.purpose} onChange={update('purpose')} rows={3} />
            <div className="md:col-span-2">
              <SaveAction type="submit" loading={submitting} label="Send invitation" />
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
