import { useEffect, useRef, useState } from 'react';

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function useCountUp(
  target,
  { duration = 900, delay = 0, decimals = 0, enabled = true } = {},
) {
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
  const [value, setValue] = useState(enabled ? 0 : safeTarget);
  const frameRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setValue(safeTarget);
      return undefined;
    }

    setValue(0);

    const run = () => {
      const startTimeRef = { current: null };

      const animate = (timestamp) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const next = easeOutCubic(progress) * safeTarget;
        setValue(next);
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        } else {
          setValue(safeTarget);
        }
      };

      frameRef.current = requestAnimationFrame(animate);
    };

    if (delay > 0) {
      timeoutRef.current = window.setTimeout(run, delay);
    } else {
      run();
    }

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [safeTarget, duration, delay, decimals, enabled]);

  if (decimals > 0) {
    return Number(value.toFixed(decimals));
  }
  return Math.round(value);
}
