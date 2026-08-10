import { receptionApi } from '../../utils/visitorApi';
import OccupancyPage from '../station/OccupancyPage';

export default function ReceptionOccupancyPage() {
  return (
    <OccupancyPage
      portalPrefix="/reception"
      title="On-site Visitors"
      subtitle="Visitors currently inside the premises"
      fetchOccupancy={() => receptionApi.getOccupancy()}
    />
  );
}
