import { CarFront, Footprints } from 'lucide-react';

export const ADMIN_VISIT_TABS = [
  {
    value: 'walking',
    label: 'Walking Visits',
    icon: Footprints,
    visitType: 'walking',
    permission: 'admin.visitors',
    emptyTitle: 'No walking visits yet',
    emptyDescription: 'Visits registered without vehicles will appear here.',
    searchPlaceholder: 'Search visitor, host, reference…',
  },
  {
    value: 'vehicle',
    label: 'Vehicle Visits',
    icon: CarFront,
    visitType: 'vehicle',
    permission: 'admin.vehicles',
    emptyTitle: 'No vehicle visits yet',
    emptyDescription: 'Visits with registered vehicles will appear here.',
    searchPlaceholder: 'Search visitor, host, reference, plate…',
  },
];

export const PLATFORM_VISIT_TABS = [
  {
    value: 'walking',
    label: 'Walking Visits',
    icon: Footprints,
    visitType: 'walking',
    permissions: ['platform.visitors', 'platform.logbook', 'platform.dashboard'],
    emptyTitle: 'No walking visits yet',
    emptyDescription: 'Platform-wide foot traffic visits will appear here.',
    searchPlaceholder: 'Search visitor, host, reference, organisation…',
  },
  {
    value: 'vehicle',
    label: 'Vehicle Visits',
    icon: CarFront,
    visitType: 'vehicle',
    permissions: ['platform.vehicles', 'platform.logbook', 'platform.dashboard'],
    emptyTitle: 'No vehicle visits yet',
    emptyDescription: 'Platform-wide vehicle visits will appear here.',
    searchPlaceholder: 'Search visitor, host, reference, plate, organisation…',
  },
];

export function filterVisitTabs(tabs, hasPermission) {
  return tabs.filter((item) => {
    if (item.permissions?.length) {
      return item.permissions.some((key) => hasPermission(key));
    }
    if (item.permission) {
      return hasPermission(item.permission) || hasPermission('admin.dashboard');
    }
    return true;
  });
}
