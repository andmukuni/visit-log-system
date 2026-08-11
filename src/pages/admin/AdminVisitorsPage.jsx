import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader,
  Card,
  DataTable,
  Spinner,
  ActionToolbar,
  RefreshAction,
} from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';
import { useAdminOrganisation } from '../../context/AdminOrganisationContext';

export default function AdminVisitorsPage() {
  const navigate = useNavigate();
  const { queryParams, organisationId } = useAdminOrganisation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await visitorApi.getOrgVisitors(queryParams));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const showOrganisation = !organisationId && rows.some((row) => row.organisation_name);

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'company', label: 'Company' },
    ...(showOrganisation ? [{ key: 'organisation_name', label: 'Organisation' }] : []),
    { key: 'visit_count', label: 'Visits' },
    {
      key: 'last_visit_at',
      label: 'Last visit',
      render: (_, row) => (row.last_visit_at ? formatDateTime(row.last_visit_at) : '—'),
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (_, row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Visitors"
        subtitle={showOrganisation
          ? 'Visitor directory across all organisations'
          : 'Visitor directory for your organisation'}
        iconKey="visitors"
        actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} visitor${rows.length === 1 ? '' : 's'}`}>
          <DataTable
            embedded
            columns={columns}
            data={rows}
            emptyTitle="No visitors yet"
            emptyDescription="Registered visitor profiles will appear here."
            toolbar={{
              placeholder: 'Search name, phone, company, organisation…',
              searchKeys: ['full_name', 'phone', 'email', 'company', 'organisation_name'],
            }}
            onRowClick={(row) => {
              if (row.last_visit_id) navigate(`/admin/log-book/${row.last_visit_id}`);
            }}
          />
        </Card>
      )}
    </div>
  );
}
