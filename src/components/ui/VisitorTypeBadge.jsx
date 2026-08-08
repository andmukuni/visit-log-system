import { Crown, User, Users } from 'lucide-react';

const typeMap = {
  standard: {
    label: 'Standard',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    ring: 'ring-sky-600/20',
    icon: User,
  },
  vip: {
    label: 'VIP',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    ring: 'ring-violet-600/20',
    icon: Users,
  },
  vvip: {
    label: 'VVIP',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-600/20',
    icon: Crown,
  },
};

export default function VisitorTypeBadge({
  classification,
  size = 'sm',
  iconOnly = false,
  className = '',
}) {
  const key = String(classification || 'standard').toLowerCase();
  const config = typeMap[key] || typeMap.standard;
  const Icon = config.icon;

  const sizeClasses = {
    xs: 'text-[9px] px-1 py-px gap-0.5 leading-none',
    sm: 'text-sm px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
  };

  const iconSizes = { xs: 9, sm: 14, md: 16 };

  if (iconOnly) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${config.bg} ${config.text} ${config.ring} h-3.5 w-3.5 ${className}`}
        title={config.label}
        aria-label={config.label}
      >
        <Icon size={8} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${config.bg} ${config.text} ${config.ring} ${sizeClasses[size] || sizeClasses.sm} ${className}`}
    >
      <Icon size={iconSizes[size] || iconSizes.sm} aria-hidden="true" />
      {config.label}
    </span>
  );
}
