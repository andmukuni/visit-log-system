import { Link } from 'react-router-dom';
import { Eye, LogIn, LogOut, Send, Users } from 'lucide-react';
import { IconButton, LoadingButton } from '../ui';
import {
  getReceptionVisitAction,
  receptionActionButtonClass,
  receptionActionHref,
} from '../../../shared/visitReceptionActions.js';
import { isCheckoutEligible } from '../../../shared/visitCheckout.js';

const RECEPTION_ACTION_ICONS = {
  'check-in': LogIn,
  send: Send,
  queue: Users,
};

export default function ReceptionVisitRowActions({
  row,
  visitId: visitIdProp,
  onCheckOut,
  checkingOut = false,
  showView = true,
  detailPathPrefix = '/reception/visitors',
}) {
  const visitId = visitIdProp || row?.id || row?.visit_id;
  const isRestricted = row?._accessLevel === 'restricted';
  const action = isRestricted ? { show: false } : getReceptionVisitAction(row);
  const actionHref = receptionActionHref(action, visitId);
  const ActionIcon = RECEPTION_ACTION_ICONS[action?.icon] || LogIn;
  const canCheckOut = !isRestricted && Boolean(onCheckOut) && isCheckoutEligible(row);
  const visitorName = row?.full_name || row?.visitor_name || 'visitor';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {action?.show && actionHref ? (
        action.disabled ? (
          <span className="inline-flex items-center rounded-lg border border-navy-200 bg-navy-100 px-2.5 py-1.5 text-xs font-semibold text-navy-600">
            {action.label}
          </span>
        ) : (
          <Link
            to={actionHref}
            aria-label={`${action.label} ${visitorName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <LoadingButton
              size="sm"
              icon={ActionIcon}
              iconSize={14}
              className={receptionActionButtonClass(action.tone)}
            >
              {action.label}
            </LoadingButton>
          </Link>
        )
      ) : null}
      {canCheckOut ? (
        <IconButton
          icon={LogOut}
          label="Check out"
          tooltip="Check out"
          size="sm"
          variant="ghost"
          loading={checkingOut}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onCheckOut(row);
          }}
        />
      ) : null}
      {showView && visitId ? (
        <Link
          to={`${detailPathPrefix}/${visitId}`}
          aria-label={`View ${visitorName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton icon={Eye} label="View" tooltip="View" size="sm" variant="ghost" />
        </Link>
      ) : null}
    </div>
  );
}
