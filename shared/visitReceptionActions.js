import { visitHasCheckedIn } from './visitCheckout.js';

/** Reception portal — primary action label/href per visit status stage. */

export function normalizeVisitStatus(raw) {
  return String(raw || '').toLowerCase().trim();
}

/** Desk can queue a visitor who is checked in, or re-queue an on-site reject. */
export function canQueueVisitToHost(visit) {
  const status = normalizeVisitStatus(visit?.status ?? visit);
  if (['reception_check_in', 'checked_in'].includes(status)) return true;
  if (status === 'rejected' && visitHasCheckedIn(typeof visit === 'object' ? visit : null)) {
    return true;
  }
  return false;
}

/** Reception can send a waiting guest to the host (in meeting). */
export function canMarkInMeeting(visit) {
  return normalizeVisitStatus(visit?.status ?? visit) === 'waiting';
}

/**
 * @returns {{
 *   stage: 'gate'|'expected'|'reception'|'queue'|'host'|'done'|'unknown',
 *   label: string,
 *   loadingLabel?: string,
 *   href: string|null,
 *   actionKind?: 'receive-modal'|'queue-navigate'|'navigate'|'none',
 *   show: boolean,
 *   disabled?: boolean,
 *   tone?: 'emerald'|'cyan'|'muted',
 *   icon?: 'check-in'|'send'|'queue',
 * }}
 */
export function getReceptionVisitAction(rawStatus, visit = null) {
  const status = normalizeVisitStatus(
    typeof rawStatus === 'object' ? rawStatus?.status : rawStatus,
  );
  const visitRow = typeof rawStatus === 'object' ? rawStatus : visit;

  if (status === 'pending_approval' && visitHasCheckedIn(visitRow)) {
    return {
      stage: 'queue',
      label: 'View host queue',
      href: '/reception/host-queue',
      actionKind: 'queue-navigate',
      show: true,
      tone: 'cyan',
      icon: 'queue',
    };
  }

  if (status === 'rejected' && visitHasCheckedIn(visitRow)) {
    return {
      stage: 'reception',
      label: 'Re-queue to host',
      loadingLabel: 'Opening queue…',
      href: '/reception/host-queue',
      actionKind: 'queue-navigate',
      show: true,
      tone: 'cyan',
      icon: 'send',
    };
  }

  switch (status) {
    case 'arrived_at_gate':
    case 'entered_premises':
      return {
        stage: 'gate',
        label: 'Receive at desk',
        loadingLabel: 'Receiving…',
        href: null,
        actionKind: 'receive-modal',
        show: true,
        tone: 'cyan',
        icon: 'check-in',
      };
    case 'approved':
    case 'expected':
    case 'pre_registered':
      return {
        stage: 'expected',
        label: 'Check in',
        loadingLabel: 'Checking in…',
        href: '/reception/check-in',
        actionKind: 'navigate',
        show: true,
        tone: 'cyan',
        icon: 'check-in',
      };
    case 'pending_approval':
      return {
        stage: 'expected',
        label: 'Awaiting approval',
        href: '/reception/approvals',
        actionKind: 'navigate',
        show: true,
        disabled: true,
        tone: 'muted',
        icon: 'queue',
      };
    case 'reception_check_in':
    case 'checked_in':
      return {
        stage: 'reception',
        label: 'Queue to host',
        loadingLabel: 'Opening queue…',
        href: '/reception/host-queue',
        actionKind: 'queue-navigate',
        show: true,
        tone: 'cyan',
        icon: 'send',
      };
    case 'waiting':
      return {
        stage: 'queue',
        label: 'View host queue',
        href: '/reception/host-queue',
        actionKind: 'queue-navigate',
        show: true,
        tone: 'cyan',
        icon: 'queue',
      };
    case 'in_meeting':
      return {
        stage: 'host',
        label: 'With host',
        href: null,
        show: false,
      };
    case 'overdue':
      return {
        stage: 'host',
        label: 'Overdue',
        href: null,
        show: false,
      };
    case 'checked_out':
    case 'left_premises':
    case 'completed':
    case 'rejected':
    case 'cancelled':
    case 'denied':
    case 'expired':
      return {
        stage: 'done',
        label: '',
        href: null,
        show: false,
      };
    default:
      return {
        stage: 'unknown',
        label: 'Check in',
        loadingLabel: 'Checking in…',
        href: '/reception/check-in',
        actionKind: 'navigate',
        show: true,
        tone: 'cyan',
        icon: 'check-in',
      };
  }
}

/** Whether the primary reception action opens the receive-at-desk modal. */
export function isReceiveAtDeskAction(action) {
  return action?.actionKind === 'receive-modal';
}

/** Desk check-in button copy (gate panel / icon-only actions). */
export function getReceptionCheckInActionLabel(rawStatus) {
  const status = normalizeVisitStatus(rawStatus);
  if (status === 'arrived_at_gate' || status === 'entered_premises') {
    return { label: 'Receive at desk', loadingLabel: 'Receiving…' };
  }
  return { label: 'Check in', loadingLabel: 'Checking in…' };
}

export function receptionActionHref(action, visitId) {
  if (!action?.href) return null;
  if (!visitId) return action.href;
  const sep = action.href.includes('?') ? '&' : '?';
  return `${action.href}${sep}visit=${encodeURIComponent(visitId)}`;
}

export function receptionActionButtonClass(tone = 'cyan') {
  if (tone === 'muted') {
    return 'border border-navy-200 bg-navy-100 text-navy-600 hover:bg-navy-200 cursor-default';
  }
  return 'border border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-500 hover:border-cyan-500';
}
