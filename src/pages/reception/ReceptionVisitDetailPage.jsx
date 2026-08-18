import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogIn, LogOut, Send, UserCheck, Users } from 'lucide-react';
import { LoadingButton } from '../../components/ui';
import { VisitorDetailView } from '../../components/visitors';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import ReceiveAtDeskModal from '../../components/reception/ReceiveAtDeskModal';
import { useToast } from '../../context/ToastContext';
import { receptionApi, visitorApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import { scopeReceptionReferenceData } from '../../utils/receptionZoneScope';
import {
  getReceptionVisitAction,
  canQueueVisitToHost,
  canMarkInMeeting,
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

function ReceptionHeroActions({
  visit,
  onQueueHost,
  onReceiveAtDesk,
  onMarkInMeeting,
  onCheckOut,
  checkingOut,
  markingInMeeting,
}) {
  const action = getReceptionVisitAction(visit);
  const canQueue = canQueueVisitToHost(visit);
  const canMeeting = canMarkInMeeting(visit);
  const canCheckOut = isCheckoutEligible(visit);
  const isReceiveModal = isReceiveAtDeskAction(action);
  const ActionIcon = RECEPTION_ACTION_ICONS[action?.icon] || LogIn;

  if (!action?.show && !canQueue && !canMeeting && !canCheckOut) return null;

  return (
    <>
      {action?.show && !action.disabled && !canQueue && isReceiveModal ? (
        <LoadingButton
          size="md"
          icon={ActionIcon}
          onClick={onReceiveAtDesk}
          className={`border ${receptionActionButtonClass(action.tone)}`}
        >
          {action.label}
        </LoadingButton>
      ) : null}
      {action?.show && action.href && !action.disabled && !canQueue && !isReceiveModal ? (
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
          icon={Send}
          onClick={onQueueHost}
          className="border-cyan-600 bg-cyan-600 hover:bg-cyan-500"
        >
          Queue to host
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
      {canCheckOut ? (
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
  const [markingInMeeting, setMarkingInMeeting] = useState(false);

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

  const handleReceiveConfirm = async ({ badgeNumber }) => {
    if (!visitForModal?.id) return;
    setReceiving(true);
    try {
      await visitorApi.checkInVisit(visitForModal.id, badgeNumber);
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
      await receptionApi.checkOutVisit(visit.id);
      toast.success(`${visit.full_name || visit.visitor_name || 'Visitor'} checked out.`);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not check out visitor.');
    } finally {
      setCheckingOut(false);
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

  const renderHeroFooter = (visit) => (
    <ReceptionHeroActions
      visit={visit}
      onQueueHost={() => setQueueOpen(true)}
      onReceiveAtDesk={() => setReceiveOpen(true)}
      onMarkInMeeting={() => handleMarkInMeeting(visit)}
      onCheckOut={() => handleCheckOut(visit)}
      checkingOut={checkingOut}
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
          </>
        )}
      />
    </>
  );
}
