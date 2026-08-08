import { UnderlineTabs } from '../ui';
import StatusFilterBar from './StatusFilterBar';
import { VISIT_LOG_STATUS_OPTIONS } from './filterOptions';

export { VISIT_LOG_STATUS_OPTIONS } from './filterOptions';

export default function LogBookFilterBar({
  tabs = [],
  activeTab,
  onTabChange,
  currentTab,
  status,
  onStatusChange,
  className = '',
}) {
  const tabOptions = tabs.map((item) => ({
    value: item.value,
    label: item.label,
    icon: item.icon,
  }));

  return (
    <div className={`mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {tabs.length > 1 ? (
        <UnderlineTabs
          fullWidth
          options={tabOptions}
          value={activeTab}
          onChange={onTabChange}
        />
      ) : currentTab ? (
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          {currentTab.icon ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
              <currentTab.icon size={18} strokeWidth={2} aria-hidden="true" />
            </span>
          ) : null}
          <div>
            <p className="text-sm font-semibold text-navy-900">{currentTab.label}</p>
            <p className="text-xs text-navy-400">{currentTab.subtitle || 'Visit register'}</p>
          </div>
        </div>
      ) : null}

      <StatusFilterBar
        embedded
        options={VISIT_LOG_STATUS_OPTIONS}
        value={status}
        onChange={onStatusChange}
      />
    </div>
  );
}
