import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { LoadingButton, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { kioskApi } from '../../utils/kioskApi';

export default function VisitInvitePage() {
  const { token } = useParams();
  const toast = useToast();
  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', company: '' });
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [passCode, setPassCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kioskApi.getInvite(token);
      setVisit(data);
      setForm({
        fullName: data.full_name || '',
        phone: data.phone || '',
        email: data.email || '',
        company: data.company || '',
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async () => {
    if (!privacyAccepted) {
      toast.error('Please accept the privacy notice.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await kioskApi.confirmInvite(token, { ...form, privacyAccepted: true });
      setPassCode(result.passCode);
      setConfirmed(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Spinner size={32} />
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-8 text-center">
        <div>
          <h1 className="text-xl font-bold mb-2">Invitation not found</h1>
          <p className="text-white/60">This link may have expired or already been used.</p>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-8">
        <div className="max-w-md text-center bg-white/5 rounded-2xl p-10 border border-green-500/30">
          <h1 className="text-2xl font-bold text-green-300 mb-4">Registration confirmed</h1>
          <p className="text-white/80 mb-4">Show this pass code at reception when you arrive:</p>
          <p className="text-4xl font-mono font-bold tracking-widest">{passCode}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white/5 rounded-2xl p-8 border border-white/10">
        <h1 className="text-2xl font-bold mb-1">Visit invitation</h1>
        <p className="text-white/60 text-sm mb-6">Hosted by {visit.host_name} · {visit.site_name}</p>

        <div className="space-y-4 mb-6">
          <p className="text-sm"><span className="text-white/50">Purpose:</span> {visit.purpose || '—'}</p>
          <p className="text-sm"><span className="text-white/50">Category:</span> {visit.category_name || '—'}</p>
        </div>

        <div className="space-y-3 mb-6">
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            placeholder="Full name"
            aria-label="Full name"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Phone"
            aria-label="Phone"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30"
          />
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            type="email"
            aria-label="Email"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30"
          />
          <input
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            placeholder="Company"
            aria-label="Company"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30"
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-white/70 mb-6 cursor-pointer">
          <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="mt-1" />
          <span>I accept the privacy notice and consent to visitor data processing.</span>
        </label>

        <div className="flex justify-center">
          <LoadingButton
            loading={submitting}
            onClick={confirm}
            icon={Check}
            iconOnly
            aria-label="Confirm registration"
            variant="primary"
            size="lg"
            className="bg-white text-gray-900 hover:bg-gray-100 border-white"
          />
        </div>
      </div>
    </div>
  );
}
