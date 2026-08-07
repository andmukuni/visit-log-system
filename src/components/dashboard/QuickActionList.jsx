import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function QuickActionList({ title = 'Quick actions', items = [] }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-900 mb-2 px-1">{title}</h3>
      <div className="space-y-1">
        {items.map((item) => {
          const inner = (
            <>
              <div className="flex items-center gap-3 min-w-0">
                {item.icon && (
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-600 shrink-0">
                    <item.icon size={18} />
                  </span>
                )}
                <span className="text-sm font-medium text-gray-800 truncate">{item.label}</span>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </>
          );
          const className = 'flex items-center justify-between gap-2 rounded-2xl px-2 py-2 hover:bg-gray-50 transition-colors';
          if (item.to) {
            return (
              <Link key={item.label} to={item.to} aria-label={item.label} className={className}>
                {inner}
              </Link>
            );
          }
          return (
            <button key={item.label} type="button" onClick={item.onClick} className={`${className} w-full text-left`}>
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
