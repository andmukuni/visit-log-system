import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { LoadingButton } from '../../components/ui';
import { VisitorDetailView } from '../../components/visitors';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import { useToast } from '../../context/ToastContext';
import { receptionApi, visitorApi } from '../../utils/visitorApi';
import {
  getReceptionVisitAction,
  receptionActionButtonClass,
  receptionActionHref,
} from '../../../shared/visitReceptionActions.js';

function ReceptionHeroActions({ visit, onQueueHost }) {
  const action = getReceptionVisitAction(visit.status);
  const canQueue = ['reception_check_in', 'checked_in'].includes(visit.status);

  if (!action?.show && !canQueue) return null;

  return (
    <>
      {action?.show && action.href && !action.disabled ? (
        <Link
          to={receptionActionHref(action, visit.id)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${receptionActionButtonClass(action.tone)}`}
        >
          {action.stage === 'gate' || action.stage === 'expected' ? (
            <LogIn size={16} aria-hidden="true" />
          ) : (
            <UserPlus size={16} aria-hidden="true" />
          )}
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
          icon={UserPlus}
          onClick={onQueueHost}
          className="border-cyan-600 bg-cyan-600 hover:bg-cyan-500"
        >
          Queue to host
        </LoadingButton>
      ) : null}
      <Link
        to="/reception/check-in"
        className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50"
      >
        <LogIn size={15} aria-hidden="true" />
        Check-in desk
      </Link>
      <Link
        to="/reception/host-queue"
        className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50"
      >
        Host queue
      </Link>
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

  const fetchVisit = useCallback(async (visitId) => {
    const [visitData, ref] = await Promise.all([
      visitorApi.getVisit(visitId),
      receptionApi.getReferenceData().catch(() => ({})),
    ]);
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
      await receptionApi.queueToHost(visitForModal.id, payload);
      toast.success('Visitor sent to host for approval.');
      setQueueOpen(false);
      setReloadKey((value) => value + 1);
      navigate('/reception/host-queue');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQueuing(false);
    }
  };

  const renderHeroFooter = useMemo(
    () => (visit) => (
      <ReceptionHeroActions visit={visit} onQueueHost={() => setQueueOpen(true)} />
    ),
    [],
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
