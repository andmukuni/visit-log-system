import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LayoutGrid } from 'lucide-react';
import NavIcon from './NavIcon';
import { PORTAL_ICONS } from '../../../shared/navIcons.js';
import { PORTALS } from '../../../shared/portalNavigation.js';
import { useSidebarNav } from '../../context/SidebarContext';

function portalShortLabel(label = '') {
  return String(label).replace(/ Portal$/, '');
}

export default function PortalSwitcherMenu({ compact = false }) {
  const { accessiblePortals, portalId } = useSidebarNav();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const currentPortal = PORTALS[portalId];

  useEffect(() => {
    if (!open) return undefined;

    const handlePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!accessiblePortals.length) return null;

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Switch portal"
        className={`inline-flex items-center border transition-colors ${
          compact
            ? 'gap-1.5 rounded-lg px-2 py-1.5 text-xs'
            : 'gap-2 rounded-xl px-3 py-2 text-sm'
        } ${
          open
            ? 'border-cyan-200 bg-cyan-50 text-navy-800'
            : 'border-navy-200 bg-white text-navy-700 hover:border-navy-300 hover:bg-navy-50'
        }`}
      >
        <LayoutGrid size={compact ? 14 : 16} className="shrink-0 text-navy-500" aria-hidden="true" />
        <span className="hidden max-w-[8rem] truncate font-medium sm:inline">
          {portalShortLabel(currentPortal?.label) || 'Portal'}
        </span>
        <ChevronDown
          size={compact ? 14 : 16}
          className={`shrink-0 text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-xl border border-navy-100 bg-white py-2 shadow-lg shadow-navy-900/10"
        >
          <div className="px-3 pb-2 mb-2 border-b border-navy-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Switch portal</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-navy-900">
              {portalShortLabel(currentPortal?.label) || 'Current portal'}
            </p>
          </div>

          <div className="px-2 space-y-0.5">
            {accessiblePortals.map((portal) => (
              <Link
                key={portal.id}
                to={portal.routePrefix}
                role="menuitem"
                onClick={close}
                className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm text-navy-700 transition-colors hover:bg-navy-50 hover:text-navy-900"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-navy-100 bg-navy-50 text-navy-600">
                  <NavIcon name={PORTAL_ICONS[portal.id]} size={16} />
                </span>
                <span className="truncate">{portalShortLabel(portal.label)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
