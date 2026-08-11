import { Check, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Card, Spinner, LoadingButton, IconButton, ActionToolbar } from '../../components/ui';
import { toast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { notificationsApi } from '../../utils/visitorApi';

const CHANNELS = [
  { key: 'in_app', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
];

function prefEnabled(preferences, channel, categoryKey) {
  const exact = preferences.find(
    (p) => p.channel === channel && p.category_key === categoryKey,
  );
  if (exact) return Boolean(exact.enabled);
  const channelWide = preferences.find(
    (p) => p.channel === channel && p.category_key === '*',
  );
  if (channelWide) return Boolean(channelWide.enabled);
  return true;
}

function isOrgChannelOff(orgDefaults, channel, categoryKey) {
  if (channel === 'in_app') return orgDefaults.in_app_notifications === false;
  return orgDefaults[`${channel}_${categoryKey}`] === false;
}

export default function HostNotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [categories, setCategories] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [orgDefaults, setOrgDefaults] = useState({});
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsError, setPrefsError] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefDraft, setPrefDraft] = useState({});
  const [prefsOpen, setPrefsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await notificationsApi.list());
    } catch {
      setRows([]);
      toast.error('Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    setPrefsError(false);
    try {
      const data = await notificationsApi.getPreferences();
      setCategories(data?.categories || []);
      setPreferences(data?.preferences || []);
      setOrgDefaults(data?.org_defaults || {});

      const draft = {};
      for (const cat of data?.categories || []) {
        for (const ch of CHANNELS) {
          draft[`${ch.key}:${cat.key}`] = prefEnabled(data?.preferences || [], ch.key, cat.key);
        }
      }
      setPrefDraft(draft);
    } catch {
      setCategories([]);
      setPreferences([]);
      setPrefsError(true);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadPrefs();
  }, [load, loadPrefs]);

  const markAll = async () => {
    setMarking(true);
    try {
      await notificationsApi.markAllRead();
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not mark notifications read.');
    } finally {
      setMarking(false);
    }
  };

  const markOne = async (id) => {
    try {
      await notificationsApi.markRead(id);
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not mark notification read.');
    }
  };

  const dirtyPrefs = useMemo(() => {
    const next = [];
    for (const cat of categories) {
      for (const ch of CHANNELS) {
        if (isOrgChannelOff(orgDefaults, ch.key, cat.key)) continue;
        const key = `${ch.key}:${cat.key}`;
        const enabled = Boolean(prefDraft[key]);
        const previous = prefEnabled(preferences, ch.key, cat.key);
        if (enabled !== previous) {
          next.push({ channel: ch.key, category_key: cat.key, enabled });
        }
      }
    }
    return next;
  }, [categories, prefDraft, preferences, orgDefaults]);

  const savePrefs = async () => {
    if (!dirtyPrefs.length) return;
    setSavingPrefs(true);
    try {
      const all = [];
      for (const cat of categories) {
        for (const ch of CHANNELS) {
          if (isOrgChannelOff(orgDefaults, ch.key, cat.key)) continue;
          all.push({
            channel: ch.key,
            category_key: cat.key,
            enabled: Boolean(prefDraft[`${ch.key}:${cat.key}`]),
          });
        }
      }
      const updated = await notificationsApi.updatePreferences(all);
      setPreferences(updated || all);
      toast.success('Notification preferences saved.');
    } catch (err) {
      toast.error(err.message || 'Could not save preferences.');
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Visitor arrivals, approvals and alerts"
        breadcrumbs={[{ label: 'Host', to: '/host' }, { label: 'Notifications' }]}
        actions={(
          <ActionToolbar>
            <LoadingButton
              variant="secondary"
              icon={CheckCheck}
              iconOnly
              loading={marking}
              aria-label="Mark all read"
              onClick={markAll}
            />
          </ActionToolbar>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <Card title={`${rows.length} notifications`} className="mb-6">
          <ul className="divide-y divide-navy-100">
            {rows.length === 0 && (
              <li className="py-8 text-center text-sm text-navy-400">No notifications yet.</li>
            )}
            {rows.map((n) => (
              <li key={n.id} className={`py-4 ${n.read_at ? 'opacity-60' : ''}`}>
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-navy-900">{n.title}</p>
                    <p className="text-sm text-navy-600 mt-1 whitespace-pre-wrap break-words">{n.body}</p>
                    <p className="text-xs text-navy-400 mt-2">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <IconButton
                      icon={Check}
                      label="Mark read"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => markOne(n.id)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="My notification preferences"
        actions={(
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-navy-600 hover:text-navy-900"
            onClick={() => setPrefsOpen((open) => !open)}
            aria-expanded={prefsOpen}
          >
            {prefsOpen ? 'Hide' : 'Show'}
            {prefsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      >
        <p className="text-sm text-navy-600 mb-4">
          Mute channels for yourself. Organisation defaults still apply first — if email or SMS is off for your org, it stays off.
        </p>

        {!prefsOpen ? (
          <p className="text-sm text-navy-500">
            {prefsError
              ? 'Preferences could not be loaded. Expand to retry.'
              : 'Expand to manage email, SMS, and in-app alerts per event.'}
          </p>
        ) : prefsLoading ? (
          <div className="flex justify-center py-8"><Spinner size={24} /></div>
        ) : prefsError ? (
          <div className="space-y-3">
            <p className="text-sm text-red-600">Could not load your preferences.</p>
            <LoadingButton variant="secondary" onClick={loadPrefs}>
              Retry
            </LoadingButton>
          </div>
        ) : categories.length === 0 ? (
          <p className="text-sm text-navy-500">No notification categories available.</p>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.key} className="rounded-xl border border-navy-100 p-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-navy-900">{cat.label}</p>
                  {cat.description && (
                    <p className="text-xs text-navy-500">{cat.description}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CHANNELS.map((ch) => {
                    const orgOff = isOrgChannelOff(orgDefaults, ch.key, cat.key);
                    const draftOn = Boolean(prefDraft[`${ch.key}:${cat.key}`]);
                    const checked = orgOff ? false : draftOn;
                    return (
                      <label
                        key={ch.key}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                          orgOff
                            ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-navy-400'
                            : 'cursor-pointer border-navy-100 bg-navy-50/40 text-navy-800 hover:border-navy-200'
                        }`}
                      >
                        <span>
                          {ch.label}
                          {orgOff ? (
                            <span className="block text-xs text-navy-400">Off for organisation</span>
                          ) : null}
                        </span>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
                          checked={checked}
                          disabled={orgOff}
                          onChange={(e) => setPrefDraft((prev) => ({
                            ...prev,
                            [`${ch.key}:${cat.key}`]: e.target.checked,
                          }))}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <LoadingButton
              loading={savingPrefs}
              disabled={!dirtyPrefs.length}
              onClick={savePrefs}
            >
              Save preferences
            </LoadingButton>
          </div>
        )}
      </Card>
    </div>
  );
}
