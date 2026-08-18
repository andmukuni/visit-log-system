import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { Modal, FormField, LoadingButton } from '../ui';

function visitSummaryLine(visit) {
  const parts = [
    visit?.host_name ? `Host: ${visit.host_name}` : null,
    visit?.department_name ? visit.department_name : null,
    visit?.pass_code ? `Pass ${visit.pass_code}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function ReceiveAtDeskModal({
  isOpen,
  onClose,
  visit,
  submitting = false,
  onConfirm,
  showQueueNext = false,
  onQueueNext,
}) {
  const [badgeNumber, setBadgeNumber] = useState('');

  useEffect(() => {
    if (!isOpen || !visit) return;
    setBadgeNumber(visit.badge_number || '');
  }, [isOpen, visit]);

  const visitorName = visit?.full_name || visit?.visitor_name || 'Visitor';
  const summary = visitSummaryLine(visit);

  const handleConfirm = () => {
    onConfirm?.({ badgeNumber: badgeNumber.trim() || undefined });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Receive at desk"
      subtitle={`Mark ${visitorName} as received at reception`}
      size="md"
      footer={(
        <>
          <LoadingButton variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </LoadingButton>
          {showQueueNext ? (
            <LoadingButton
              variant="secondary"
              onClick={onQueueNext}
              disabled={submitting}
            >
              Queue to host
            </LoadingButton>
          ) : null}
          <LoadingButton
            loading={submitting}
            loadingLabel="Receiving…"
            variant="reception"
            onClick={handleConfirm}
          >
            Receive at desk
          </LoadingButton>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
              <User size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy-900">{visitorName}</p>
              {summary ? <p className="mt-0.5 text-xs text-navy-600">{summary}</p> : null}
              {visit?.purpose ? (
                <p className="mt-1 text-xs text-navy-500">{visit.purpose}</p>
              ) : null}
            </div>
          </div>
        </div>

        <FormField
          label="Badge number"
          name="badgeNumber"
          value={badgeNumber}
          onChange={(e) => setBadgeNumber(e.target.value)}
          placeholder="Optional — assign a visitor badge"
          helpText="Leave blank if no badge is issued."
        />
      </div>
    </Modal>
  );
}
