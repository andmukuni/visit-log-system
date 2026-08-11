import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Card, DataTable, Spinner } from '../../components/ui';
import { emergencyApi } from '../../utils/visitorApi';

const STATUS_LABELS = {
  not_yet_accounted_for: 'Not yet accounted for',
  unknown: 'Unknown',
};

export default function EmergencyUnresolvedPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [rollCallId, setRollCallId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await emergencyApi.getUnresolved();
      setRows(data.entries || []);
      setRollCallId(data.rollCallId || null);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

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
  ];

  return (
    <div>
      <PageHeader
        title="Unresolved Persons"
        subtitle="Visitors not yet accounted for in the active roll call"
        breadcrumbs={[{ label: 'Emergency', to: '/emergency' }, { label: 'Unresolved' }]}
      />

      {!loading && !rollCallId && (
        <Card title="No active roll call" className="mb-6">
          <p className="text-sm text-navy-600 mb-3">Start a roll call to track evacuation attendance.</p>
          <Link to="/emergency/roll-call" className="text-sm text-cyan-700 hover:underline">Go to roll call</Link>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} unresolved`}>
          <DataTable
            columns={columns}
            data={rows}
            emptyTitle="All accounted for"
            emptyDescription="No unresolved persons in the active roll call."
            onRowClick={(row) => {
              if (rollCallId) navigate(`/emergency/roll-call/${rollCallId}`);
              else if (row.visit_id) navigate(`/emergency/visitors/${row.visit_id}`);
            }}
          />
        </Card>
      )}
    </div>
  );
}
