import { Link } from 'react-router-dom';
import {
  Plus, RefreshCw, Download, Upload, Printer, Search, Filter, ArrowLeft, ArrowRight, Save, Check, X,
} from 'lucide-react';
import IconButton from './IconButton';
import LoadingButton from './LoadingButton';

export function RefreshAction({ onClick, loading, label = 'Refresh' }) {
  return (
    <LoadingButton
      variant="secondary"
      icon={RefreshCw}
      iconOnly
      loading={loading}
      aria-label={label}
      onClick={onClick}
    />
  );
}

export function AddAction({ to, onClick, label = 'Add' }) {
  const btn = (
    <LoadingButton variant="primary" icon={Plus} iconOnly aria-label={label} onClick={onClick} />
  );
  if (to) {
    return <Link to={to} aria-label={label}>{btn}</Link>;
  }
  return btn;
}

export function ExportAction({ onClick, label = 'Export' }) {
  return <IconButton icon={Download} label={label} tooltip={label} variant="secondary" onClick={onClick} />;
}

export function ImportAction({ onClick, label = 'Import' }) {
  return <IconButton icon={Upload} label={label} tooltip={label} variant="secondary" onClick={onClick} />;
}

export function PrintAction({ onClick, label = 'Print' }) {
  return <IconButton icon={Printer} label={label} tooltip={label} variant="secondary" onClick={onClick} />;
}

export function SearchAction({ onClick, label = 'Search' }) {
  return <IconButton icon={Search} label={label} tooltip={label} variant="secondary" onClick={onClick} />;
}

export function FilterAction({ onClick, label = 'Filter' }) {
  return <IconButton icon={Filter} label={label} tooltip={label} variant="ghost" onClick={onClick} />;
}

export function BackAction({ to, onClick, label = 'Back' }) {
  const btn = <IconButton icon={ArrowLeft} label={label} tooltip={label} variant="ghost" onClick={onClick} />;
  if (to) return <Link to={to} aria-label={label}>{btn}</Link>;
  return btn;
}

export function SaveAction({ onClick, loading, label = 'Save', type = 'button' }) {
  return (
    <LoadingButton
      type={type}
      variant="primary"
      icon={Save}
      iconOnly
      loading={loading}
      aria-label={label}
      onClick={onClick}
    />
  );
}

export function ConfirmAction({ onClick, loading, label = 'Confirm' }) {
  return (
    <LoadingButton
      variant="primary"
      icon={Check}
      iconOnly
      loading={loading}
      aria-label={label}
      onClick={onClick}
    />
  );
}

export function CancelAction({ onClick, label = 'Cancel' }) {
  return <IconButton icon={X} label={label} tooltip={label} variant="ghost" onClick={onClick} />;
}

export function ViewAllAction({ to, onClick, label = 'View all' }) {
  const btn = (
    <IconButton icon={ArrowRight} label={label} tooltip={label} variant="ghost" size="sm" onClick={onClick} />
  );
  if (to) return <Link to={to} aria-label={label}>{btn}</Link>;
  return btn;
}

export function ViewAction({ to, onClick, label = 'View' }) {
  const btn = <IconButton icon={Search} label={label} tooltip={label} variant="ghost" size="sm" onClick={onClick} />;
  if (to) return <Link to={to} aria-label={label}>{btn}</Link>;
  return btn;
}

export function ActionToolbar({ children, className = '' }) {
  return <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>{children}</div>;
}
