import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Spinner,
  ActionToolbar,
  RefreshAction,
  LoadingButton,
} from '../../components/ui';
import QueueToHostModal from '../../components/reception/QueueToHostModal';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { receptionApi } from '../../utils/visitorApi';

function waitDuration(row) {
  const start = row.queued_at || row.checked_in_at || row.check_in_at || row.updated_at;
  if (!start) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function ReceptionHostQueuePage() {
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [queueVisit, setQueueVisit] = useState(null);
  const [queuing, setQueuing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, ref] = await Promise.all([
        receptionApi.getHostQueue({ includeReady: '1' }),
        receptionApi.getReferenceData(),
      ]);
      setVisits(rows || []);
      setHosts(ref.hosts || []);
      setDepartments(ref.departments || []);
      setOffices(ref.offices || []);
    } catch {
      setVisits([]);
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
      await receptionApi.queueToHost(queueVisit.id, payload);
      toast.success('Host notified — visitor is waiting.');
      setQueueVisit(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQueuing(false);
    }
  };

  const runMeeting = async (id) => {
    setActing(`meeting-${id}`);
    try {
      await receptionApi.markInMeeting(id);
      toast.success('Visitor marked as with host.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    { key: 'host_name', label: 'Host' },
    {
      key: 'status',
      label: 'Status',
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to={`/reception/visitors/${row.id}`} className="text-xs font-medium text-cyan-700 hover:underline">
            View
          </Link>
          {row.status !== 'waiting' ? (
            <LoadingButton
              size="sm"
              onClick={() => setQueueVisit(row)}
            >
              Queue to host
            </LoadingButton>
          ) : (
            <LoadingButton
              size="sm"
              variant="secondary"
              onClick={() => setQueueVisit(row)}
            >
              Notify again
            </LoadingButton>
          )}
          {['waiting', 'reception_check_in', 'checked_in'].includes(row.status) ? (
            <LoadingButton
              size="sm"
              variant="secondary"
              loading={acting === `meeting-${row.id}`}
              onClick={() => runMeeting(row.id)}
            >
              With host
            </LoadingButton>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Host Queue"
        subtitle="Visitors checked in at reception — queue to host or mark as in meeting"
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
            emptyDescription="Checked-in visitors ready to see their host will appear here."
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
