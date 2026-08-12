import { useEffect, useRef } from 'react';
import { formatVisitHostPositionLine } from '../components/visitors/visitorDetailUtils';
import { useToast } from '../context/ToastContext';
import { formatTime } from '../utils/helpers';
import { visitorApi } from '../utils/visitorApi';

const LEAD_MS = 60 * 60 * 1000;
const POLL_MS = 30_000;
const STORAGE_PREFIX = 'gate-arrival-toast:';

function arrivalAt(row) {
  const raw = row?.expected_at || row?.appointment_scheduled_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function alreadyToasted(visitId) {
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${visitId}`) === '1';
  } catch {
    return false;
  }
}

function markToasted(visitId) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${visitId}`, '1');
  } catch {
    // Ignore quota / private mode.
  }
}

/**
 * Gate kiosk: toast when an expected guest is within the next hour.
 * Complements server pre-arrival notifications (email/SMS/in-app).
 */
export default function useGateArrivalToasts({ enabled = true } = {}) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    const scan = async () => {
      try {
        const rows = await visitorApi.getExpectedArrivals({ range: 'today' });
        if (cancelled || !Array.isArray(rows)) return;

        const now = Date.now();
        for (const row of rows) {
          const when = arrivalAt(row);
          if (!when) continue;
          const ms = when.getTime() - now;
          if (ms <= 0 || ms > LEAD_MS) continue;
          if (alreadyToasted(row.id)) continue;

          const classification = String(row.classification || 'standard').toLowerCase();
          const tier = classification === 'vvip' ? 'VVIP' : classification === 'vip' ? 'VIP' : 'Guest';
          const hostLine = formatVisitHostPositionLine(row, { empty: '' });
          const host = hostLine ? ` for ${hostLine}` : '';
          const plates = row.expected_plates ? ` · ${row.expected_plates}` : '';

          toastRef.current.warning(
            `${tier} arriving at ${formatTime(when)}: ${row.full_name || 'Visitor'}${host}${plates}`,
            {
              id: `gate-arrival-${row.id}`,
              duration: 12_000,
              description: 'Expected guest within the next hour — prepare gate entry.',
            },
          );
          markToasted(row.id);
        }
      } catch {
        // Silent — gate UI should not spam errors while polling.
      }
    };

    void scan();
    const timer = setInterval(() => { void scan(); }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);
}
