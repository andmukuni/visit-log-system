import { useCallback, useEffect, useState } from 'react';
import {
  PageHeader,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import HostAvailabilityBoard from '../../components/reception/HostAvailabilityBoard';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';

export default function ReceptionHostAvailabilityPage() {
  const toast = useToast();
  const [hosts, setHosts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = departmentId ? { departmentId } : {};
      const [hostRows, ref] = await Promise.all([
        receptionApi.getHostAvailability(params),
        departments.length ? Promise.resolve({ departments }) : receptionApi.getReferenceData(),
      ]);
      setHosts(hostRows || []);
      if (ref?.departments) setDepartments(ref.departments);
    } catch {
      setHosts([]);
    } finally {
      setLoading(false);
    }
  }, [departmentId, departments.length]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const handleMarkAvailability = async (host, availability) => {
    try {
      await receptionApi.setHostAvailability(host.id, availability);
      setHosts((prev) => prev.map((row) => (
        row.id === host.id ? { ...row, availability } : row
      )));
      toast.success(
        availability === 'available'
          ? `${host.name} marked available.`
          : `${host.name} marked not available.`,
      );
    } catch (err) {
      toast.error(err.message || 'Unable to update host availability.');
      throw err;
    }
  };

  return (
    <div>
      <PageHeader
        title="Host Availability"
        subtitle="Mark hosts Available or Not available — Host Queue reflects the same status"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Hosts' }]}
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      <HostAvailabilityBoard
        hosts={hosts}
        departments={departments}
        departmentId={departmentId}
        onDepartmentChange={setDepartmentId}
        onMarkAvailability={handleMarkAvailability}
        loading={loading}
      />
    </div>
  );
}
