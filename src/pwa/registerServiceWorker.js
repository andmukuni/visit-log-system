import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker() {
  const enableInDev = import.meta.env.VITE_PWA_DEV === '1';
  if (import.meta.env.DEV && !enableInDev) return undefined;

  return registerSW({
    immediate: true,
    onOfflineReady() {
      // App shell cached — no UI needed for v1.
    },
  });
}
