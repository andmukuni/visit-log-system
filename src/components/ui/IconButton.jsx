import Tooltip from './Tooltip';
import Button from './Button';
import Spinner from './Spinner';

export default function IconButton({
  icon: Icon,
  label,
  tooltip,
  size = 'md',
  variant = 'ghost',
  loading = false,
  iconSize = 18,
  className = '',
  ...props
}) {
  const ariaLabel = label || tooltip;
  const button = (
    <Button
      variant={variant}
      size={size}
      iconOnly
      aria-label={ariaLabel}
      className={className}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size={iconSize} /> : Icon ? <Icon size={iconSize} /> : null}
    </Button>
  );

  if (tooltip || label) {
    return <Tooltip content={tooltip || label}>{button}</Tooltip>;
  }

  return button;
}
