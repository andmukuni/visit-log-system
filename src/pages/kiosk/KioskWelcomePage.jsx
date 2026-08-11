import { Link } from 'react-router-dom';
import { LogIn, LogOut } from 'lucide-react';

function KioskTile({ to, icon: Icon, label, primary = false }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`flex flex-col items-center justify-center gap-4 py-12 rounded-2xl transition-colors ${
        primary
          ? 'bg-white text-gray-900 hover:bg-gray-100'
          : 'bg-white/10 hover:bg-white/15 text-white border border-white/20'
      }`}
    >
      <Icon size={40} strokeWidth={1.5} />
      <span className="text-base font-semibold">{label}</span>
    </Link>
  );
}

export default function KioskWelcomePage() {
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold mb-2">Welcome</h2>
      <p className="text-white/70 mb-10">Select an action below</p>
      <div className="grid grid-cols-2 gap-4">
        <KioskTile to="/kiosk/check-in" icon={LogIn} label="Check in" primary />
        <KioskTile to="/kiosk/check-out" icon={LogOut} label="Check out" />
      </div>
    </div>
  );
}
