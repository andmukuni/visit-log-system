import { describeOrgHierarchy } from '../../../shared/orgHierarchy.js';

/** Compact relationship reminder for structure admin pages. */
export default function StructureRelationHint({ highlight = '' }) {
  const lines = describeOrgHierarchy();
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
        Structure relationships
      </p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {lines.map((line) => {
          const active = highlight && line.toLowerCase().includes(highlight.toLowerCase());
          return (
            <li
              key={line}
              className={`text-xs leading-snug ${
                active ? 'font-semibold text-navy-900' : 'text-gray-600'
              }`}
            >
              {line}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
