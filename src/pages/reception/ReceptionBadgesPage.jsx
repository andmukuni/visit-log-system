import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, Spinner, ActionToolbar, RefreshAction } from '../../components/ui';
import { receptionApi } from '../../utils/visitorApi';

export default function ReceptionBadgesPage() {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ref = await receptionApi.getReferenceData();
      setBadges(ref.badges || []);
    } catch {
      setBadges([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: 'badge_number', label: 'Badge number' },
    { key: 'status', label: 'Status' },
  ];

  return (
    <div>
      <PageHeader
        title="Badge Desk"
        subtitle="Available visitor passes for reception check-in"
        breadcrumbs={[{ label: 'Reception', to: '/reception' }, { label: 'Badges' }]}
        actions={<ActionToolbar><RefreshAction onClick={load} loading={loading} /></ActionToolbar>}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={badges}
            emptyTitle="No badges available"
            emptyDescription="Issue passes from check-in when badges are configured for your organisation."
          />
        </Card>
      )}
    </div>
  );
}
