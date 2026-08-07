import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  DataTable,
  Spinner,
  StatusBadge,
  FilterPills,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { platformApi } from '../../utils/visitorApi';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

export default function PlatformLogBookPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      setRows(await platformApi.getLogBook(params));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'reference_number', label: 'Reference' },
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'site_name', label: 'Site' },
    { key: 'category_name', label: 'Category' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'check_in_at',
      label: 'Check-in',
      render: (_, row) => (row.check_in_at ? formatDateTime(row.check_in_at) : '—'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Log Book"
        subtitle="Platform-wide visitor register across all organisations"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Log Book' }]}
        actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      />

      <FilterPills
        className="mb-4"
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} visitor records`}>
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle="No visitor records"
            emptyDescription="Visitor registrations will appear here as organisations use the system."
            toolbar={{
              placeholder: 'Search visitors, hosts, references…',
              searchKeys: ['visitor_name', 'host_name', 'reference_number', 'organisation_name', 'site_name'],
            }}
          />
        </Card>
      )}
    </div>
  );
}
