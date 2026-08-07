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
import { visitorApi } from '../../utils/visitorApi';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

export default function AdminVisitLogPage({
  visitType,
  title,
  subtitle,
  iconKey,
  emptyTitle,
  emptyDescription,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { type: visitType };
      if (status) params.status = status;
      setRows(await visitorApi.getOrgVisits(params));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [visitType, status]);

  useEffect(() => {
    load();
  }, [load]);

  const showOrganisation = rows.some((row) => row.organisation_name);
  const isVehicle = visitType === 'vehicle';

  const columns = [
    { key: 'reference_number', label: 'Reference' },
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    ...(showOrganisation ? [{ key: 'organisation_name', label: 'Organisation' }] : []),
    { key: 'site_name', label: 'Site' },
    { key: 'category_name', label: 'Category' },
    ...(isVehicle ? [{ key: 'plate_numbers', label: 'Plates' }] : []),
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
    {
      key: 'check_out_at',
      label: 'Check-out',
      render: (_, row) => (row.check_out_at ? formatDateTime(row.check_out_at) : '—'),
    },
  ];

  const searchKeys = [
    'reference_number',
    'visitor_name',
    'host_name',
    'organisation_name',
    'site_name',
    ...(isVehicle ? ['plate_numbers'] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={title}
        subtitle={subtitle}
        iconKey={iconKey}
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
        <Card title={`${rows.length} visit${rows.length === 1 ? '' : 's'}`}>
          <DataTable
            embedded
            columns={columns}
            data={rows}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            toolbar={{
              placeholder: isVehicle
                ? 'Search visitor, host, reference, plate…'
                : 'Search visitor, host, reference…',
              searchKeys,
            }}
          />
        </Card>
      )}
    </div>
  );
}
