import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LogIn, LogOut } from 'lucide-react';
import { ConfirmDialog, LoadingButton } from '../../components/ui';
import { VisitorDetailView } from '../../components/visitors';
import { visitorApi, securityApi } from '../../utils/visitorApi';
import { useToast } from '../../context/ToastContext';
import { isCheckInEligible } from '../../../shared/visitCheckIn.js';
import { isCheckoutEligible, isConfirmLeftEligible, isGateCheckoutEligible } from '../../../shared/visitCheckout.js';

export default function VisitDetailPage({ portalPrefix = '/station' }) {
  const { id } = useParams();
  const toast = useToast();
  const fetchVisit = portalPrefix === '/security' ? securityApi.getVisit : visitorApi.getVisit;
  const portalLabel = portalPrefix === '/reception'
    ? 'Reception'
    : portalPrefix === '/security'
      ? 'Security'
      : portalPrefix === '/emergency'
        ? 'Emergency'
        : 'Station';
  const listPath = portalPrefix === '/emergency'
    ? `${portalPrefix}/occupancy`
    : `${portalPrefix}/visitors`;
  const listLabel = portalPrefix === '/emergency' ? 'Occupancy' : 'Visitor logs';
  const canAct = portalPrefix === '/station';

  const [reloadKey, setReloadKey] = useState(0);
  const [visitRow, setVisitRow] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmKind, setConfirmKind] = useState(null);

  const loadVisit = useCallback(async (visitId) => {
    const data = await fetchVisit(visitId);
    setVisitRow(data?.visit || data);
    return data?.visit ? data : { visit: data };
  }, [fetchVisit]);

  const runAction = async (kind) => {
    const visit = visitRow;
    if (!visit?.id) return;
    setBusy(kind);
    try {
      if (kind === 'check-in') {
        await visitorApi.checkInVisit(visit.id);
        toast.success(`${visit.full_name || visit.visitor_name || 'Visitor'} checked in.`);
      } else if (kind === 'check-out') {
        await visitorApi.checkOutVisit(visit.id);
        toast.success(`${visit.full_name || visit.visitor_name || 'Visitor'} checked out.`);
      } else if (kind === 'confirm-left') {
        await visitorApi.markLeftPremises(visit.id);
        toast.success(`${visit.full_name || visit.visitor_name || 'Visitor'} has left the premises.`);
      }
      setConfirmKind(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not update visit.');
    } finally {
      setBusy('');
    }
  };

  const renderHeroFooter = (visit) => {
    if (!canAct) return null;
    const showCheckIn = isCheckInEligible(visit.status);
    const showCheckOut = isGateCheckoutEligible(visit) || isCheckoutEligible(visit);
    const showConfirmLeft = isConfirmLeftEligible(visit);
    if (!showCheckIn && !showCheckOut && !showConfirmLeft) return null;
    return (
      <>
        {showCheckIn ? (
          <LoadingButton
            size="md"
            variant="reception"
            icon={LogIn}
            loading={busy === 'check-in'}
            onClick={() => setConfirmKind('check-in')}
          >
            Check in
          </LoadingButton>
        ) : null}
        {showCheckOut && !showConfirmLeft ? (
          <LoadingButton
            size="md"
            variant="secondary"
            icon={LogOut}
            loading={busy === 'check-out'}
            onClick={() => setConfirmKind('check-out')}
            className="border-navy-200"
          >
            Check out
          </LoadingButton>
        ) : null}
        {showConfirmLeft ? (
          <LoadingButton
            size="md"
            variant="secondary"
            icon={LogOut}
            loading={busy === 'confirm-left'}
            onClick={() => setConfirmKind('confirm-left')}
            className="border-navy-200"
          >
            Confirm left
          </LoadingButton>
        ) : null}
      </>
    );
  };

  return (
    <VisitorDetailView
      key={reloadKey}
      visitId={id}
      fetchVisit={loadVisit}
      breadcrumbs={[
        { label: portalLabel, to: portalPrefix },
        { label: listLabel, to: listPath },
        { label: 'Details' },
      ]}
      backTo={listPath}
      backLabel={portalPrefix === '/emergency' ? 'Back to occupancy' : 'Back to logs'}
      renderHeroFooter={renderHeroFooter}
      extraContent={canAct ? (
        <ConfirmDialog
          isOpen={Boolean(confirmKind)}
          onClose={() => !busy && setConfirmKind(null)}
          onConfirm={() => confirmKind && runAction(confirmKind)}
          title={
            confirmKind === 'check-in'
              ? 'Check in this visitor?'
              : confirmKind === 'confirm-left'
                ? 'Confirm they have left?'
                : 'Check out this visitor?'
          }
          message={
            confirmKind === 'check-in'
              ? 'This will receive the visitor at the desk and issue a pass.'
              : confirmKind === 'confirm-left'
                ? 'This will close the visit and mark the visitor as off site.'
                : 'Confirm the visitor is leaving and collect any issued badge.'
          }
          confirmLabel={
            confirmKind === 'check-in'
              ? 'Check in'
              : confirmKind === 'confirm-left'
                ? 'Confirm left'
                : 'Check out'
          }
          variant="primary"
          loading={Boolean(busy)}
        />
      ) : null}
    />
  );
}
