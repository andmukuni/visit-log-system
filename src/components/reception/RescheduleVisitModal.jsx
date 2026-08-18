import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Modal, FormField, LoadingButton } from '../ui';
import { formatDateTime } from '../../utils/helpers';

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function RescheduleVisitModal({
  isOpen,
  onClose,
  visit,
  submitting = false,
  onConfirm,
}) {
  const [expectedAt, setExpectedAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !visit) return;
    setExpectedAt(toDatetimeLocalValue(visit.expected_at || visit.appointment_scheduled_at));
    setReason('');
    setError('');
  }, [isOpen, visit]);

  const visitorName = visit?.full_name || visit?.visitor_name || 'Visitor';

  const handleConfirm = () => {
    if (!expectedAt.trim()) {
      setError('Choose a new date and time.');
      return;
    }
    const parsed = new Date(expectedAt);
    if (Number.isNaN(parsed.getTime())) {
      setError('Invalid date/time.');
      return;
    }
    onConfirm?.({
      expectedAt: parsed.toISOString(),
      reason: reason.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reschedule visit"
      subtitle={`Set a new expected time for ${visitorName}`}
      size="md"
      footer={(
        <>
          <LoadingButton variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </LoadingButton>
          <LoadingButton
            loading={submitting}
            loadingLabel="Saving…"
            variant="reception"
            icon={CalendarClock}
            onClick={handleConfirm}
          >
            Save new time
          </LoadingButton>
        </>
      )}
    >
      <div className="space-y-4">
        {visit?.expected_at ? (
          <p className="text-sm text-navy-600">
            Current expected time:{' '}
            <span className="font-medium text-navy-900">{formatDateTime(visit.expected_at)}</span>
          </p>
        ) : (
          <p className="text-sm text-navy-600">
            No expected time is set yet. Choose when this visitor should meet their host.
          </p>
        )}

        <FormField
          label="New date & time"
          name="expectedAt"
          type="datetime-local"
          value={expectedAt}
          onChange={(e) => {
            setExpectedAt(e.target.value);
            setError('');
          }}
          required
        />

        <FormField
          label="Reason (optional)"
          name="reason"
          textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Host unavailable — visitor will return later"
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
