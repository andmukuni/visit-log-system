import { useEffect, useState } from 'react';
import { hostApi } from '../utils/visitorApi';

let cachedHostId = null;
let inflight = null;

/** Linked host profile id for the signed-in host-portal user (cached per session). */
export function useViewerHostId() {
  const [hostId, setHostId] = useState(cachedHostId);

  useEffect(() => {
    if (cachedHostId) {
      setHostId(cachedHostId);
      return undefined;
    }

    if (!inflight) {
      inflight = hostApi.getDashboard()
        .then((data) => {
          cachedHostId = data?.host?.id || null;
          return cachedHostId;
        })
        .catch(() => null)
        .finally(() => {
          inflight = null;
        });
    }

    let active = true;
    inflight.then((id) => {
      if (active) setHostId(id);
    });

    return () => {
      active = false;
    };
  }, []);

  return hostId;
}
