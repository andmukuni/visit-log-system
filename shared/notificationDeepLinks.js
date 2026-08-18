/**
 * Resolve a relative in-app URL for a notification click (push or in-app).
 */
export function resolveNotificationDeepLink(metadata = {}) {
  const visitId = metadata.visitId ? String(metadata.visitId) : null;
  const audience = String(metadata.audience || '');
  const eventType = String(metadata.eventType || '');

  if (visitId) {
    if (audience.includes('host') || eventType === 'pending_approval') {
      if (eventType === 'pending_approval') return '/host/approvals';
      return `/host/visitors/${visitId}`;
    }
    if (audience.includes('reception')) {
      return `/reception/visitors/${visitId}`;
    }
    if (audience.includes('security')) {
      return '/station/gate-entry';
    }
    if (audience.includes('executive')) {
      return `/host/visitors/${visitId}`;
    }
    return `/reception/visitors/${visitId}`;
  }

  if (audience.includes('host')) return '/host/notifications';
  if (audience.includes('reception')) return '/reception/notifications';
  if (audience.includes('security')) return '/station/notifications';
  if (audience.includes('executive')) return '/host/notifications';
  return '/login';
}
