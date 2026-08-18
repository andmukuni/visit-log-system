function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
}

export async function subscribeToPushNotifications({ getVapidPublicKey, subscribePush }) {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied', permission };
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return { ok: false, reason: 'no_service_worker' };
  }

  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) {
    return { ok: false, reason: 'no_vapid_key' };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  await subscribePush({
    endpoint: json.endpoint,
    keys: json.keys,
  });

  return { ok: true, permission, endpoint: json.endpoint };
}

export async function unsubscribeFromPushNotifications({ unsubscribePush }) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const registration = await getServiceWorkerRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (!subscription) return { ok: true, skipped: true };

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await unsubscribePush({ endpoint });
  return { ok: true };
}
