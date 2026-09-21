import { Check, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, DataTable, StatusBadge, Spinner, LoadingButton, IconButton, Modal, FormField, CancelAction } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { securityApi, visitorApi } from '../../utils/visitorApi';

export default function SecurityApprovalsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVisits(await securityApi.getApprovals());
    } catch (err) {
      setVisits([]);
      toast.error(err.message || 'Unable to load the approval queue.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (row) => {
    setActing(row.id);
    try {
      await visitorApi.approveVisit(row.id);
      toast.success(`${row.full_name || 'Visit'} approved.`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not approve visit.');
    } finally {
      setActing(null);
    }
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason.');
      return;
    }
    setRejecting(true);
    try {
      await visitorApi.rejectVisit(rejectTarget.id, rejectReason.trim());
      toast.success('Visit rejected.');
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err) {
      toast.error(err.message || 'Could not reject visit.');
    } finally {
      setRejecting(false);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'company', label: 'Company' },
    { key: 'host_name', label: 'Host' },
    { key: 'site_name', label: 'Site' },
    { key: 'purpose', label: 'Purpose' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'created_at',
      label: 'Requested',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex gap-1" data-row-click-ignore="true">
          <LoadingButton
            variant="primary"
            icon={Check}
            iconOnly
            loading={acting === row.id}
            aria-label="Approve"
            onClick={() => approve(row)}
          />
          <IconButton
            icon={X}
            label="Reject"
            tooltip="Reject"
            variant="danger"
            size="sm"
            onClick={() => setRejectTarget(row)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Approval Queue"
        subtitle="Visits awaiting host or security approval across your sites"
        breadcrumbs={[{ label: 'Security', to: '/security' }, { label: 'Approvals' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${visits.length} pending`}>
          <DataTable
            columns={columns}
            data={visits}
            emptyTitle="Queue clear"
            emptyDescription="No visits awaiting approval."
            onRowClick={(row) => navigate(`/security/visitors/${row.id}`)}
          />
        </Card>
      )}

      <Modal
        isOpen={Boolean(rejectTarget)}
        onClose={() => { setRejectTarget(null); setRejectReason(''); }}
        title="Reject visit"
        size="sm"
      >
        <p className="text-sm text-navy-600 mb-4">
          Rejecting visit for <strong>{rejectTarget?.full_name}</strong>. A reason is required.
        </p>
        <FormField
          label="Reason"
          name="rejectReason"
          textarea
          rows={3}
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <CancelAction onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <LoadingButton variant="danger" loading={rejecting} onClick={submitReject}>
            Reject visit
          </LoadingButton>
        </div>
      </Modal>
    </div>
  );
}
