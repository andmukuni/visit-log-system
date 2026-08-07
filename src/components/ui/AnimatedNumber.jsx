import { useCountUp } from '../../hooks/useCountUp';

export function parseNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

export default function AnimatedNumber({
  value,
  duration = 900,
  delay = 0,
  decimals = 0,
  format,
  enabled = true,
  className = '',
}) {
  const numericValue = parseNumericValue(value);
  const animated = useCountUp(numericValue ?? 0, {
    duration,
    delay,
    decimals,
    enabled: enabled && numericValue != null,
  });

  if (numericValue == null) {
    return <span className={className}>{value}</span>;
  }

  const display = format
    ? format(animated)
    : decimals > 0
      ? animated.toFixed(decimals)
      : animated.toLocaleString();

  return <span className={className}>{display}</span>;
}
