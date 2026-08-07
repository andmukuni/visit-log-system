import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader,
  Card,
  FormField,
  ActionToolbar,
  SaveAction,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { visitorApi } from '../../utils/visitorApi';

export default function NewVehiclePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    plateNumber: '',
    vehicleType: '',
    make: '',
    colour: '',
    driverName: '',
  });

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await visitorApi.registerVehicle(form);
      toast.success('Vehicle registered.');
      navigate('/station/vehicles');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New Vehicle"
        subtitle="Register a vehicle entry"
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: 'New Vehicle' }]}
      />
      <Card title="Vehicle details">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <FormField label="Plate number" name="plateNumber" value={form.plateNumber} onChange={update('plateNumber')} required />
          <FormField label="Vehicle type" name="vehicleType" value={form.vehicleType} onChange={update('vehicleType')} placeholder="Car, truck, motorcycle…" />
          <FormField label="Make" name="make" value={form.make} onChange={update('make')} />
          <FormField label="Colour" name="colour" value={form.colour} onChange={update('colour')} />
          <FormField label="Driver name" name="driverName" value={form.driverName} onChange={update('driverName')} className="md:col-span-2" />
          <div className="md:col-span-2">
            <ActionToolbar>
              <SaveAction type="submit" loading={submitting} label="Register vehicle" />
            </ActionToolbar>
          </div>
        </form>
      </Card>
    </div>
  );
}
