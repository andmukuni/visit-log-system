import { Link } from 'react-router-dom';
import { ArrowRight, Siren } from 'lucide-react';
import { formatDateTime } from '../../utils/helpers';

export default function RollCallBanner({ rollCall, to }) {
  if (!rollCall) return null;
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shrink-0">
          <Siren size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">Active roll call</p>
          <p className="text-xs text-amber-800 mt-1">
            Started {formatDateTime(rollCall.startedAt)}
            {rollCall.reason ? ` — ${rollCall.reason}` : ''}
          </p>
          {to && (
            <Link
              to={to}
              className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-900 hover:underline"
            >
              Open roll call <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
