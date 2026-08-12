import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, DataTable, StatusBadge, Spinner, FormField, LoadingButton } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityVisitorsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q) => {
    setLoading(true);
    setSearched(true);
    try {
      setVisits(await securityApi.getVisitors(q));
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search('');
  }, [search]);

  // Gate-operational view only — no phone/email/company here (Logic.md).
  const columns = [
    { key: 'visitor_name', label: 'Visitor' },
    { key: 'host_name', label: 'Host' },
    {
      key: 'destination',
      label: 'Destination',
      render: (_, row) => row.destination_building_name || row.destination_office_number
        ? [row.destination_building_name, row.destination_office_number].filter(Boolean).join(' · ')
        : '—',
    },
    { key: 'gate_name', label: 'Gate' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'expected_at',
      label: 'Expected',
      render: (_, row) => (row.expected_at ? formatDateTime(row.expected_at) : '—'),
    },
    { key: 'plate_numbers', label: 'Vehicle' },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Visitors"
        subtitle="Search visits within your assigned site, building, or gate"
        iconKey="visitors"
      />
      <Card className="mb-6">
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            search(query.trim());
          }}
        >
          <FormField
            name="query"
            label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or pass code"
          />
          <LoadingButton type="submit" variant="secondary" icon={Search} iconOnly loading={loading} aria-label="Search" className="self-end" />
        </form>
      </Card>
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={searched ? `${visits.length} result${visits.length === 1 ? '' : 's'}` : 'Recent visits'}>
          <DataTable
            embedded
            columns={columns}
            data={visits}
            emptyTitle="No matches"
            emptyDescription="Try a different search term."
            toolbar={{
              placeholder: 'Filter results…',
              searchKeys: ['visitor_name', 'host_name', 'gate_name'],
            }}
            onRowClick={(row) => navigate(`/security/visitors/${row.id}`)}
          />
        </Card>
      )}
    </div>
  );
}
