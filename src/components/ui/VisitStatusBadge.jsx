import { resolveVisitStatusDisplay } from '../../../shared/visitJourney.js';
import { visitHasCheckedIn } from '../../../shared/visitCheckout.js';
import StatusBadge from './StatusBadge';

/** Visit row badge — uses journey vocabulary (e.g. on-site queue → "On site"). */
export default function VisitStatusBadge({
  visit = null,
  status,
  hasCheckedIn,
  ...props
}) {
  const rawStatus = status ?? visit?.status ?? visit?.visit_status;
  const checkedIn = hasCheckedIn ?? visitHasCheckedIn(visit);
  const display = resolveVisitStatusDisplay(rawStatus, checkedIn);

  return (
    <StatusBadge
      status={display.status}
      label={display.label ?? undefined}
      {...props}
    />
  );
}
