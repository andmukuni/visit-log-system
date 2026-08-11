import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  LoadingButton,
  ActionToolbar,
  RefreshAction,
  AddAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

export default function VehicleLogsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await visitorApi.getVehicles();
      setVehicles(rows);
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCheckOut = async (id) => {
    setCheckingOut(id);
    try {
      await visitorApi.checkOutVehicle(id);
      toast.success('Vehicle checked out.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCheckingOut(null);
    }
  };

  const columns = [
    { key: 'plate_number', label: 'Plate' },
    { key: 'vehicle_type', label: 'Type' },
    { key: 'driver_name', label: 'Driver' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'entered_at',
      label: 'Entered',
      render: (_, row) => formatDateTime(row.entered_at),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => row.status === 'on_site' ? (
        <LoadingButton
          loading={checkingOut === row.id}
          icon={LogOut}
          iconOnly
          aria-label="Check out"
          variant="primary"
          size="sm"
          onClick={() => handleCheckOut(row.id)}
        />
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Vehicle Logs"
        subtitle="Vehicle entry and exit history"
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: 'Vehicle Logs' }]}
        actions={(
          <ActionToolbar>
            <AddAction to="/station/vehicles/new" label="New vehicle" />
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title="Vehicles">
          <DataTable
            columns={columns}
            data={vehicles}
            emptyTitle="No vehicles recorded"
            onRowClick={(row) => {
              if (row.visit_id) navigate(`/station/visitors/${row.visit_id}`);
            }}
          />
        </Card>
      )}
    </div>
  );
}
