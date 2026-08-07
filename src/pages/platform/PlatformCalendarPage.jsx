import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, StatusBadge } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformCalendarPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await platformApi.getCalendar());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: 'scheduled_at',
      label: 'Scheduled',
      render: (_, row) => formatDateTime(row.scheduled_at),
    },
    { key: 'title', label: 'Appointment' },
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'reference_number', label: 'Reference' },
    {
      key: 'visit_status',
      label: 'Visit status',
      render: (_, row) => (row.visit_status ? <StatusBadge status={row.visit_status} /> : '—'),
    },
    {
      key: 'status',
      label: 'Appointment',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Scheduled visitor appointments across all organisations"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Calendar' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} scheduled appointments`}>
          <DataTable columns={columns} data={rows} emptyTitle="No scheduled appointments" />
        </Card>
      )}
    </div>
  );
}
