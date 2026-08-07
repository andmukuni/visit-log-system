import { Outlet, useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import IconButton from '../components/ui/IconButton';

export default function KioskLayout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400">VM360</p>
          <h1 className="text-lg font-semibold">Visitor Kiosk</h1>
        </div>
        <IconButton
          icon={RotateCcw}
          label="Start over"
          tooltip="Start over"
          variant="ghost"
          className="text-white hover:bg-white/10"
          onClick={() => navigate('/kiosk')}
        />
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <Outlet />
        </div>
      </main>
      <footer className="px-6 py-3 text-center text-xs text-white/40">
        Session clears automatically after each visitor
      </footer>
    </div>
  );
}
