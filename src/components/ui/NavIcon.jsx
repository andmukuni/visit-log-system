import * as LucideIcons from 'lucide-react';
import { resolveNavIcon } from '../../utils/navIcons';

export default function NavIcon({ name, iconKey, size = 20, className = '' }) {
  const iconName = name || resolveNavIcon(iconKey);
  const Icon = LucideIcons[iconName] || LucideIcons.Circle;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export function resolveLucideIcon(name) {
  return LucideIcons[name] || LucideIcons.Circle;
}
