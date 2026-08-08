import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  IconButton,
  FilterPills,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { executiveApi } from '../../utils/visitorApi';

const WINDOW_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

export default function ExecutiveAppointmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const window = searchParams.get('window') || 'upcoming';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await executiveApi.getAppointments({ window }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [window]);

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
    { key: 'company', label: 'Company' },
    {
      key: 'classification',
      label: 'Type',
      render: (_, row) => <span className="capitalize">{row.classification || 'standard'}</span>,
    },
    {
      key: 'visit_status',
      label: 'Visit status',
      render: (_, row) => <StatusBadge status={row.visit_status} />,
    },
    {
      key: 'view',
      label: '',
      render: (_, row) => (
        row.visit_id ? (
          <Link to={`/executive/visitors/${row.visit_id}`} aria-label="View visit">
            <IconButton icon={Eye} label="View" tooltip="View visit" variant="ghost" size="sm" />
          </Link>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="My Appointments"
        subtitle="Your personal calendar — visitors scheduled to meet you"
        breadcrumbs={[{ label: 'Executive', to: '/executive' }, { label: 'Appointments' }]}
      />

      <div className="mb-4">
        <FilterPills
          options={WINDOW_OPTIONS}
          value={window}
          onChange={(value) => setSearchParams({ window: value })}
          variant="soft"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} appointments`}>
          <DataTable
            embedded
            columns={columns}
            data={rows}
            emptyTitle="No appointments"
            emptyDescription="Appointments scheduled for you will appear here."
            toolbar={{ placeholder: 'Search appointments…', searchKeys: ['visitor_name', 'company', 'title'] }}
          />
        </Card>
      )}
    </div>
  );
}
