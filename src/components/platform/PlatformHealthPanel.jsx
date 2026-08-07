import { useCallback, useEffect, useState } from 'react';
import { Card, Spinner } from '../ui';
import { platformApi } from '../../utils/visitorApi';

export default function PlatformHealthPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await platformApi.getHealth());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="API"><p className="text-lg font-semibold text-green-700">{data?.api || '—'}</p></Card>
      <Card title="Database"><p className="text-lg font-semibold text-green-700">{data?.database || '—'} ({data?.dbLatencyMs}ms)</p></Card>
      <Card title="Email provider">
        <p className="text-lg font-semibold capitalize">{data?.emailProvider || '—'}</p>
        <p className="text-sm text-navy-500 mt-1">{data?.emailConfigured ? `From ${data.emailFrom}` : 'Not configured'}</p>
      </Card>
      <Card title="SMS provider">
        <p className="text-lg font-semibold capitalize">{data?.smsProvider || '—'}</p>
        <p className="text-sm text-navy-500 mt-1">{data?.smsConfigured ? `From ${data.smsFrom}` : 'Not configured'}</p>
      </Card>
      <Card title="Pending deliveries"><p className="text-2xl font-bold">{data?.pendingNotificationDeliveries ?? '—'}</p></Card>
      <Card title="Failed deliveries"><p className="text-2xl font-bold text-red-600">{data?.failedNotificationDeliveries ?? '—'}</p></Card>
      <Card title="External delivered"><p className="text-2xl font-bold text-green-700">{data?.deliveredExternalNotifications ?? '—'}</p></Card>
      <Card title="Total notifications"><p className="text-2xl font-bold">{data?.totalNotifications ?? '—'}</p></Card>
      <Card title="Environment"><p className="text-sm text-navy-600">{data?.environment}</p></Card>
    </div>
  );
}
