import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Search } from 'lucide-react';
import {
  PageHeader,
  Card,
  FormField,
  LoadingButton,
  DataTable,
  VisitStatusBadge,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { getGateCheckoutActionLabel } from '../../../shared/visitCheckout.js';
import { visitorApi } from '../../utils/visitorApi';

export default function CheckOutPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [checkingOut, setCheckingOut] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const rows = await visitorApi.lookupVisit(query.trim(), undefined, 'checkout');
      setResults(Array.isArray(rows) ? rows : []);
      if (!rows?.length) {
        toast.info('No checked-in visitors found.');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleCheckOut = async (row) => {
    const visitId = row.id;
    const alreadyCheckedOut = row.status === 'checked_out';
    setCheckingOut(visitId);
    try {
      if (alreadyCheckedOut) {
        await visitorApi.markLeftPremises(visitId);
        toast.success('Visitor marked as left premises.');
      } else {
        await visitorApi.checkOutVisit(visitId);
        toast.success('Visitor checked out. Badge returned.');
      }
      setResults((prev) => prev.filter((v) => v.id !== visitId));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCheckingOut(null);
    }
  };

  const columns = [
    { key: 'full_name', label: 'Visitor', type: 'avatar' },
    { key: 'badge_number', label: 'Badge' },
    {
      key: 'checked_in_at',
      label: 'Checked in',
      render: (_, row) => formatDateTime(row.checked_in_at),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <VisitStatusBadge visit={row} />,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (_, row) => {
        const checkoutAction = getGateCheckoutActionLabel(row);
        return (
          <LoadingButton
            loading={checkingOut === row.id}
            icon={LogOut}
            iconOnly
            aria-label={checkoutAction.label}
            title={checkoutAction.label}
            variant="primary"
            size="sm"
            onClick={() => handleCheckOut(row)}
          />
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Check-out"
        subtitle="Record exit and return badge"
        breadcrumbs={[{ label: 'Station', to: '/station' }, { label: 'Check-out' }]}
      />

      <Card title="Find checked-in visitor" className="mb-6">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-2xl">
          <div className="flex-1">
            <FormField label="Name, phone or badge" name="query" value={query} onChange={(e) => setQuery(e.target.value)} />
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

      <Card title="Currently checked in">
        <DataTable
          columns={columns}
          data={results}
          emptyTitle="Search for a visitor"
          emptyDescription="Find a checked-in visitor to process their exit."
          onRowClick={(row) => navigate(`/station/visitors/${row.id}`)}
        />
      </Card>
    </div>
  );
}
