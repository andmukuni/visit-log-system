import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { LoadingButton, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { kioskApi } from '../../utils/kioskApi';

function decisionLabel(decision) {
  if (decision === 'approved') return 'approved';
  if (decision === 'rejected') return 'rejected';
  return decision || 'decided';
}

export default function HostApprovalPage() {
  const { token } = useParams();
  const toast = useToast();
  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [completed, setCompleted] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kioskApi.getHostApproval(token);
      setVisit(data);
      if (data?.already_decided) {
        setCompleted(data.decision === 'rejected' ? 'rejected' : 'approved');
      }
    } catch (err) {
      toast.error(err.message);
      setVisit(null);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async () => {
    setApproving(true);
    try {
      const data = await kioskApi.approveHostApproval(token);
      setCompleted('approved');
      setVisit((current) => ({ ...current, ...data, already_decided: true, decision: 'approved', active: false }));
    } catch (err) {
      if (err.data?.already_decided || err.data?.payload?.already_decided) {
        setCompleted(err.data?.decision === 'rejected' ? 'rejected' : 'approved');
        setVisit((current) => ({ ...current, ...(err.data?.payload || {}), already_decided: true, active: false }));
        return;
      }
      toast.error(err.message);
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason.');
      return;
    }
    setRejecting(true);
    try {
      const data = await kioskApi.rejectHostApproval(token, rejectReason.trim());
      setCompleted('rejected');
      setVisit((current) => ({ ...current, ...data, already_decided: true, decision: 'rejected', active: false }));
    } catch (err) {
      if (err.data?.already_decided || err.data?.payload?.already_decided) {
        setCompleted(err.data?.decision === 'rejected' ? 'rejected' : 'approved');
        return;
      }
      toast.error(err.message);
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Spinner size={32} />
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-8 text-center">
        <div>
          <h1 className="text-xl font-bold mb-2">Approval link not found</h1>
          <p className="text-white/60">This link may have expired or already been used.</p>
        </div>
      </div>
    );
  }

  if (visit.expired && !visit.already_decided) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-8 text-center">
        <div>
          <h1 className="text-xl font-bold mb-2">Approval link expired</h1>
          <p className="text-white/60">Ask reception to send a new approval request.</p>
        </div>
      </div>
    );
  }

  const canDecide = visit.active !== false && !visit.already_decided && !completed;

  if (completed || visit.already_decided) {
    const decision = completed || visit.decision;
    const approved = decision === 'approved';
    const isGuestApproval = visit.kind === 'guest';
    const isGuestRejection = !approved && isGuestApproval;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-8">
        <div className={`max-w-md text-center rounded-2xl p-10 border ${
          approved ? 'bg-white/5 border-green-500/30' : 'bg-white/5 border-red-500/30'
        }`}
        >
          <h1 className={`text-2xl font-bold mb-4 ${approved ? 'text-green-300' : 'text-red-300'}`}>
            {approved
              ? (isGuestApproval ? 'Guest accepted' : 'Visitor approved')
              : (isGuestRejection ? 'Guest returned to reception' : 'Visitor rejected')}
          </h1>
          <p className="text-white/80">
            {approved && isGuestApproval
              ? `${visit.visitor_name || 'The guest'} is on their way to you. Reception has been notified.`
              : isGuestRejection
                ? `${visit.visitor_name || 'The guest'} is back at reception. Reception can re-queue or reschedule.`
                : `${visit.visitor_name || 'This visitor'} has been ${decisionLabel(decision)}. Reception has been notified.`}
          </p>
        </div>
      </div>
    );
  }

  if (!canDecide) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-8 text-center">
        <div>
          <h1 className="text-xl font-bold mb-2">Approval link not active</h1>
          <p className="text-white/60">Ask reception to send a new approval request.</p>
        </div>
      </div>
    );
  }

  const kindLabel = visit.kind === 'guest' ? 'Guest at reception' : 'Appointment';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white/5 rounded-2xl p-8 border border-white/10">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-2">{kindLabel}</p>
        <h1 className="text-2xl font-bold mb-1">Approve visitor</h1>
        <p className="text-white/60 text-sm mb-6">
          {visit.host_name ? `For ${visit.host_name}` : 'Host approval'}
          {visit.site_name ? ` · ${visit.site_name}` : ''}
        </p>

        <div className="space-y-3 mb-8 text-sm">
          <p><span className="text-white/50">Visitor:</span> {visit.visitor_name || '—'}</p>
          <p><span className="text-white/50">Company:</span> {visit.company || '—'}</p>
          <p><span className="text-white/50">Purpose:</span> {visit.purpose || '—'}</p>
          <p><span className="text-white/50">Expected:</span> {visit.expected_at ? formatDateTime(visit.expected_at) : 'Now'}</p>
        </div>

        {showReject ? (
          <div className="space-y-4">
            <label className="block text-sm text-white/70">
              Rejection reason
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="mt-2 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30"
                placeholder="Why are you rejecting this visitor?"
              />
            </label>
            <div className="flex gap-3">
              <LoadingButton
                loading={rejecting}
                onClick={reject}
                icon={X}
                variant="danger"
                size="lg"
                className="flex-1"
              >
                Reject
              </LoadingButton>
              <LoadingButton
                onClick={() => setShowReject(false)}
                variant="secondary"
                size="lg"
                className="flex-1 bg-white/10 text-white border-white/20 hover:bg-white/15"
              >
                Back
              </LoadingButton>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <LoadingButton
              loading={approving}
              onClick={approve}
              icon={Check}
              variant="reception"
              size="lg"
              className="flex-1"
            >
              Approve
            </LoadingButton>
            <LoadingButton
              onClick={() => setShowReject(true)}
              icon={X}
              variant="danger"
              size="lg"
              className="flex-1"
            >
              Reject
            </LoadingButton>
          </div>
        )}
      </div>
    </div>
  );
}
