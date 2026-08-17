import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, UserPlus } from 'lucide-react';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  ActionToolbar,
  RefreshAction,
  IconButton,
} from '../../components/ui';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';
import { toastHostApprovalRequested } from '../../utils/hostApprovalToast';
import { scopeReceptionReferenceData } from '../../utils/receptionZoneScope';

function waitDuration(row) {
  const start = row.queued_at || row.checked_in_at || row.check_in_at || row.updated_at;
  if (!start) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function HostAvailabilityBadge({ availability }) {
  if (!availability) {
    return <span className="text-xs text-navy-400">No host assigned</span>;
  }

  const available = availability === 'available';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        available
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          : 'bg-rose-50 text-rose-700 ring-rose-600/20'
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${available ? 'bg-emerald-500' : 'bg-rose-500'}`}
        aria-hidden="true"
      />
      {available ? 'Available' : 'Not available'}
    </span>
  );
}

function canQueueVisit(row) {
  return ['reception_check_in', 'checked_in'].includes(row?.status);
}

export default function ReceptionHostQueuePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueVisit, setQueueVisit] = useState(null);
  const [queuing, setQueuing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, rawRef] = await Promise.all([
        receptionApi.getHostQueue({ includeReady: '1' }),
        receptionApi.getReferenceData().catch(() => ({})),
      ]);
      const ref = scopeReceptionReferenceData(rawRef);
      setVisits(rows || []);
      setHosts(ref.hosts || []);
      setDepartments(ref.departments || []);
      setOffices(ref.offices || []);
    } catch {
      setVisits([]);
      setHosts([]);
      setDepartments([]);
      setOffices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const handleQueueConfirm = async (payload) => {
    if (!queueVisit?.id) return;
    setQueuing(true);
    try {
      const result = await receptionApi.queueToHost(queueVisit.id, payload);
      toastHostApprovalRequested(toast, result, 'Visitor sent to host for approval.');
      setQueueVisit(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQueuing(false);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    {
      key: 'host_name',
      label: 'Host',
      render: (value) => value || '—',
    },
    {
      key: 'host_availability',
      label: 'Host status',
      render: (_, row) => <HostAvailabilityBadge availability={row.host_availability} />,
    },
    {
      key: 'status',
      label: 'Visit status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'wait',
      label: 'Wait time',
      render: (_, row) => waitDuration(row),
    },
    {
      key: 'check_in_at',
      label: 'Checked in',
      render: (_, row) => formatDateTime(row.checked_in_at || row.check_in_at || row.updated_at),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          {canQueueVisit(row) ? (
            <IconButton
              icon={UserPlus}
              label="Queue to host"
              tooltip="Queue to host in your zone"
              size="sm"
              variant="ghost"
              onClick={() => setQueueVisit(row)}
            />
          ) : null}
          <Link to={`/reception/visitors/${row.id}`} aria-label={`View ${row.full_name || 'visitor'}`}>
            <IconButton icon={Eye} label="View" tooltip="View" size="sm" variant="ghost" />
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Host Queue"
        subtitle="Zone-scoped queue — you can only send visitors to hosts in your assigned zone"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Host queue' }]}
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={visits}
            emptyTitle="Queue is empty"
            emptyDescription="Visitors checked in at your desk, or waiting for a host in your zone, appear here."
            onRowClick={(row) => navigate(`/reception/visitors/${row.id}`)}
          />
        </Card>
      )}

      <QueueToHostModal
        isOpen={Boolean(queueVisit)}
        onClose={() => !queuing && setQueueVisit(null)}
        visit={queueVisit}
        hosts={hosts}
        departments={departments}
        offices={offices}
        submitting={queuing}
        onConfirm={handleQueueConfirm}
      />
    </div>
  );
}
