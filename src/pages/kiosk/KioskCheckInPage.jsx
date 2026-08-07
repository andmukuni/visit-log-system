import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Check, ArrowLeft } from 'lucide-react';
import { LoadingButton, IconButton } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { kioskApi } from '../../utils/kioskApi';

export default function KioskCheckInPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [passCode, setPassCode] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!privacyAccepted) {
      toast.error('Please accept the privacy notice.');
      return;
    }
    setLoading(true);
    try {
      const result = await kioskApi.checkIn({ passCode: passCode.trim(), privacyAccepted: true });
      setSuccess(result);
      setPassCode('');
      setPrivacyAccepted(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center bg-white/5 rounded-2xl p-10 border border-green-500/30">
        <h2 className="text-2xl font-bold text-green-300 mb-4">You&apos;re checked in</h2>
        <p className="text-white/80 mb-2">Your pass code: <strong className="text-white">{success.passCode}</strong></p>
        {success.badgeNumber && <p className="text-white/70">Badge: {success.badgeNumber}</p>}
        <div className="mt-8 flex justify-center">
          <IconButton
            icon={Check}
            label="Done"
            tooltip="Done"
            variant="primary"
            className="bg-white text-gray-900 hover:bg-gray-100"
            onClick={() => { setSuccess(null); navigate('/kiosk'); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
      <h2 className="text-2xl font-bold mb-2 text-center">Check in</h2>
      <p className="text-white/60 text-sm text-center mb-6">Enter the pass code from your invitation or approval email</p>
      <form onSubmit={submit} className="space-y-5">
        <input
          type="text"
          value={passCode}
          onChange={(e) => setPassCode(e.target.value.toUpperCase())}
          placeholder="Pass code"
          aria-label="Pass code"
          className="w-full px-4 py-4 rounded-xl bg-white/10 border border-white/20 text-white text-center text-2xl tracking-widest uppercase placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
          autoComplete="off"
          required
        />
        <label className="flex items-start gap-3 text-sm text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            className="mt-1"
          />
          <span>I acknowledge the privacy notice and consent to visitor data processing for site access and security.</span>
        </label>
        <div className="flex justify-center">
          <LoadingButton
            type="submit"
            loading={loading}
            icon={LogIn}
            iconOnly
            aria-label="Check in"
            variant="primary"
            size="lg"
            className="bg-white text-gray-900 hover:bg-gray-100 border-white"
          />
        </div>
      </form>
      <div className="flex justify-center mt-6">
        <IconButton icon={ArrowLeft} label="Back" tooltip="Back" variant="ghost" className="text-white hover:bg-white/10" onClick={() => navigate('/kiosk')} />
      </div>
    </div>
  );
}
