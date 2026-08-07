import IconButton from './IconButton';
import { X, Download, Printer, Copy } from 'lucide-react';

export default function BulkActionBar({
  count = 0,
  onClear,
  onExport,
  onPrint,
  onDuplicate,
  extra,
}) {
  if (!count) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 shadow-2xl text-white">
        <span className="text-sm font-medium pr-2 border-r border-gray-700">Selected: {count}</span>
        <IconButton icon={X} label="Clear selection" tooltip="Clear selection" variant="ghost" className="text-white hover:bg-gray-800" onClick={onClear} />
        {onExport && <IconButton icon={Download} label="Export" tooltip="Export" variant="ghost" className="text-white hover:bg-gray-800" onClick={onExport} />}
        {onPrint && <IconButton icon={Printer} label="Print" tooltip="Print" variant="ghost" className="text-white hover:bg-gray-800" onClick={onPrint} />}
        {onDuplicate && <IconButton icon={Copy} label="Duplicate" tooltip="Duplicate" variant="ghost" className="text-white hover:bg-gray-800" onClick={onDuplicate} />}
        {extra}
      </div>
    </div>
  );
}
