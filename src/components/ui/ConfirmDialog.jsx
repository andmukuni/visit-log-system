import Modal from './Modal';
import { AlertTriangle, Check, X } from 'lucide-react';
import IconButton from './IconButton';
import LoadingButton from './LoadingButton';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex items-start gap-4">
        <div
          className={`p-2.5 rounded-xl flex-shrink-0 ${
            variant === 'danger'
              ? 'bg-red-50 text-red-600'
              : 'bg-gray-50 text-gray-700'
          }`}
        >
          <AlertTriangle size={20} />
        </div>
        <p className="text-sm text-gray-600 leading-relaxed pt-1">{message}</p>
      </div>
      <div className="flex items-center justify-end gap-2 mt-6">
        <IconButton icon={X} label={cancelLabel} tooltip={cancelLabel} variant="ghost" onClick={onClose} disabled={loading} />
        <LoadingButton
          variant={variant === 'danger' ? 'danger' : 'primary'}
          icon={Check}
          iconOnly
          loading={loading}
          aria-label={confirmLabel}
          onClick={onConfirm}
        />
      </div>
    </Modal>
  );
}
