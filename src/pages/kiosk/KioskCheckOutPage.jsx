import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Check, ArrowLeft } from 'lucide-react';
import { LoadingButton, IconButton } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { kioskApi } from '../../utils/kioskApi';

export default function KioskCheckOutPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [passCode, setPassCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await kioskApi.checkOut({ passCode: passCode.trim() });
      setPassCode('');
      setDone(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center bg-white/5 rounded-2xl p-10 border border-cyan-500/30">
        <h2 className="text-2xl font-bold text-cyan-300 mb-4">Thank you</h2>
        <p className="text-white/80">You have been checked out safely.</p>
        <div className="mt-8 flex justify-center">
          <IconButton
            icon={Check}
            label="Done"
            tooltip="Done"
            variant="primary"
            className="bg-white text-gray-900 hover:bg-gray-100"
            onClick={() => { setDone(false); navigate('/kiosk'); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
      <h2 className="text-2xl font-bold mb-2 text-center">Check out</h2>
      <p className="text-white/60 text-sm text-center mb-6">Enter your pass code to leave the site</p>
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
        <div className="flex justify-center">
          <LoadingButton
            type="submit"
            loading={loading}
            icon={LogOut}
            iconOnly
            aria-label="Check out"
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
