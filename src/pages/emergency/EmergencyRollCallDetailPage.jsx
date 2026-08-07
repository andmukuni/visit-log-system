import RollCallDetailPage from '../shared/RollCallDetailPage';
import { emergencyApi } from '../../utils/visitorApi';

export default function EmergencyRollCallDetailPage() {
  return (
    <RollCallDetailPage
      api={emergencyApi}
      portalLabel="Emergency"
      portalPath="/emergency"
      listPath="/emergency/roll-call"
    />
  );
}
