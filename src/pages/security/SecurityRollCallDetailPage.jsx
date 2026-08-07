import RollCallDetailPage from '../shared/RollCallDetailPage';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityRollCallDetailPage() {
  return (
    <RollCallDetailPage
      api={securityApi}
      portalLabel="Security"
      portalPath="/security"
      listPath="/security/roll-call"
    />
  );
}
