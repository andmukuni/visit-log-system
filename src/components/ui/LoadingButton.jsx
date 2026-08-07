import Spinner from './Spinner';
import Button from './Button';

export default function LoadingButton({
  loading = false,
  loadingLabel,
  icon: Icon,
  iconSize = 18,
  spinnerSize = 16,
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  'aria-label': ariaLabel,
  type = 'button',
  disabled = false,
  ...props
}) {
  const isIconOnly = iconOnly || (!children && Boolean(Icon));
  const label = ariaLabel || (typeof children === 'string' ? children : loadingLabel);

  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      iconOnly={isIconOnly}
      disabled={disabled || loading}
      aria-label={label}
      className={className}
      {...props}
    >
      {loading ? <Spinner size={spinnerSize} /> : Icon ? <Icon size={iconSize} /> : null}
      {!isIconOnly && (loading ? (loadingLabel ?? children) : children)}
    </Button>
  );
}
