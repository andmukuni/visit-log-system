const VARIANTS = {
  primary: 'bg-gray-900 text-white hover:bg-gray-800 border border-gray-900',
  secondary: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-500 border border-red-600',
};

const SIZES = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3 text-sm gap-2',
  lg: 'h-11 px-4 text-sm gap-2',
};

const ICON_ONLY_SIZES = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  className = '',
  children,
  type = 'button',
  disabled = false,
  ...props
}) {
  const base = 'inline-flex items-center justify-center rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizeClass = iconOnly ? ICON_ONLY_SIZES[size] || ICON_ONLY_SIZES.md : SIZES[size] || SIZES.md;
  const variantClass = VARIANTS[variant] || VARIANTS.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${sizeClass} ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export { VARIANTS, SIZES, ICON_ONLY_SIZES };
