import RollCallListPage from '../shared/RollCallListPage';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityRollCallPage() {
  return (
    <RollCallListPage
      api={securityApi}
      portalLabel="Security"
      portalPath="/security"
      detailPathPrefix="/security/roll-call"
    />
  );
}
