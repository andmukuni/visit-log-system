import { APP_NAME, LOGO_PATH } from '../../shared/branding.js';

export default function SiteLogo({
  className = 'h-12 w-auto max-w-[200px] object-contain',
  alt = APP_NAME,
}) {
  return (
    <img
      src={LOGO_PATH}
      alt={alt}
      width={200}
      height={80}
      decoding="async"
      className={className}
    />
  );
}
