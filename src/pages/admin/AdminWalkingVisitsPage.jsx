import AdminVisitLogPage from './AdminVisitLogPage';

export default function AdminWalkingVisitsPage() {
  return (
    <AdminVisitLogPage
      visitType="walking"
      title="Walking Visits"
      subtitle="Visit log for foot traffic without linked vehicles"
      iconKey="walking-visits"
      emptyTitle="No walking visits yet"
      emptyDescription="Visits registered without vehicles will appear here."
    />
  );
}
