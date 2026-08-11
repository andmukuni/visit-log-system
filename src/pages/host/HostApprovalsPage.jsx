import { Check, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, DataTable, StatusBadge, Spinner, LoadingButton, IconButton, Modal, FormField, CancelAction } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { hostApi } from '../../utils/visitorApi';

export default function HostApprovalsPage() {
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
      setVisits(await hostApi.getApprovals());
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (row) => {
    setActing(row.id);
    try {
      await hostApi.approveVisit(row.id);
      toast.success(
        row.checked_in_at
          ? 'Visitor accepted and added to your timeline.'
          : 'Visit approved. The visitor may now check in at reception.',
      );
      load();
    } catch (err) {
      toast.error(err.message);
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
      await hostApi.rejectVisit(rejectTarget.id, rejectReason.trim());
      toast.success('Visit rejected.');
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRejecting(false);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'company', label: 'Company' },
    { key: 'purpose', label: 'Purpose' },
    {
      key: 'source',
      label: 'Source',
      render: (_, row) => (row.checked_in_at ? 'Reception queue' : 'Invite / booking'),
    },
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
        <div className="flex gap-1">
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
        title="Approval Requests"
        subtitle="Reception queues and invite requests waiting for your decision"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'Approvals' }]}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={visits}
            emptyTitle="No pending approvals"
            emptyDescription="All caught up!"
            onRowClick={(row) => navigate(`/host/visitors/${row.id}`)}
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
          onChange={(e) => setRejectReason(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2 mt-4">
          <CancelAction onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <LoadingButton
            variant="danger"
            icon={X}
            iconOnly
            loading={rejecting}
            aria-label="Reject visit"
            onClick={submitReject}
          />
        </div>
      </Modal>
    </div>
  );
}
