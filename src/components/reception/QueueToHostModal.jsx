import { useEffect, useMemo, useState } from 'react';
import { Building2, Network, User } from 'lucide-react';
import { Modal, FormField, LoadingButton, SegmentedControl } from '../ui';

const DESTINATION_TYPES = [
  { value: 'host', label: 'Host', icon: User },
  { value: 'office', label: 'Office', icon: Building2 },
  { value: 'department', label: 'Department', icon: Network },
];

function optionList(rows, mapFn) {
  return [{ value: '', label: 'Select…' }, ...rows.map(mapFn)];
}

export default function QueueToHostModal({
  isOpen,
  onClose,
  visit,
  hosts = [],
  departments = [],
  offices = [],
  submitting = false,
  onConfirm,
}) {
  const [destinationType, setDestinationType] = useState('host');
  const [departmentId, setDepartmentId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [hostId, setHostId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !visit) return;
    setDestinationType(visit.host_id ? 'host' : visit.office_id ? 'office' : visit.department_id ? 'department' : 'host');
    setDepartmentId(visit.department_id || '');
    setOfficeId(visit.office_id || '');
    setHostId(visit.host_id || '');
    setError('');
  }, [isOpen, visit]);

  const filteredOffices = useMemo(() => {
    if (!departmentId) return offices;
    return offices.filter((row) => row.department_id === departmentId);
  }, [offices, departmentId]);

  const filteredHosts = useMemo(() => {
    return hosts.filter((row) => {
      if (officeId && row.office_id !== officeId) return false;
      if (departmentId && row.department_id !== departmentId) return false;
      return true;
    });
  }, [hosts, officeId, departmentId]);

  const departmentOptions = useMemo(
    () => optionList(departments, (d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const officeOptions = useMemo(
    () => optionList(
      filteredOffices,
      (o) => ({
        value: o.id,
        label: [o.office_number, o.name, o.department_name].filter(Boolean).join(' · ') || o.id,
      }),
    ),
    [filteredOffices],
  );

  const hostOptions = useMemo(
    () => optionList(
      filteredHosts,
      (h) => ({ value: h.id, label: h.email ? `${h.name} (${h.email})` : h.name }),
    ),
    [filteredHosts],
  );

  const handleDestinationChange = (next) => {
    setDestinationType(next);
    setError('');
    if (next === 'host' && !hostId && visit?.host_id) setHostId(visit.host_id);
  };

  const handleDepartmentChange = (e) => {
    const value = e.target.value;
    setDepartmentId(value);
    setError('');
    if (officeId) {
      const office = offices.find((row) => row.id === officeId);
      if (office && value && office.department_id !== value) setOfficeId('');
    }
    if (hostId) {
      const host = hosts.find((row) => row.id === hostId);
      if (host && value && host.department_id !== value) setHostId('');
    }
  };

  const handleOfficeChange = (e) => {
    const value = e.target.value;
    setOfficeId(value);
    setError('');
    const office = offices.find((row) => row.id === value);
    if (office?.department_id) setDepartmentId(office.department_id);
    if (hostId) {
      const host = hosts.find((row) => row.id === hostId);
      if (host && value && host.office_id !== value) setHostId('');
    }
  };

  const handleHostChange = (e) => {
    const value = e.target.value;
    setHostId(value);
    setError('');
    const host = hosts.find((row) => row.id === value);
    if (host?.department_id) setDepartmentId(host.department_id);
    if (host?.office_id) setOfficeId(host.office_id);
  };

  const handleConfirm = () => {
    if (destinationType === 'office' && !officeId) {
      setError('Select an office to queue to.');
      return;
    }
    if (destinationType === 'department' && !departmentId) {
      setError('Select a department to queue to.');
      return;
    }
    if (!hostId) {
      setError('Select a host so the request appears on their approvals list.');
      return;
    }

    const payload = { hostId };
    if (departmentId) payload.departmentId = departmentId;
    if (officeId) payload.officeId = officeId;

    onConfirm?.(payload);
  };

  const visitorName = visit?.full_name || visit?.visitor_name || 'Visitor';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Queue to host"
      subtitle={`Choose where to send ${visitorName}`}
      size="md"
      footer={(
        <>
          <LoadingButton variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </LoadingButton>
          <LoadingButton
            loading={submitting}
            loadingLabel="Queuing…"
            onClick={handleConfirm}
            className="bg-cyan-600 hover:bg-cyan-500 border-cyan-600"
          >
            Queue visitor
          </LoadingButton>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-navy-800">Queue to</p>
          <SegmentedControl
            fullWidth
            options={DESTINATION_TYPES}
            value={destinationType}
            onChange={handleDestinationChange}
          />
        </div>

        {(destinationType === 'department' || destinationType === 'host' || destinationType === 'office') && (
          <FormField
            label="Department"
            name="departmentId"
            type="select"
            value={departmentId}
            onChange={handleDepartmentChange}
            options={departmentOptions}
            required={destinationType === 'department'}
            helpText={destinationType === 'department' ? 'Filter hosts in this department.' : 'Optional filter'}
          />
        )}

        {(destinationType === 'office' || destinationType === 'host') && (
          <FormField
            label="Office"
            name="officeId"
            type="select"
            value={officeId}
            onChange={handleOfficeChange}
            options={officeOptions}
            required={destinationType === 'office'}
            helpText={
              destinationType === 'office'
                ? 'Filter hosts in this office.'
                : 'Optional filter'
            }
          />
        )}

        {(destinationType === 'host' || destinationType === 'office' || destinationType === 'department') && (
          <FormField
            label="Host"
            name="hostId"
            type="select"
            value={hostId}
            onChange={handleHostChange}
            options={hostOptions}
            required
            helpText="Sent to this host’s Approvals queue as pending."
          />
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
