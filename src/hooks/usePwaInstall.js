import { useCallback, useEffect, useMemo, useState } from 'react';

const DISMISS_KEY = 'pwa_install_dismissed_until';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

function isDismissed() {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

export function usePwaInstall({ enabled = true } = {}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandaloneMode());
  const [dismissed, setDismissed] = useState(isDismissed());
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!enabled || installed) return undefined;

    const onBeforeInstall = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [enabled, installed]);

  const canInstall = Boolean(deferredPrompt) && !installed;
  const showBanner = enabled && !installed && !dismissed;
  const showIosHint = enabled && !installed && !deferredPrompt && isIosSafari() && !dismissed;

  const install = useCallback(async () => {
    if (!deferredPrompt) return { ok: false, reason: 'unavailable' };
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setInstalled(true);
        setDeferredPrompt(null);
        return { ok: true };
      }
      return { ok: false, reason: 'dismissed' };
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      // ignore storage failures
    }
    setDismissed(true);
  }, []);

  const resetDismissOnLogin = useCallback(() => {
    setDismissed(isDismissed());
  }, []);

  return useMemo(() => ({
    installed,
    canInstall,
    showBanner: showBanner && (canInstall || showIosHint),
    showIosHint,
    installing,
    install,
    dismiss,
    resetDismissOnLogin,
  }), [installed, canInstall, showBanner, showIosHint, installing, install, dismiss, resetDismissOnLogin]);
}
