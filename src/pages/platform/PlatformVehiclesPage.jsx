import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  DataTable,
  Spinner,
  StatusBadge,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import StatusFilterBar from '../../components/logbook/StatusFilterBar';
import { VEHICLE_STATUS_OPTIONS } from '../../components/logbook/filterOptions';
import { formatDateTime } from '../../utils/helpers';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformVehiclesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      setRows(await platformApi.getVehicles(params));
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
    { key: 'plate_number', label: 'Plate' },
    { key: 'vehicle_type', label: 'Type' },
    { key: 'make', label: 'Make' },
    { key: 'driver_name', label: 'Driver' },
    { key: 'organisation_name', label: 'Organisation' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'entered_at',
      label: 'Entered',
      render: (_, row) => (row.entered_at ? formatDateTime(row.entered_at) : '—'),
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Vehicles"
        subtitle="Platform-wide vehicle register across all organisations"
        iconKey="vehicles"
        actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      />

      <StatusFilterBar
        options={VEHICLE_STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} vehicle${rows.length === 1 ? '' : 's'}`}>
          <DataTable
            embedded
            columns={columns}
            data={rows}
            emptyTitle="No vehicles yet"
            emptyDescription="Vehicle entries will appear here as sites log drive-in visits."
            toolbar={{
              placeholder: 'Search plate, driver, make, organisation…',
              searchKeys: ['plate_number', 'driver_name', 'make', 'organisation_name', 'vehicle_type'],
            }}
          />
        </Card>
      )}
    </div>
  );
}
