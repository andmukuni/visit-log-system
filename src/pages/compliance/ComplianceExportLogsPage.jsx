import ExportHistoryPage from '../shared/ExportHistoryPage';

export default function ComplianceExportLogsPage() {
  return (
    <ExportHistoryPage
      portalLabel="Compliance"
      portalPath="/compliance"
      title="Export Logs"
      subtitle="Review who exported personal data, when, and for what purpose"
    />
  );
}
