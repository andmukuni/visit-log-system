import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { UserCheck, Clock, LogOut, HelpCircle, XCircle } from 'lucide-react';
import { PageHeader, Card, DataTable, Spinner, LoadingButton, IconButton, BackAction } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';

const STATUS_ICONS = {
  accounted_for: UserCheck,
  not_yet_accounted_for: Clock,
  left_site: LogOut,
  unknown: HelpCircle,
};

const STATUS_OPTIONS = [
  { value: 'accounted_for', label: 'Accounted for' },
  { value: 'not_yet_accounted_for', label: 'Not yet accounted for' },
  { value: 'left_site', label: 'Left site' },
  { value: 'unknown', label: 'Unknown' },
];

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));

export default function RollCallDetailPage({
  api,
  portalLabel,
  portalPath,
  listPath,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await api.getRollCall(id));
    } catch (err) {
      toast.error(err.message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [api, id, toast]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const mark = async (entryId, status) => {
    setActing(entryId);
    try {
      const updated = await api.markRollCallEntry(id, { entryId, status });
      setDetail(updated);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const close = async () => {
    setClosing(true);
    try {
      await api.closeRollCall(id, {});
      toast.success('Roll call closed.');
      navigate(listPath);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClosing(false);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'phone', label: 'Phone' },
    { key: 'host_name', label: 'Host' },
    { key: 'badge_number', label: 'Badge' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => STATUS_LABELS[row.status] || row.status,
    },
    {
      key: 'actions',
      label: 'Mark',
      render: (_, row) => detail?.status === 'active' ? (
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <IconButton
              key={opt.value}
              icon={STATUS_ICONS[opt.value]}
              label={opt.label}
              tooltip={opt.label}
              size="sm"
              variant={row.status === opt.value ? 'primary' : 'secondary'}
              disabled={acting === row.id}
              onClick={() => mark(row.id, opt.value)}
            />
          ))}
        </div>
      ) : null,
    },
  ];

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size={32} /></div>;
  }

  if (!detail) {
    return (
      <Card title="Roll call not found">
        <BackAction to={listPath} label="Back to roll calls" />
      </Card>
    );
  }

  const unresolved = (detail.entries || []).filter(
    (e) => e.status === 'not_yet_accounted_for' || e.status === 'unknown',
  ).length;

  return (
    <div>
      <PageHeader
        title="Roll Call"
        subtitle={`${detail.reason || 'Emergency'} — started ${formatDateTime(detail.started_at)}`}
        breadcrumbs={[
          { label: portalLabel, to: portalPath },
          { label: 'Roll Call', to: listPath },
          { label: 'Active' },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card title="Total" className="text-center"><p className="text-2xl font-bold">{detail.total}</p></Card>
        <Card title="Accounted for" className="text-center"><p className="text-2xl font-bold text-green-700">{detail.summary?.accounted_for || 0}</p></Card>
        <Card title="Unresolved" className="text-center"><p className="text-2xl font-bold text-amber-700">{unresolved}</p></Card>
        <Card title="Left site" className="text-center"><p className="text-2xl font-bold">{detail.summary?.left_site || 0}</p></Card>
      </div>

      <Card title={`Visitors (${detail.entries?.length || 0})`} className="mb-6">
        <DataTable columns={columns} data={detail.entries || []} emptyTitle="No visitors were on site" />
      </Card>

      {detail.status === 'active' && (
        <LoadingButton
          loading={closing}
          onClick={close}
          icon={XCircle}
          iconOnly
          variant="danger"
          aria-label="Close roll call"
        />
      )}
    </div>
  );
}
