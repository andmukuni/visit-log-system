/** Reception portal — primary action label/href per visit status stage. */

export function normalizeVisitStatus(raw) {
  return String(raw || '').toLowerCase().trim();
}

/**
 * @returns {{
 *   stage: 'gate'|'expected'|'reception'|'queue'|'host'|'done'|'unknown',
 *   label: string,
 *   loadingLabel?: string,
 *   href: string|null,
 *   show: boolean,
 *   disabled?: boolean,
 *   tone?: 'emerald'|'cyan'|'muted',
 *   icon?: 'check-in'|'send'|'queue',
 * }}
 */
export function getReceptionVisitAction(rawStatus) {
  const status = normalizeVisitStatus(rawStatus);

  switch (status) {
    case 'arrived_at_gate':
    case 'entered_premises':
      return {
        stage: 'gate',
        label: 'Receive at desk',
        loadingLabel: 'Receiving…',
        href: '/reception/check-in',
        show: true,
        tone: 'emerald',
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
        show: true,
        tone: 'emerald',
        icon: 'check-in',
      };
    case 'pending_approval':
      return {
        stage: 'expected',
        label: 'Awaiting approval',
        href: '/reception/approvals',
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
        show: true,
        tone: 'cyan',
        icon: 'send',
      };
    case 'waiting':
      return {
        stage: 'queue',
        label: 'View host queue',
        href: '/reception/host-queue',
        show: true,
        tone: 'cyan',
        icon: 'queue',
      };
    case 'in_meeting':
      return {
        stage: 'host',
        label: 'With host',
        href: '/reception/host-queue',
        show: true,
        disabled: true,
        tone: 'muted',
        icon: 'queue',
      };
    case 'checked_out':
    case 'left_premises':
    case 'completed':
    case 'rejected':
    case 'cancelled':
    case 'denied':
    case 'expired':
    case 'overdue':
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
        show: true,
        tone: 'emerald',
        icon: 'check-in',
      };
  }
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

export function receptionActionButtonClass(tone = 'emerald') {
  if (tone === 'cyan') {
    return 'bg-cyan-600 hover:bg-cyan-500 border-cyan-600';
  }
  if (tone === 'muted') {
    return 'bg-navy-100 text-navy-600 hover:bg-navy-200 border-navy-200 cursor-default';
  }
  return 'bg-emerald-600 hover:bg-emerald-500 border-emerald-600';
}
