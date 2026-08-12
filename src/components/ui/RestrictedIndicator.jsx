import { EyeOff } from 'lucide-react';

/** "Restricted by zone" pill — never a "data unavailable" message (Logic.md). */
export default function RestrictedIndicator({ size = 'sm', className = '' }) {
  const sizeClasses = {
    xs: 'text-[9px] px-1 py-px gap-0.5 leading-none',
    sm: 'text-xs px-1.5 py-0.5 gap-1',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset bg-navy-50 text-navy-500 ring-navy-600/15 ${sizeClasses[size] || sizeClasses.sm} ${className}`}
      title="This visit is outside your assigned zone — only name and time are shown."
    >
      <EyeOff size={size === 'xs' ? 9 : 12} aria-hidden="true" />
      Restricted by zone
    </span>
  );
}
