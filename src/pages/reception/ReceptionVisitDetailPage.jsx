import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogIn, LogOut, Send, UserCheck, Users, CalendarClock, XCircle } from 'lucide-react';
import { ConfirmDialog, LoadingButton } from '../../components/ui';
import { VisitorDetailView } from '../../components/visitors';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import ReceiveAtDeskModal from '../../components/reception/ReceiveAtDeskModal';
import RescheduleVisitModal from '../../components/reception/RescheduleVisitModal';
import { useToast } from '../../context/ToastContext';
import { receptionApi, visitorApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import { scopeReceptionReferenceData } from '../../utils/receptionZoneScope';
import {
  getReceptionVisitAction,
  canQueueVisitToHost,
  canMarkInMeeting,
  canRescheduleVisit,
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

function ReceptionHeroActions({
  visit,
  onQueueHost,
  onReceiveAtDesk,
  onMarkInMeeting,
  onReschedule,
  onCheckOut,
  onConfirmLeft,
  onCancel,
  checkingOut,
  confirmingLeft,
  markingInMeeting,
}) {
  const action = getReceptionVisitAction(visit);
  const canQueue = canQueueVisitToHost(visit);
  const canMeeting = canMarkInMeeting(visit);
  const canReschedule = canRescheduleVisit(visit);
  const canCheckOut = isCheckoutEligible(visit);
  const canConfirmLeft = isConfirmLeftEligible(visit);
  const canCancel = isCancelEligible(visit);
  const isReceiveModal = isReceiveAtDeskAction(action);
  const isPrimaryCheckout = isCheckoutAction(action);
  const isPrimaryConfirmLeft = isConfirmLeftAction(action);
  const ActionIcon = RECEPTION_ACTION_ICONS[action?.icon] || LogIn;

  if (!action?.show && !canQueue && !canMeeting && !canReschedule && !canCheckOut && !canConfirmLeft && !canCancel) return null;

  return (
    <>
      {action?.show && !action.disabled && !canQueue && isReceiveModal ? (
        <LoadingButton
          size="md"
          variant="reception"
          icon={ActionIcon}
          onClick={onReceiveAtDesk}
        >
          {action.label}
        </LoadingButton>
      ) : null}
      {action?.show && isPrimaryCheckout ? (
        <LoadingButton
          size="md"
          variant="reception"
          icon={LogOut}
          loading={checkingOut}
          onClick={onCheckOut}
        >
          {action.label}
        </LoadingButton>
      ) : null}
      {action?.show && isPrimaryConfirmLeft ? (
        <LoadingButton
          size="md"
          variant="reception"
          icon={LogOut}
          loading={confirmingLeft}
          onClick={onConfirmLeft}
        >
          {action.label}
        </LoadingButton>
      ) : null}
      {action?.show && action.href && !action.disabled && !canQueue && !isReceiveModal && !isPrimaryCheckout && !isPrimaryConfirmLeft ? (
        <Link
          to={receptionActionHref(action, visit.id)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors ${receptionActionButtonClass(action.tone)}`}
        >
          <ActionIcon size={16} aria-hidden="true" />
          {action.label}
        </Link>
      ) : null}
      {action?.show && action.disabled ? (
        <span className="inline-flex items-center rounded-xl border border-navy-200 bg-navy-100 px-4 py-2.5 text-sm font-semibold text-navy-600">
          {action.label}
        </span>
      ) : null}
      {canQueue ? (
        <LoadingButton
          size="md"
          variant="reception"
          icon={Send}
          onClick={onQueueHost}
        >
          Queue to host
        </LoadingButton>
      ) : null}
      {canReschedule ? (
        <LoadingButton
          size="md"
          variant="secondary"
          icon={CalendarClock}
          onClick={onReschedule}
          className="border-navy-200"
        >
          Reschedule
        </LoadingButton>
      ) : null}
      {canMeeting ? (
        <LoadingButton
          size="md"
          icon={UserCheck}
          loading={markingInMeeting}
          onClick={onMarkInMeeting}
          className="border-violet-600 bg-violet-600 hover:bg-violet-500"
        >
          With host
        </LoadingButton>
      ) : null}
      {canCheckOut && !isPrimaryCheckout ? (
        <LoadingButton
          size="md"
          variant="secondary"
          icon={LogOut}
          loading={checkingOut}
          onClick={onCheckOut}
          className="border-navy-200"
        >
          Check out
        </LoadingButton>
      ) : null}
      {canConfirmLeft && !isPrimaryConfirmLeft ? (
        <LoadingButton
          size="md"
          variant="secondary"
          icon={LogOut}
          loading={confirmingLeft}
          onClick={onConfirmLeft}
          className="border-navy-200"
        >
          Confirm left
        </LoadingButton>
      ) : null}
      {canCancel ? (
        <LoadingButton
          size="md"
          variant="secondary"
          icon={XCircle}
          onClick={onCancel}
          className="border-red-200 text-red-700 hover:bg-red-50"
        >
          Cancel visit
        </LoadingButton>
      ) : null}
    </>
  );
}

export default function ReceptionVisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [hosts, setHosts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [offices, setOffices] = useState([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [visitForModal, setVisitForModal] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkingOut, setCheckingOut] = useState(false);
  const [confirmingLeft, setConfirmingLeft] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);
  const [confirmLeftOpen, setConfirmLeftOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [markingInMeeting, setMarkingInMeeting] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const fetchVisit = useCallback(async (visitId) => {
    const [visitData, rawRef] = await Promise.all([
      receptionApi.getVisit(visitId),
      receptionApi.getReferenceData().catch(() => ({})),
    ]);
    const ref = scopeReceptionReferenceData(rawRef);
    setHosts(ref.hosts || []);
    setDepartments(ref.departments || []);
    setOffices(ref.offices || []);
    setVisitForModal(visitData.visit);
    return visitData;
  }, []);

  const handleQueueConfirm = async (payload) => {
    if (!visitForModal?.id) return;
    setQueuing(true);
    try {
      const result = await receptionApi.queueToHost(visitForModal.id, payload);
      toastHostApprovalRequested(toast, result, 'Visitor sent to host for approval.');
      setQueueOpen(false);
      setReloadKey((value) => value + 1);
      navigate('/reception/host-queue');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQueuing(false);
    }
  };

  const handleReceiveConfirm = async ({ badgeNumber, notifyVisitor }) => {
    if (!visitForModal?.id) return;
    setReceiving(true);
    try {
      await visitorApi.checkInVisit(visitForModal.id, badgeNumber, notifyVisitor);
      const name = visitForModal.full_name || visitForModal.visitor_name || 'Visitor';
      toast.success(`${name} received at reception.`);
      setReceiveOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err?.message || 'Could not receive visitor at desk.');
    } finally {
      setReceiving(false);
    }
  };

  const handleCheckOut = async (visit) => {
    if (!visit?.id) return;
    setCheckingOut(true);
    try {
      const result = await receptionApi.checkOutVisit(visit.id);
      toast.success(result?.message || `${visit.full_name || visit.visitor_name || 'Visitor'} checked out.`);
      setCheckoutConfirmOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not check out visitor.');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleConfirmLeft = async (visit) => {
    if (!visit?.id) return;
    setConfirmingLeft(true);
    try {
      await receptionApi.markLeftPremises(visit.id);
      toast.success(`${visit.full_name || visit.visitor_name || 'Visitor'} has left the premises.`);
      setConfirmLeftOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not confirm departure.');
    } finally {
      setConfirmingLeft(false);
    }
  };

  const handleCancelVisit = async (visit) => {
    if (!visit?.id) return;
    setCancelling(true);
    try {
      await receptionApi.cancelVisit(visit.id);
      toast.success(`${visit.full_name || visit.visitor_name || 'Visit'} cancelled.`);
      setCancelOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not cancel visit.');
    } finally {
      setCancelling(false);
    }
  };

  const handleMarkInMeeting = async (visit) => {
    if (!visit?.id) return;
    setMarkingInMeeting(true);
    try {
      await receptionApi.markInMeeting(visit.id);
      toast.success(`${visit.full_name || visit.visitor_name || 'Visitor'} is with the host.`);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not update visit.');
    } finally {
      setMarkingInMeeting(false);
    }
  };

  const handleRescheduleConfirm = async ({ expectedAt, reason }) => {
    if (!visitForModal?.id) return;
    setRescheduling(true);
    try {
      await receptionApi.rescheduleVisit(visitForModal.id, { expectedAt, reason });
      toast.success(`${visitForModal.full_name || visitForModal.visitor_name || 'Visitor'} rescheduled.`);
      setRescheduleOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not reschedule visit.');
    } finally {
      setRescheduling(false);
    }
  };

  const renderHeroFooter = (visit) => (
    <ReceptionHeroActions
      visit={visit}
      onQueueHost={() => setQueueOpen(true)}
      onReceiveAtDesk={() => setReceiveOpen(true)}
      onMarkInMeeting={() => handleMarkInMeeting(visit)}
      onReschedule={() => setRescheduleOpen(true)}
      onCheckOut={() => setCheckoutConfirmOpen(true)}
      onConfirmLeft={() => setConfirmLeftOpen(true)}
      onCancel={() => setCancelOpen(true)}
      checkingOut={checkingOut}
      confirmingLeft={confirmingLeft}
      markingInMeeting={markingInMeeting}
    />
  );

  return (
    <>
      <VisitorDetailView
        key={reloadKey}
        visitId={id}
        fetchVisit={fetchVisit}
        breadcrumbs={[
          { label: 'Reception', to: '/reception' },
          { label: 'Visitor logs', to: '/reception/visitors' },
          { label: 'Details' },
        ]}
        backTo="/reception/visitors"
        backLabel="Back to logs"
        renderHeroFooter={renderHeroFooter}
        extraContent={(
          <>
            <ReceiveAtDeskModal
              isOpen={receiveOpen}
              onClose={() => !receiving && setReceiveOpen(false)}
              visit={visitForModal}
              submitting={receiving}
              onConfirm={handleReceiveConfirm}
              showQueueNext={canQueueVisitToHost(visitForModal)}
              onQueueNext={() => {
                setReceiveOpen(false);
                setQueueOpen(true);
              }}
            />
            <QueueToHostModal
              isOpen={queueOpen}
              onClose={() => !queuing && setQueueOpen(false)}
              visit={visitForModal}
              hosts={hosts}
              departments={departments}
              offices={offices}
              submitting={queuing}
              onConfirm={handleQueueConfirm}
            />
            <RescheduleVisitModal
              isOpen={rescheduleOpen}
              onClose={() => !rescheduling && setRescheduleOpen(false)}
              visit={visitForModal}
              submitting={rescheduling}
              onConfirm={handleRescheduleConfirm}
            />
            <ConfirmDialog
              isOpen={checkoutConfirmOpen}
              onClose={() => !checkingOut && setCheckoutConfirmOpen(false)}
              onConfirm={() => handleCheckOut(visitForModal)}
              title="Check out this visitor?"
              message="Confirm the visitor is leaving and collect any issued badge."
              confirmLabel="Check out"
              variant="primary"
              loading={checkingOut}
            />
            <ConfirmDialog
              isOpen={confirmLeftOpen}
              onClose={() => !confirmingLeft && setConfirmLeftOpen(false)}
              onConfirm={() => handleConfirmLeft(visitForModal)}
              title="Confirm they have left?"
              message="This will close the visit and mark the visitor as off site."
              confirmLabel="Confirm left"
              variant="primary"
              loading={confirmingLeft}
            />
            <ConfirmDialog
              isOpen={cancelOpen}
              onClose={() => !cancelling && setCancelOpen(false)}
              onConfirm={() => handleCancelVisit(visitForModal)}
              title="Cancel this visit?"
              message="The visitor will be notified if they have a booking. This cannot be undone."
              confirmLabel="Cancel visit"
              loading={cancelling}
            />
          </>
        )}
      />
    </>
  );
}
