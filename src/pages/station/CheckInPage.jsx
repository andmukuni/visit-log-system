import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Search } from 'lucide-react';
import {
  PageHeader,
  Card,
  FormField,
  LoadingButton,
  DataTable,
  StatusBadge,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { isCheckInEligible } from '../../../shared/visitCheckIn.js';
import { visitorApi } from '../../utils/visitorApi';

export default function CheckInPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [badges, setBadges] = useState([]);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState(null);
  const [selectedBadge, setSelectedBadge] = useState('');

  const loadBadges = async () => {
    try {
      const ref = await visitorApi.getReferenceData();
      setBadges(ref.badges || []);
    } catch {
      // ignore
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      await loadBadges();
      const rows = await visitorApi.lookupVisit(query.trim());
      setResults(rows.filter((v) => isCheckInEligible(v.status)));
      if (rows.length === 0) toast.info('No matching visits found.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleCheckIn = async (visitId) => {
    setCheckingIn(visitId);
    try {
      await visitorApi.checkInVisit(visitId, selectedBadge);
      toast.success('Visitor checked in successfully.');
      setResults((prev) => prev.filter((v) => v.id !== visitId));
      setSelectedBadge('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCheckingIn(null);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    { key: 'host_name', label: 'Host' },
    { key: 'pass_code', label: 'Pass code' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => (
        <LoadingButton
          loading={checkingIn === row.id}
          icon={LogIn}
          iconOnly
          aria-label="Check in"
          variant="primary"
          size="sm"
          onClick={() => handleCheckIn(row.id)}
        />
      ),
    },
  ];

  const badgeOptions = [{ value: '', label: 'No physical badge' }, ...badges.map((b) => ({ value: b.badge_number, label: b.badge_number }))];

  return (
    <div>
      <PageHeader
        title="Check-in"
        subtitle="Find an approved visitor and issue a badge"
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: 'Check-in' }]}
      />

      <Card title="Find visitor" className="mb-6">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-2xl">
          <div className="flex-1">
            <FormField label="Name, phone, badge or pass code" name="query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
          </div>
          <div className="flex items-end">
            <LoadingButton
              type="submit"
              loading={searching}
              icon={Search}
              iconOnly
              aria-label="Search"
              variant="primary"
            />
          </div>
        </form>
      </Card>

      {badges.length > 0 && (
        <Card title="Badge assignment" className="mb-6">
          <FormField label="Available badge (optional)" name="badge" type="select" value={selectedBadge} onChange={(e) => setSelectedBadge(e.target.value)} options={badgeOptions} />
        </Card>
      )}

      <Card title="Approved visitors">
        <DataTable
          columns={columns}
          data={results}
          emptyTitle="Search for a visitor"
          emptyDescription="Enter a name, phone number, badge or pass code above."
          onRowClick={(row) => navigate(`/station/visitors/${row.id}`)}
        />
      </Card>
    </div>
  );
}
