import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, LogIn, LogOut, Send, Users } from 'lucide-react';
import ReceiveAtDeskModal from './ReceiveAtDeskModal';
import { IconButton, LoadingButton } from '../ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';
import {
  getReceptionVisitAction,
  isReceiveAtDeskAction,
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
  onRefresh,
}) {
  const toast = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const visitId = visitIdProp || row?.id || row?.visit_id;
  const isRestricted = row?._accessLevel === 'restricted';
  const action = isRestricted ? { show: false } : getReceptionVisitAction(row);
  const actionHref = receptionActionHref(action, visitId);
  const isReceiveModal = isReceiveAtDeskAction(action);
  const ActionIcon = RECEPTION_ACTION_ICONS[action?.icon] || LogIn;
  const canCheckOut = !isRestricted && Boolean(onCheckOut) && isCheckoutEligible(row);
  const visitorName = row?.full_name || row?.visitor_name || 'visitor';

  const handleReceiveConfirm = async ({ badgeNumber }) => {
    if (!visitId) return;
    setReceiving(true);
    try {
      await visitorApi.checkInVisit(visitId, badgeNumber);
      toast.success(`${visitorName} received at reception.`);
      setReceiveOpen(false);
      await onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Could not receive visitor at desk.');
    } finally {
      setReceiving(false);
    }
  };

  const renderPrimaryAction = () => {
    if (!action?.show) return null;

    if (action.disabled) {
      return (
        <span className="inline-flex items-center rounded-lg border border-navy-200 bg-navy-100 px-2.5 py-1.5 text-xs font-semibold text-navy-600">
          {action.label}
        </span>
      );
    }

    if (isReceiveModal) {
      return (
        <>
          <LoadingButton
            size="sm"
            variant="reception"
            icon={ActionIcon}
            iconSize={14}
            aria-label={`${action.label} ${visitorName}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setReceiveOpen(true);
            }}
          >
            {action.label}
          </LoadingButton>
          <ReceiveAtDeskModal
            isOpen={receiveOpen}
            onClose={() => !receiving && setReceiveOpen(false)}
            visit={row}
            submitting={receiving}
            onConfirm={handleReceiveConfirm}
          />
        </>
      );
    }

    if (!actionHref) return null;

    return (
      <Link
        to={actionHref}
        aria-label={`${action.label} ${visitorName}`}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors ${receptionActionButtonClass(action.tone)}`}
      >
        <ActionIcon size={14} aria-hidden="true" />
        {action.label}
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {renderPrimaryAction()}
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
