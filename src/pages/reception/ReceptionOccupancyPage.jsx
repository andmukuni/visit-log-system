import { useCallback } from 'react';
import { receptionApi } from '../../utils/visitorApi';
import {
  filterVisitsByReceptionZones,
  scopeReceptionReferenceData,
} from '../../utils/receptionZoneScope';
import OccupancyPage from '../station/OccupancyPage';

export default function ReceptionOccupancyPage() {
  const fetchOccupancy = useCallback(async () => {
    const [rows, rawRef] = await Promise.all([
      receptionApi.getOccupancy(),
      receptionApi.getReferenceData().catch(() => ({})),
    ]);
    const ref = scopeReceptionReferenceData(rawRef);
    const zoneIds = ref?.scope?.zone_ids || [];
    const zoneHostIds = (ref.hosts || []).map((host) => host.id).filter(Boolean);
    return filterVisitsByReceptionZones(
      Array.isArray(rows) ? rows : [],
      zoneIds,
      zoneHostIds,
    );
  }, []);

  return (
    <OccupancyPage
      portalPrefix="/reception"
      title="On-site Visitors"
      subtitle="Only visitors currently on site for hosts in your assigned zone"
      fetchOccupancy={fetchOccupancy}
    />
  );
}
