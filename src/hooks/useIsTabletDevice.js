import { useEffect, useState } from 'react';

// Viewport width typical of tablets (iPad mini/Air/Pro 11" portrait & most
// Android tablets) combined with a coarse (touch) primary pointer, so a
// resized desktop/laptop browser window with a mouse isn't misdetected.
const TABLET_QUERY = '(min-width: 600px) and (max-width: 1200px) and (pointer: coarse)';

function getMatches() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(TABLET_QUERY).matches;
}

export function useIsTabletDevice() {
  const [isTablet, setIsTablet] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(TABLET_QUERY);
    const handleChange = (event) => setIsTablet(event.matches);
    setIsTablet(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isTablet;
}
