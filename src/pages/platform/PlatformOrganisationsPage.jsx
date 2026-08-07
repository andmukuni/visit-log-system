import { useCallback, useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { PageHeader, Card, DataTable, Spinner, StatusBadge, IconButton } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformOrganisationsPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await platformApi.getOrganisations());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (row) => {
    const next = row.status === 'active' ? 'suspended' : 'active';
    try {
      await platformApi.updateOrganisation(row.id, { status: next });
      toast.success(`Organisation ${next === 'active' ? 'activated' : 'suspended'}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'slug', label: 'Slug' },
    { key: 'site_count', label: 'Sites' },
    { key: 'user_count', label: 'Users' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => formatDateTime(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => {
        const label = row.status === 'active' ? 'Suspend' : 'Activate';
        return (
          <IconButton
            icon={row.status === 'active' ? Pause : Play}
            label={label}
            tooltip={label}
            variant="ghost"
            size="sm"
            onClick={() => toggleStatus(row)}
          />
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Organisations"
        subtitle="Manage tenant organisations on the platform"
        breadcrumbs={[{ label: 'Platform', to: '/platform' }, { label: 'Organisations' }]}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} organisations`}>
          <DataTable columns={columns} data={rows} emptyTitle="No organisations" />
        </Card>
      )}
    </div>
  );
}
