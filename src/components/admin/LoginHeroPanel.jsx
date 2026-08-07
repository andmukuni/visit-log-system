import {
  BarChart3,
  Bell,
  CalendarClock,
  Car,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { LOGIN_HERO_BG_PATH, LOGO_PATH } from '../../../shared/branding.js';

const FEATURE_CARDS = [
  { key: 'appointments', label: 'Appointments', icon: CalendarClock },
  { key: 'visitors', label: 'Visitors', icon: Users },
  { key: 'vehicles', label: 'Vehicles', icon: Car },
  { key: 'access', label: 'Access Control', icon: ShieldCheck },
];

const BENEFITS = [
  { key: 'secure', label: 'Secure Environment', icon: Shield },
  { key: 'monitoring', label: 'Real-Time Monitoring', icon: BarChart3 },
  { key: 'notifications', label: 'Instant Notifications', icon: Bell },
  { key: 'experience', label: 'Better Experience', icon: UserRound },
];

function FeatureCard({ label, icon: Icon }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-amber-500/35 bg-navy-950/75 px-3 py-5 backdrop-blur-sm">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-lg border border-amber-500/30 bg-navy-900/60 text-amber-400">
        <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="text-center text-[11px] font-bold uppercase tracking-wide text-white xl:text-xs">
        {label}
      </p>
      <span className="mt-2 h-0.5 w-8 rounded-full bg-amber-500/80" aria-hidden="true" />
    </div>
  );
}

function BenefitItem({ label, icon: Icon }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 px-2 py-3 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-amber-400">
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/90 xl:text-[11px]">
        {label}
      </p>
    </div>
  );
}

export default function LoginHeroPanel() {
  return (
    <aside className="relative z-10 hidden lg:flex lg:w-1/2 xl:w-[55%] min-h-screen overflow-hidden [clip-path:polygon(0_0,100%_0,calc(100%-3.5rem)_100%,0_100%)] xl:[clip-path:polygon(0_0,100%_0,calc(100%-4.5rem)_100%,0_100%)] bg-gray-950">
      <img
        src={LOGIN_HERO_BG_PATH}
        alt=""
        width={720}
        height={1080}
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950/80 via-navy-950/70 to-navy-950/90" />

      <div className="relative z-10 flex min-h-screen w-full flex-col px-8 py-10 xl:px-12 xl:py-12 lg:-translate-x-4 xl:-translate-x-5">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <img
            src={LOGO_PATH}
            alt=""
            width={88}
            height={88}
            decoding="async"
            className="mb-6 h-16 w-16 object-contain xl:h-[4.5rem] xl:w-[4.5rem]"
          />

          <h1 className="max-w-xl text-[clamp(1.35rem,2.4vw,2.35rem)] font-black uppercase leading-[1.05] tracking-tight text-white">
            Visitor &amp; Access
            <span className="mt-1 block text-amber-400">Management System</span>
          </h1>

          <div className="my-5 flex w-full max-w-md items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/25 to-white/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent via-white/25 to-white/25" />
          </div>

          <p className="max-w-lg text-sm font-medium text-white/85 xl:text-base">
            Appointments • Visitors • Vehicles • Access Control
          </p>

          <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
            {FEATURE_CARDS.map((item) => (
              <FeatureCard key={item.key} label={item.label} icon={item.icon} />
            ))}
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 bg-navy-950/55 backdrop-blur-sm">
          <div className="grid grid-cols-2 divide-x divide-white/10 xl:grid-cols-4">
            {BENEFITS.map((item) => (
              <BenefitItem key={item.key} label={item.label} icon={item.icon} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
