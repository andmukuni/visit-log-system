import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { ConfirmDialog, LoadingButton } from '../../components/ui';
import { VisitorDetailView } from '../../components/visitors';
import { executiveApi, hostApi } from '../../utils/visitorApi';
import { useViewerHostId } from '../../hooks/useViewerHostId';
import { useToast } from '../../context/ToastContext';
import { isCancelEligible } from '../../../shared/visitCancel.js';

export default function ExecutiveVisitDetailPage() {
  const { id } = useParams();
  const viewerHostId = useViewerHostId();
  const toast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [visitForCancel, setVisitForCancel] = useState(null);

  const fetchVisit = useCallback(async (visitId) => {
    const data = await executiveApi.getVisit(visitId);
    setVisitForCancel(data.visit);
    return data;
  }, []);

  const handleCancel = async () => {
    const visit = visitForCancel;
    if (!visit?.id) return;
    setCancelling(true);
    try {
      await hostApi.cancelVisit(visit.id);
      toast.success(`${visit.full_name || visit.visitor_name || 'Visit'} cancelled.`);
      setCancelOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(err.message || 'Could not cancel visit.');
    } finally {
      setCancelling(false);
    }
  };

  const renderHeroFooter = (visit) => {
    if (!isCancelEligible(visit)) return null;
    return (
      <LoadingButton
        size="md"
        variant="secondary"
        icon={XCircle}
        onClick={() => setCancelOpen(true)}
        className="border-red-200 text-red-700 hover:bg-red-50"
      >
        Cancel visit
      </LoadingButton>
    );
  };

  return (
    <VisitorDetailView
      key={reloadKey}
      visitId={id}
      fetchVisit={fetchVisit}
      viewerHostId={viewerHostId}
      breadcrumbs={[
        { label: 'Host', to: '/host' },
        { label: 'Visitor register', to: '/host/register' },
        { label: 'Details' },
      ]}
      backTo="/host/register"
      backLabel="Back to register"
      renderHeroFooter={renderHeroFooter}
      extraContent={(
        <ConfirmDialog
          isOpen={cancelOpen}
          onClose={() => !cancelling && setCancelOpen(false)}
          onConfirm={handleCancel}
          title="Cancel this visit?"
          message="The visitor will be notified if they have a booking. This cannot be undone."
          confirmLabel="Cancel visit"
          loading={cancelling}
        />
      )}
    />
  );
}
