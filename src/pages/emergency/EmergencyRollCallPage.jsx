import RollCallListPage from '../shared/RollCallListPage';
import { emergencyApi } from '../../utils/visitorApi';

export default function EmergencyRollCallPage() {
  return (
    <RollCallListPage
      api={emergencyApi}
      portalLabel="Emergency"
      portalPath="/emergency"
      detailPathPrefix="/emergency/roll-call"
    />
  );
}
