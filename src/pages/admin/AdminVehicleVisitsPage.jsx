import AdminVisitLogPage from './AdminVisitLogPage';

export default function AdminVehicleVisitsPage() {
  return (
    <AdminVisitLogPage
      visitType="vehicle"
      title="Vehicle Visits"
      subtitle="Visit log for entries with linked vehicles"
      iconKey="vehicle-visits"
      emptyTitle="No vehicle visits yet"
      emptyDescription="Visits with registered vehicles will appear here."
    />
  );
}
