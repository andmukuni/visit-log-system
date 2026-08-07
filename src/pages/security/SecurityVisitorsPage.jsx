import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, StatusBadge, Spinner, FormField, LoadingButton } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';
import { securityApi } from '../../utils/visitorApi';

export default function SecurityVisitorsPage() {
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

  const showOrganisation = visits.some((row) => row.organisation_name);

  const columns = [
    { key: 'full_name', label: 'Visitor' },
    { key: 'phone', label: 'Phone' },
    { key: 'company', label: 'Company' },
    { key: 'host_name', label: 'Host' },
    ...(showOrganisation ? [{ key: 'organisation_name', label: 'Organisation' }] : []),
    { key: 'site_name', label: 'Site' },
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
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Visitors"
        subtitle={showOrganisation
          ? 'Search visits across all organisations'
          : 'Search visits within your security scope'}
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
            placeholder="Name, phone, company or pass code"
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
              searchKeys: ['full_name', 'phone', 'company', 'host_name', 'organisation_name', 'site_name'],
            }}
          />
        </Card>
      )}
    </div>
  );
}
