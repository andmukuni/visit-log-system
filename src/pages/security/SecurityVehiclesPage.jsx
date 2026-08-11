import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  FormField,
  LoadingButton,
} from '../../components/ui';
import StatusFilterBar from '../../components/logbook/StatusFilterBar';
import { VEHICLE_STATUS_OPTIONS } from '../../components/logbook/filterOptions';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityVehiclesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q = query, nextStatus = status) => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (nextStatus) params.status = nextStatus;
      setVehicles(await securityApi.getVehicles(params));
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    load('', '');
  }, [load]);

  const showOrganisation = vehicles.some((row) => row.organisation_name);

  const columns = [
    { key: 'plate_number', label: 'Plate' },
    { key: 'vehicle_type', label: 'Type' },
    { key: 'driver_name', label: 'Driver' },
    ...(showOrganisation ? [{ key: 'organisation_name', label: 'Organisation' }] : []),
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
        subtitle={showOrganisation
          ? 'Vehicle register across all organisations'
          : 'Vehicle register within your security scope'}
        iconKey="vehicles"
      />

      <Card className="mb-6">
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            load(query.trim(), status);
          }}
        >
          <FormField
            name="query"
            label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Plate, driver, make or organisation"
          />
          <LoadingButton type="submit" variant="secondary" icon={Search} iconOnly loading={loading} aria-label="Search" className="self-end" />
        </form>
      </Card>

      <StatusFilterBar
        options={VEHICLE_STATUS_OPTIONS}
        value={status}
        onChange={(value) => {
          setStatus(value);
          load(query.trim(), value);
        }}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`}>
          <DataTable
            embedded
            columns={columns}
            data={vehicles}
            emptyTitle="No vehicles found"
            emptyDescription="Try a different search or status filter."
            toolbar={{
              placeholder: 'Filter results…',
              searchKeys: ['plate_number', 'driver_name', 'make', 'organisation_name'],
            }}
            onRowClick={(row) => {
              if (row.visit_id) navigate(`/security/visitors/${row.visit_id}`);
            }}
          />
        </Card>
      )}
    </div>
  );
}
