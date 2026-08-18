import { Download, Smartphone, X } from 'lucide-react';
import { APP_NAME_SHORT, LOGO_PATH } from '../../../shared/branding.js';
import { LoadingButton } from '../ui';

export default function PwaInstallBanner({
  visible,
  canInstall,
  showIosHint,
  installing,
  onInstall,
  onDismiss,
}) {
  if (!visible) return null;

  return (
    <div className="relative z-50 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-700 via-cyan-600 to-teal-600 px-4 py-4 text-white shadow-lg sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <img
            src={LOGO_PATH}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl border border-white/20 bg-white/10 object-contain p-1"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-100/90">
              Install app
            </p>
            <h2 className="text-lg font-bold leading-tight sm:text-xl">
              Install {APP_NAME_SHORT} on your computer
            </h2>
            <p className="mt-1 text-sm text-cyan-50/90">
              {showIosHint
                ? 'On iPhone or iPad: tap Share, then Add to Dock for quick access and desktop alerts.'
                : 'Get faster access, a desktop icon, and native notification alerts for visitors and approvals.'}
            </p>
            {showIosHint ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-white/90">
                <Smartphone size={14} aria-hidden="true" />
                Share → Add to Dock
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-stretch sm:self-auto">
          {canInstall ? (
            <LoadingButton
              variant="secondary"
              icon={Download}
              loading={installing}
              loadingLabel="Installing…"
              onClick={onInstall}
              className="flex-1 border-white/30 bg-white text-cyan-800 hover:bg-cyan-50 sm:flex-none"
            >
              Install now
            </LoadingButton>
          ) : null}
          <LoadingButton
            variant="ghost"
            onClick={onDismiss}
            className="border border-white/25 text-white hover:bg-white/10"
          >
            Not now
          </LoadingButton>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white sm:hidden"
            aria-label="Dismiss install banner"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
