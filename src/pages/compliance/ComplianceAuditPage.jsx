import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, FormField, IconButton, LoadingButton } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { complianceApi } from '../../utils/visitorApi';

export default function ComplianceAuditPage() {
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      setData(await complianceApi.getAudit({
        page,
        action: action || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }));
    } catch {
      setData({ rows: [], total: 0, page: 1, limit: 50 });
    } finally {
      setLoading(false);
    }
  }, [action, dateFrom, dateTo]);

  useEffect(() => {
    load(1);
  }, [load]);

  const columns = [
    {
      key: 'created_at',
      label: 'Timestamp',
      render: (_, row) => formatDateTime(row.created_at),
    },
    { key: 'action', label: 'Action' },
    { key: 'actor_name', label: 'User' },
    { key: 'target_type', label: 'Target' },
    { key: 'target_id', label: 'Target ID' },
    { key: 'result', label: 'Result' },
  ];

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        subtitle="Immutable log of system actions — read-only"
        breadcrumbs={[{ label: 'Compliance', to: '/compliance' }, { label: 'Audit Trail' }]}
      />

      <Card title="Filters" className="mb-6">
        <form
          className="grid grid-cols-1 md:grid-cols-4 gap-3"
          onSubmit={(e) => { e.preventDefault(); load(1); }}
        >
          <FormField name="action" label="Action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. visit.register" />
          <FormField name="dateFrom" label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <FormField name="dateTo" label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <div className="flex items-end">
            <LoadingButton type="submit" loading={loading} icon={Search} iconOnly aria-label="Search" />
          </div>
        </form>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${data.total} event${data.total === 1 ? '' : 's'}`}>
          <DataTable columns={columns} data={data.rows} emptyTitle="No audit events" />
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-navy-100">
              <IconButton
                icon={ChevronLeft}
                label="Previous"
                tooltip="Previous"
                variant="secondary"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => load(data.page - 1)}
              />
              <span className="text-sm text-navy-500">Page {data.page} of {totalPages}</span>
              <IconButton
                icon={ChevronRight}
                label="Next"
                tooltip="Next"
                variant="secondary"
                size="sm"
                disabled={data.page >= totalPages}
                onClick={() => load(data.page + 1)}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
