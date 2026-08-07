import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Siren, ExternalLink } from 'lucide-react';
import {
  PageHeader, Card, DataTable, Spinner, LoadingButton, FormField,
  IconButton, ViewAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';

const STATUS_LABELS = {
  active: 'Active',
  closed: 'Closed',
};

export default function RollCallListPage({
  api,
  portalLabel,
  portalPath,
  detailPathPrefix,
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState({ rollCalls: [], active: null });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [reason, setReason] = useState('Emergency evacuation');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getRollCalls());
    } catch {
      setData({ rollCalls: [], active: null });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const start = async () => {
    setStarting(true);
    try {
      const detail = await api.startRollCall({ reason: reason.trim() });
      toast.success(`Roll call started with ${detail.total} visitors.`);
      navigate(`${detailPathPrefix}/${detail.id}`);
    } catch (err) {
      if (err.message?.includes('already exists')) {
        toast.error(err.message);
        load();
      } else {
        toast.error(err.message);
      }
    } finally {
      setStarting(false);
    }
  };

  const columns = [
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => STATUS_LABELS[row.status] || row.status,
    },
    { key: 'reason', label: 'Reason' },
    { key: 'site_name', label: 'Site' },
    { key: 'started_by_name', label: 'Started by' },
    {
      key: 'started_at',
      label: 'Started',
      render: (_, row) => formatDateTime(row.started_at),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <ViewAction to={`${detailPathPrefix}/${row.id}`} label="Open" />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Emergency Roll Call"
        subtitle="Snapshot current on-site visitors and track evacuation attendance"
        breadcrumbs={[{ label: portalLabel, to: portalPath }, { label: 'Roll Call' }]}
      />

      {data.active && (
        <Card title="Active roll call" className="mb-6 border-amber-200 bg-amber-50/50">
          <p className="text-sm text-navy-700 mb-3">
            Roll call in progress since {formatDateTime(data.active.started_at)}.
          </p>
          <Link to={`${detailPathPrefix}/${data.active.id}`} aria-label="Continue roll call">
            <IconButton icon={ExternalLink} label="Continue roll call" tooltip="Continue roll call" variant="primary" />
          </Link>
        </Card>
      )}

      {!data.active && (
        <Card title="Start new roll call" className="mb-6">
          <p className="text-sm text-navy-600 mb-4">
            Creates a snapshot of all currently checked-in visitors. Original check-in/out records are not modified.
          </p>
          <FormField
            name="reason"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mb-4"
          />
          <LoadingButton loading={starting} onClick={start} icon={Siren} iconOnly aria-label="Start roll call" variant="danger" />
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title="Roll call history">
          <DataTable columns={columns} data={data.rollCalls} emptyTitle="No roll calls yet" />
        </Card>
      )}
    </div>
  );
}
