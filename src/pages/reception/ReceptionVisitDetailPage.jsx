import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogIn, LogOut, Send, Users } from 'lucide-react';
import { LoadingButton } from '../../components/ui';
import { VisitorDetailView } from '../../components/visitors';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import { scopeReceptionReferenceData } from '../../utils/receptionZoneScope';
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

function ReceptionHeroActions({ visit, onQueueHost, onCheckOut, checkingOut }) {
  const action = getReceptionVisitAction(visit.status);
  const canQueue = ['reception_check_in', 'checked_in'].includes(visit.status);
  const canCheckOut = isCheckoutEligible(visit.status);
  const ActionIcon = RECEPTION_ACTION_ICONS[action?.icon] || LogIn;

  if (!action?.show && !canQueue && !canCheckOut) return null;

  return (
    <>
      {action?.show && action.href && !action.disabled ? (
        <Link
          to={receptionActionHref(action, visit.id)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${receptionActionButtonClass(action.tone)}`}
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
  const [queuing, setQueuing] = useState(false);
  const [visitForModal, setVisitForModal] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkingOut, setCheckingOut] = useState(false);

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

  const renderHeroFooter = (visit) => (
    <ReceptionHeroActions
      visit={visit}
      onQueueHost={() => setQueueOpen(true)}
      onCheckOut={() => handleCheckOut(visit)}
      checkingOut={checkingOut}
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
        )}
      />
    </>
  );
}
