import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import LoadingButton from './LoadingButton';

export default function AlertVisitorPrompt({
  open,
  visitorName = '',
  saving = false,
  savingChoice = null,
  onCancel,
  onChoose,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    dialogRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || saving) return;
      event.preventDefault();
      onCancel?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onCancel]);

  if (!open) return null;

  const name = visitorName.trim() || 'the visitor';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
        aria-label="Cancel without saving"
        onClick={() => {
          if (!saving) onCancel?.();
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-visitor-title"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl border border-navy-100 bg-white p-6 shadow-xl outline-none animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-navy-50 text-cyan-700">
            <Bell size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="alert-visitor-title" className="text-lg font-semibold text-navy-900">
              Alert visitor?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-navy-600">
              Send an SMS to <span className="font-medium text-navy-900">{name}</span> about this
              appointment? Reception is still notified either way.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!saving) onCancel?.();
            }}
            disabled={saving}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-400 transition-colors hover:bg-navy-50 hover:text-navy-700 disabled:opacity-50"
            aria-label="Cancel without saving"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LoadingButton
            variant="secondary"
            loading={saving && savingChoice === false}
            loadingLabel="Saving"
            disabled={saving && savingChoice === true}
            onClick={() => onChoose?.(false)}
          >
            Don't send
          </LoadingButton>
          <LoadingButton
            variant="primary"
            loading={saving && savingChoice === true}
            loadingLabel="Sending"
            disabled={saving && savingChoice === false}
            onClick={() => onChoose?.(true)}
            className="border-navy-800 bg-navy-800 hover:bg-navy-700"
          >
            Send SMS
          </LoadingButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
