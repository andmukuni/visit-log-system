import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, LogIn, LogOut, Send, Users, XCircle } from 'lucide-react';
import ReceiveAtDeskModal from './ReceiveAtDeskModal';
import QueueToHostModal from './QueueToHostModal';
import { ConfirmDialog, IconButton, LoadingButton } from '../ui';
import { useToast } from '../../context/ToastContext';
import { receptionApi, visitorApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import { scopeReceptionReferenceData } from '../../utils/receptionZoneScope';
import {
  getReceptionVisitAction,
  isQueueToHostAction,
  isReceiveAtDeskAction,
  isCheckoutAction,
  isConfirmLeftAction,
  receptionActionButtonClass,
  receptionActionHref,
} from '../../../shared/visitReceptionActions.js';
import { isCheckoutEligible, isConfirmLeftEligible } from '../../../shared/visitCheckout.js';
import { isCancelEligible } from '../../../shared/visitCancel.js';

const RECEPTION_ACTION_ICONS = {
  'check-in': LogIn,
  send: Send,
  queue: Users,
};

export default function ReceptionVisitRowActions({
  row,
  visitId: visitIdProp,
  onCheckOut,
  checkingOut: checkingOutProp = false,
  showView = true,
  detailPathPrefix = '/reception/visitors',
  onRefresh,
}) {
  const toast = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmLeftOpen, setConfirmLeftOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [confirmingLeft, setConfirmingLeft] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [hosts, setHosts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [offices, setOffices] = useState([]);
  const [refLoaded, setRefLoaded] = useState(false);

  const visitId = visitIdProp || row?.id || row?.visit_id;
  const isRestricted = row?._accessLevel === 'restricted';
  const action = isRestricted ? { show: false } : getReceptionVisitAction(row);
  const actionHref = receptionActionHref(action, visitId);
  const isReceiveModal = isReceiveAtDeskAction(action);
  const isQueueModal = isQueueToHostAction(action);
  const ActionIcon = RECEPTION_ACTION_ICONS[action?.icon] || LogIn;
  const isPrimaryCheckout = isCheckoutAction(action);
  const isPrimaryConfirmLeft = isConfirmLeftAction(action);
  const canCheckOut = !isRestricted && isCheckoutEligible(row);
  const canConfirmLeft = !isRestricted && isConfirmLeftEligible(row);
  const canCancel = !isRestricted && isCancelEligible(row);
  const visitorName = row?.full_name || row?.visitor_name || 'visitor';

  const ensureQueueReferenceData = useCallback(async () => {
    if (refLoaded) return;
    const rawRef = await receptionApi.getReferenceData().catch(() => ({}));
    const ref = scopeReceptionReferenceData(rawRef);
    setHosts(ref.hosts || []);
    setDepartments(ref.departments || []);
    setOffices(ref.offices || []);
    setRefLoaded(true);
  }, [refLoaded]);

  const handleReceiveConfirm = async ({ badgeNumber, notifyVisitor }) => {
    if (!visitId) return;
    setReceiving(true);
    try {
      await visitorApi.checkInVisit(visitId, badgeNumber, notifyVisitor);
      toast.success(`${visitorName} received at reception.`);
      setReceiveOpen(false);
      await onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Could not receive visitor at desk.');
    } finally {
      setReceiving(false);
    }
  };

  const handleQueueConfirm = async (payload) => {
    if (!visitId) return;
    setQueuing(true);
    try {
      const result = await receptionApi.queueToHost(visitId, payload);
      toastHostApprovalRequested(toast, result, 'Visitor sent to host for approval.');
      setQueueOpen(false);
      await onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Could not queue visitor to host.');
    } finally {
      setQueuing(false);
    }
  };

  const handleCheckOut = async () => {
    if (!visitId) return;
    setCheckingOut(true);
    try {
      if (onCheckOut) {
        await onCheckOut(row);
      } else {
        const result = await receptionApi.checkOutVisit(visitId);
        toast.success(result?.message || `${visitorName} checked out.`);
        await onRefresh?.();
      }
      setCheckoutOpen(false);
    } catch (err) {
      toast.error(err?.message || 'Could not check out visitor.');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleConfirmLeft = async () => {
    if (!visitId) return;
    setConfirmingLeft(true);
    try {
      await receptionApi.markLeftPremises(visitId);
      toast.success(`${visitorName} has left the premises.`);
      setConfirmLeftOpen(false);
      await onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Could not confirm departure.');
    } finally {
      setConfirmingLeft(false);
    }
  };

  const handleCancel = async () => {
    if (!visitId) return;
    setCancelling(true);
    try {
      await receptionApi.cancelVisit(visitId);
      toast.success(`${visitorName} cancelled.`);
      setCancelOpen(false);
      await onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Could not cancel visit.');
    } finally {
      setCancelling(false);
    }
  };

  const openQueueModal = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    await ensureQueueReferenceData();
    setQueueOpen(true);
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

    if (isQueueModal) {
      return (
        <>
          <LoadingButton
            size="sm"
            variant="reception"
            icon={ActionIcon}
            iconSize={14}
            aria-label={`${action.label} ${visitorName}`}
            onClick={openQueueModal}
          >
            {action.label}
          </LoadingButton>
          <QueueToHostModal
            isOpen={queueOpen}
            onClose={() => !queuing && setQueueOpen(false)}
            visit={row}
            hosts={hosts}
            departments={departments}
            offices={offices}
            submitting={queuing}
            onConfirm={handleQueueConfirm}
          />
        </>
      );
    }

    if (isPrimaryCheckout || isPrimaryConfirmLeft) {
      return (
        <LoadingButton
          size="sm"
          variant="reception"
          icon={LogOut}
          iconSize={14}
          aria-label={`${action.label} ${visitorName}`}
          loading={isPrimaryCheckout ? (checkingOut || checkingOutProp) : confirmingLeft}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (isPrimaryCheckout) setCheckoutOpen(true);
            else setConfirmLeftOpen(true);
          }}
        >
          {action.label}
        </LoadingButton>
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
      {canCheckOut && !isPrimaryCheckout ? (
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
            setCheckoutOpen(true);
          }}
        />
      ) : null}
      {canConfirmLeft && !isPrimaryConfirmLeft ? (
        <IconButton
          icon={LogOut}
          label="Confirm left"
          tooltip="Confirm left"
          size="sm"
          variant="ghost"
          loading={confirmingLeft}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setConfirmLeftOpen(true);
          }}
        />
      ) : null}
      {canCancel ? (
        <IconButton
          icon={XCircle}
          label="Cancel visit"
          tooltip="Cancel visit"
          size="sm"
          variant="ghost"
          loading={cancelling}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setCancelOpen(true);
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={checkoutOpen}
        onClose={() => !checkingOut && setCheckoutOpen(false)}
        onConfirm={handleCheckOut}
        title="Check out this visitor?"
        message="Confirm the visitor is leaving and collect any issued badge."
        confirmLabel="Check out"
        variant="primary"
        loading={checkingOut}
      />
      <ConfirmDialog
        isOpen={confirmLeftOpen}
        onClose={() => !confirmingLeft && setConfirmLeftOpen(false)}
        onConfirm={handleConfirmLeft}
        title="Confirm they have left?"
        message="This will close the visit and mark the visitor as off site."
        confirmLabel="Confirm left"
        variant="primary"
        loading={confirmingLeft}
      />
      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => !cancelling && setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancel this visit?"
        message="The visitor will be notified if they have a booking. This cannot be undone."
        confirmLabel="Cancel visit"
        loading={cancelling}
      />
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
