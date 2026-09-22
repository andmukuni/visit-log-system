import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader,
  Card,
  FormField,
  DataTable,
  Spinner,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { receptionApi } from '../../utils/visitorApi';

export default function ReceptionVisitorsDirectoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      const data = await receptionApi.getDirectory(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      toast.error(err.message || 'Unable to load visitors.');
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'phone', label: 'Phone', render: (value) => value || '—' },
    { key: 'company', label: 'Company', render: (value) => value || '—' },
    { key: 'email', label: 'Email', render: (value) => value || '—' },
    {
      key: 'id_number_masked',
      label: 'NRC',
      render: (value) => value || '—',
    },
    {
      key: 'visit_count',
      label: 'Visits',
      render: (value) => value || 0,
    },
    {
      key: 'last_visit_at',
      label: 'Last visit',
      render: (value) => (value ? formatDateTime(value) : '—'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visitors"
        subtitle="People already known at this desk. Check-in reuses a match on phone or NRC."
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Visitors' }]}
        actions={(
          <ActionToolbar>
            <RefreshAction onClick={load} loading={loading} />
          </ActionToolbar>
        )}
      />

      <Card className="mb-6">
        <FormField
          label="Search"
          name="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, phone, company, or email"
        />
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} visitor${rows.length === 1 ? '' : 's'}`}>
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle="No visitors yet"
            emptyDescription="People appear here after they are checked in or registered in your zone."
            onRowClick={(row) => navigate(`/reception/visitors?search=${encodeURIComponent(row.full_name || '')}`)}
          />
        </Card>
      )}
    </div>
  );
}
