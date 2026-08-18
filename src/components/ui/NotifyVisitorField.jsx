import { Bell, BellOff } from 'lucide-react';
import SegmentedControl from './SegmentedControl';

/**
 * Per-check-in choice of whether to alert the guest by SMS/email. Guests are
 * only ever notified on check-in and checkout — this is the check-in half of
 * that decision, asked fresh every time rather than defaulted silently.
 */
export default function NotifyVisitorField({
  value,
  onChange,
  label = 'Notify visitor?',
  hint = 'Send the visitor an SMS/email confirming they are checked in.',
  className = '',
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 block text-sm font-medium text-navy-700">{label}</p>
      {hint ? <p className="mb-2 text-xs text-navy-400">{hint}</p> : null}
      <SegmentedControl
        fullWidth
        value={value}
        onChange={onChange}
        options={[
          { value: true, label: 'Notify', icon: Bell },
          { value: false, label: "Don't notify", icon: BellOff },
        ]}
      />
    </div>
  );
}
